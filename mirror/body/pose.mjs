const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const length=v=>Math.hypot(...v);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const ids={leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,leftHip:23,rightHip:24};

// MediaPipe world landmarks are hip-relative, not a camera/world position.
// Anchor their relative shape to the tracked eyes. Never add hip coordinates
// directly to the first-person camera or rotate translation by the look gain.
export function upperBodyPose(image,world) {
  if(!image||!world) return null;
  const visible=i=>finite(world[i])&&finite(image[i])&&
    (image[i].visibility??0)>.55&&(image[i].presence??1)>.5&&
    image[i].x>=0&&image[i].x<=1&&image[i].y>=0&&image[i].y<=1;
  if(![2,5,11,12].every(visible)) return null;
  const eye=mid([world[2].x,world[2].y,world[2].z],[world[5].x,world[5].y,world[5].z]);
  const joints={};
  for(const [name,i] of Object.entries(ids)) {
    if(!visible(i)){joints[name]=null;continue;}
    const p=world[i];
    const relative=[eye[0]-p.x,eye[1]-p.y,p.z-eye[2]];
    joints[name]=length(relative)<1.6?relative:null;
  }
  if(!joints.leftShoulder||!joints.rightShoulder) return null;
  const width=length(sub(joints.leftShoulder,joints.rightShoulder));
  if(width<.16||width>.8) return null;
  const shoulder=mid(joints.leftShoulder,joints.rightShoulder);
  let hipsTracked=!!(joints.leftHip&&joints.rightHip);
  let hip=hipsTracked?mid(joints.leftHip,joints.rightHip):null;
  if(hip&&(shoulder[1]-hip[1]<.12||shoulder[1]-hip[1]>.9)){
    joints.leftHip=joints.rightHip=null;hipsTracked=false;hip=null;
  }
  return {joints,width,shoulder,hip,hipsTracked};
}

const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
export class BodyPose {
  constructor(mode='seated'){this.mode=mode;this.recenter();}
  recenter(mode=this.mode){
    this.mode=mode;this.samples=[];this.neutral=null;this.seen=-Infinity;
    this.target=null;this.joints={};this.hipsTracked=false;this.signals=null;this.seatHips=null;
  }
  receive(p,now){
    if(!p) return;
    // Keep seated proportions and seat anchor through desk/arm occlusion.
    if(now-this.seen>1500){this.target=null;this.joints={};}
    if(now-this.seen>500&&!this.neutral)this.samples=[];
    this.seen=now;this.hipsTracked=p.hipsTracked;
    if(!this.neutral){
      // Standing crouch/torso calibration requires visible hips; seated does not.
      if(this.mode==='standing'&&!p.hipsTracked) return;
      this.samples.push(p);
      if(this.samples.length<12) return;
      const reference=sub(p.joints.rightShoulder,p.joints.leftShoulder);
      this.neutral={width:median(this.samples.map(s=>s.width)),yaw:Math.atan2(reference[2],reference[0]),
        roll:Math.atan2(reference[1],Math.hypot(reference[0],reference[2])),
        lean:p.hip?sub(p.shoulder,p.hip):[0,.43,0],
        shoulder:[0,1,2].map(i=>median(this.samples.map(s=>s.shoulder[i]))),
        torso:median(this.samples.map(s=>s.hip?s.shoulder[1]-s.hip[1]:.43))};
    }
    // Keep proportions stable across frames instead of breathing with model scale.
    const scale=clamp(this.neutral.width/p.width,.8,1.25);
    const joints=Object.fromEntries(Object.entries(p.joints).map(([k,v])=>[k,v?.map(n=>n*scale)??null]));
    if(this.mode==='seated'||!p.hipsTracked){
      // A neutral lower torso is explicitly inferred when seated behind a desk.
      // In standing mode hide the body until hips return (head stays live).
      if(this.mode==='standing'){this.target=null;return;}
      const center=mid(joints.leftShoulder,joints.rightShoulder);
      const across=sub(joints.leftShoulder,joints.rightShoulder);
      for(const [key,sign] of [['leftHip',1],['rightHip',-1]])
        joints[key]=center.map((v,i)=>v+sign*across[i]*.36-(i===1?this.neutral.torso:0));
    }
    this.target=joints;
    const across=sub(joints.rightShoulder,joints.leftShoulder);
    const shoulders=mid(joints.leftShoulder,joints.rightShoulder), hips=mid(joints.leftHip,joints.rightHip);
    const angle=Math.atan2(across[2],across[0])-this.neutral.yaw;
    this.signals={yaw:Math.atan2(Math.sin(angle),Math.cos(angle)),
      roll:Math.atan2(across[1],Math.hypot(across[0],across[2]))-this.neutral.roll,
      leanX:shoulders[0]-hips[0]-this.neutral.lean[0],leanZ:shoulders[2]-hips[2]-this.neutral.lean[2],hipsTracked:p.hipsTracked};
  }
  update(now,dt,enabled=true,eyePosition=[0,0,0]){
    if(!enabled||now-this.seen>500||!this.target){this.joints={};this.signals=null;return null;}
    const a=1-Math.exp(-Math.min(dt,.1)/.035);
    for(const [key,p] of Object.entries(this.target)){
      if(!p){this.joints[key]=null;continue;}
      const old=this.joints[key];
      this.joints[key]=old?p.map((v,i)=>old[i]+(v-old[i])*a):[...p];
    }
    if(this.mode==='seated'){
      this.seatHips??=Object.fromEntries(['leftHip','rightHip'].map(key=>[key,this.joints[key].map((v,i)=>v+eyePosition[i])]));
      for(const key of ['leftHip','rightHip'])this.joints[key]=this.seatHips[key].map((v,i)=>v-eyePosition[i]);
    }
    return this.joints;
  }
}
