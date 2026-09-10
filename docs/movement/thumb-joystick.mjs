export function measureThumb(image,world,aspect=4/3){
 if(image?.length!==21||world?.length!==21||!world.every(p=>[p.x,p.y,p.z].every(Number.isFinite))||!image.every(p=>[p.x,p.y].every(Number.isFinite)))return null;
 const d=(a,b)=>Math.hypot(world[a].x-world[b].x,world[a].y-world[b].y,world[a].z-world[b].z);
 const reach=m=>d(m,m+3)/(d(m,m+1)+d(m+1,m+2)+d(m+2,m+3)||1);
 if([5,9,13,17].every(m=>reach(m)>.94))return null;
 // Track thumb base (2) to tip (4).
 const span=(Math.hypot(image[0].x-image[9].x,(image[0].y-image[9].y)/aspect)+Math.hypot(image[5].x-image[17].x,(image[5].y-image[17].y)/aspect))/2;
 if(span<.015)return null;
 const palm=(d(0,9)+d(5,17))/2;if(palm<.005)return null;
 // A thumb lying against the closed fingers is a release, never a direction.
 // Measure along the knuckle row so this does not depend on screen rotation/mirroring.
 const row=[image[17].x-image[5].x,(image[17].y-image[5].y)/aspect];
 const row2=row[0]**2+row[1]**2;
 const along=row2>1e-8?((image[4].x-image[6].x)*row[0]+(image[4].y-image[6].y)/aspect*row[1])/row2:-Infinity;
 const wrapped=[5,9,13,17].filter(m=>reach(m)<.82).length>=3&&along>-.16&&d(4,6)/d(5,17)<.72;
 // Absolute mirrored camera position. The joystick anchor is captured once.
 return {rest:wrapped,scale:span,point:[1-image[4].x,image[4].y/aspect]};
}
const valid=s=>s?.point?.length===2&&s.point.every(Number.isFinite)&&Number.isFinite(s.scale)&&s.scale>0;
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export function thumbVector(point,centre){
 if(!point||!centre||![...point,...centre].every(Number.isFinite))return null;
 const x=point[0]-centre[0],z=point[1]-centre[1],r=Math.hypot(x,z);
 if(r<=.14)return {x:0,z:0};
 // Full walking speed at the circle edge; a short extra reach boosts to 160%.
 const magnitude=r<=.5?(r-.14)/.36:1+Math.min(.6,(r-.5)*2);
 return {x:x/r*magnitude,z:z/r*magnitude};
}
export class ThumbJoystick {
 constructor(){this.size=.55;this.speed=4.5;this.reset();}
 reset(){this.centre=null;this.scale=null;this.needsRest=true;this.settling=[];this.seen=-Infinity;this.stop('SHOW RELAXED FIST');}
 stop(reason){this.x=this.z=0;this.raw={x:0,z:0};this.candidate=null;this.lastTilt=null;this.reason=reason;}
 receive(sample,time){
  if(!valid(sample)){this.stop('TRACKING LOST');this.needsRest=true;this.settling=[];this.seen=-Infinity;return;}
  if(time<=this.seen)return;
  const elapsed=time-this.seen;if(elapsed>250){this.needsRest=true;this.stop('SHOW FIST TO RESUME');this.settling=[];}this.seen=time;
  const t=sample.point;
  // Capture only an actual resting fist. A held steering pose must never
  // silently become the neutral reference.
  if(sample.rest){
   if(this.centre){this.needsRest=false;this.stop('FIST REST');return;}
   this.stop('HOLD FIST STILL');
   if(this.settling.length&&distance(t,this.settling[0].point)>sample.scale*.1)this.settling=[];
   this.settling.push({point:[...t],scale:sample.scale,time});
   if(this.settling.length>=5&&time-this.settling[0].time>=350){
    this.centre=[0,1].map(i=>this.settling.map(p=>p.point[i]).sort((a,b)=>a-b)[Math.floor(this.settling.length/2)]);
    this.scale=this.settling.map(p=>p.scale).sort((a,b)=>a-b)[Math.floor(this.settling.length/2)];
    this.centre[1]-=.35*this.scale; // Circle sits above the resting fist.
    this.needsRest=false;this.settling=[];this.stop('FIST REST · CENTRE SAVED');
   }else if(this.centre)this.reason='FIST REST · CENTRE SAVED';
   return;
  }
  this.settling=[];
  if(!this.centre){this.stop('SHOW RELAXED FIST FIRST');return;}
  if(this.needsRest){this.stop('SHOW FIST TO RESUME');return;}
  const offset=t.map((v,i)=>(v-this.centre[i])/this.effectiveScale);
  const active=Math.hypot(this.x,this.z)>.01;
  // Keep the learned fist reference fixed while the thumb is steering.
  if(!active&&Math.hypot(...offset)<.20){this.stop('NEUTRAL');return;}
  const v=thumbVector(offset,[0,0]);if(!v){this.stop('THUMB UNCLEAR');return;}this.raw={...v};
  if(Math.hypot(v.x,v.z)<.001){this.stop('NEUTRAL');return;}
  const change=Math.hypot(v.x-this.x,v.z-this.z);
  if(active&&Math.hypot(v.x,v.z)>=Math.hypot(this.x,this.z)&&change<.07){this.candidate=null;return;}
  if(!active||change>.8){
   const agreement=this.candidate?(v.x*this.candidate.x+v.z*this.candidate.z)/(Math.hypot(v.x,v.z)*Math.hypot(this.candidate.x,this.candidate.z)):-1;
   if(!this.candidate||agreement<Math.cos(Math.PI/5))this.candidate={...v,since:time,count:1};else this.candidate.count++;
   if(this.candidate.count<2||time-this.candidate.since<70){if(!active)this.reason='CONFIRMING TILT';return;}
  }
  this.candidate=null;const alpha=active?1-Math.exp(-Math.min(100,elapsed)/30):1;
  this.x+=(v.x-this.x)*alpha;this.z+=(v.z-this.z)*alpha;this.lastTilt=t;this.reason='MOVING';
 }
 get effectiveScale(){return this.scale===null?null:this.scale*this.size;}
 setSize(value){if(!Number.isFinite(value))return;this.size=Math.max(.35,Math.min(1.6,value));this.needsRest=true;this.stop('SHOW FIST TO RESUME');}
 get direction(){return Math.hypot(this.x,this.z)>.01?[this.z<-.05?'FORWARD':this.z>.05?'BACKWARD':'',this.x<-.05?'LEFT':this.x>.05?'RIGHT':''].filter(Boolean).join(' '):null;}
 step(now,dt=.016){if(now-this.seen>250){this.needsRest=true;this.settling=[];this.stop('TRACKING LOST');}const d=this.speed*Math.min(.05,Math.max(0,dt));return {dx:this.x*d,dz:this.z*d};}
}
