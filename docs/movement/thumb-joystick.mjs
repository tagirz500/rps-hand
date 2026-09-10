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
export function thumbVector(point,centre){
 if(!point||!centre||![...point,...centre].every(Number.isFinite))return null;
 const x=point[0]-centre[0],z=point[1]-centre[1],r=Math.hypot(x,z);
 if(r<=.14)return {x:0,z:0};
 // Full walking speed at the circle edge; a short extra reach boosts to 160%.
 const magnitude=r<=.5?(r-.14)/.36:1+Math.min(.6,(r-.5)*2);
 return {x:x/r*magnitude,z:z/r*magnitude};
}
export class ThumbJoystick {
 constructor(){this.size=.8;this.speed=4.5;this.reset();}
 reset(){this.centre=null;this.scale=null;this.needsRest=true;this.settling=[];this.seen=-Infinity;this.stop('SHOW THUMB');}
 stop(reason){this.x=this.z=0;this.raw={x:0,z:0};this.candidate=null;this.lastTilt=null;this.reason=reason;}
 receive(sample,time){
  if(!valid(sample)){this.stop('TRACKING LOST');this.needsRest=true;this.settling=[];this.seen=-Infinity;return;}
  if(time<=this.seen)return;
  const elapsed=time-this.seen;if(elapsed>450){this.needsRest=true;this.stop('RETURN THUMB TO CENTRE');this.settling=[];}this.seen=time;
  const t=sample.point;
  // First visible thumb places the fixed circle, with no timed pose setup.
  if(!this.centre){
   this.centre=[...t];this.scale=sample.scale;
   if(sample.rest)this.centre[1]-=.35*this.scale;
   this.needsRest=false;this.stop('READY');return;
  }
  if(sample.rest){this.needsRest=false;this.stop('FIST REST');return;}
  const offset=t.map((v,i)=>(v-this.centre[i])/this.effectiveScale);
  if(this.needsRest){
   if(Math.hypot(...offset)>.20){this.stop('RETURN THUMB TO CENTRE');return;}
   this.needsRest=false;this.stop('NEUTRAL');return;
  }
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
   if(this.candidate.count<2||time-this.candidate.since<25){if(!active)this.reason='CONFIRMING TILT';return;}
  }
  this.candidate=null;const alpha=active?1-Math.exp(-Math.min(100,elapsed)/18):1;
  this.x+=(v.x-this.x)*alpha;this.z+=(v.z-this.z)*alpha;this.lastTilt=t;this.reason='MOVING';
 }
 get effectiveScale(){return this.scale===null?null:this.scale*this.size;}
 setSize(value){if(!Number.isFinite(value))return;this.size=Math.max(.35,Math.min(1.6,value));this.needsRest=true;this.stop('RETURN THUMB TO CENTRE');}
 get direction(){return Math.hypot(this.x,this.z)>.01?[this.z<-.05?'FORWARD':this.z>.05?'BACKWARD':'',this.x<-.05?'LEFT':this.x>.05?'RIGHT':''].filter(Boolean).join(' '):null;}
 step(now,dt=.016){if(now-this.seen>450){this.needsRest=true;this.settling=[];this.stop('TRACKING LOST');}const d=this.speed*Math.min(.05,Math.max(0,dt));return {dx:this.x*d,dz:this.z*d};}
}
