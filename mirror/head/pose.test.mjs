import assert from 'node:assert/strict';
import { facePose, ViewPose, WindowPose, windowFrustum, firstPersonOrigin, gentleHeadTranslation } from './pose.mjs';
const mesh = (yaw=0, pitch=0, aspect=4/3) => {
  const p = Array.from({length:478}, () => ({x:.5,y:.5,z:0}));
  for (const [i,x,y] of [[234,-.15,0],[454,.15,0],[10,0,-.2],[152,0,.2]]) {
    const yy=y*Math.cos(pitch), z=y*Math.sin(pitch);
    p[i]={x:.5+x*Math.cos(yaw)+z*Math.sin(yaw),y:.5+yy*aspect,z:-x*Math.sin(yaw)+z*Math.cos(yaw)};
  }
  return p;
};
for (const aspect of [4/3, 3/4, 16/9]) {
  const p=facePose(mesh(.3,0,aspect),aspect);
  assert.ok(Math.abs(p.yaw-.3)<1e-8); assert.ok(Math.abs(p.pitch)<1e-8);
}
assert.equal(facePose([]),null);
const v=new ViewPose(), neutral=facePose(mesh());
v.receive(neutral,0); v.receive(facePose(mesh(.3,0)),100);
assert.ok(v.update(100,.1).yaw<0);
v.recenter(); v.receive(facePose(mesh(.3,0)),200);
for(let i=0;i<40;i++) v.update(200,.1);
assert.ok(Math.abs(v.yaw)<1e-8);
v.receive({...neutral,yaw:20,pitch:20},300);
for(let i=0;i<40;i++) v.update(300,.1);
assert.ok(Math.abs(v.yaw)<=.24 && Math.abs(v.pitch)<=.18);
for(let i=0;i<40;i++) v.update(2000,.1);
assert.ok(Math.abs(v.yaw)<1e-8 && Math.abs(v.pitch)<1e-8);
v.receive({...neutral,yaw:.6},2200); assert.equal(v.neutral.yaw,.6);
v.mode='off'; assert.deepEqual(v.update(2200,.1),{yaw:0,pitch:0});
console.log('PASS: orientation, aspect, recenter, limits, dropout and fixed mode');
const w=new WindowPose(), base={centerX:.5,centerY:.5,span:.2};
w.receive(base,0,4/3,Math.PI/3);
w.receive({...base,centerX:.6,centerY:.6,span:.25},100,4/3,Math.PI/3);
const eye=w.update(100,.1); assert.ok(eye[0]<0 && eye[1]<0 && eye[2]<0);
w.recenter(); w.receive(base,200,4/3,Math.PI/3);
assert.deepEqual(w.target,[0,0,0].map((_,i)=>i<2?-0:0));
for(const e of [[0,0,0],[.15,-.1,.2],[-.15,.1,-.18]]) {
  const f=windowFrustum(e,50,1.5,1,.05), halfY=.35*Math.tan(25*Math.PI/180), halfX=halfY*1.5;
  // Project a point on the fixed screen through the shifted near-plane frustum.
  const ndc=(x,y,z)=>{
    const q=.05/(-z+e[2]);
    return [2*((x-e[0])*q-f.left)/(f.right-f.left)-1,2*((y-e[1])*q-f.bottom)/(f.top-f.bottom)-1];
  };
  const corner=ndc(halfX,halfY,-.35);
  assert.ok(Math.abs(corner[0]-1)<1e-8 && Math.abs(corner[1]-1)<1e-8);
  if(e[0]!==0) assert.ok(Math.abs(ndc(0,0,-1)[0]-ndc(0,0,-.35)[0])>.01);
}
assert.deepEqual(w.update(2000,.1,false),[0,0,0]);
console.log('PASS: 3-axis eye movement, recenter, fixed screen corners, depth parallax, off reset');
const origin=firstPersonOrigin({centerX:.5,centerY:.5,span:.15},4/3,Math.PI/3);
assert.ok(origin[2]>.4 && origin[2]<.6);
// A hand between face and phone ends up ahead of the eye after R_y(pi).
const rawHand=[.1,0,-.25], transformed=[-rawHand[0]-origin[0],rawHand[1]-origin[1],-rawHand[2]-origin[2]];
assert.ok(transformed[0]<0 && transformed[2]<0);
const fp=new ViewPose(); fp.mode='first'; fp.receive(neutral,0); fp.receive({...neutral,yaw:.5,pitch:.3},100);
for(let i=0;i<40;i++) fp.update(100,.1);
assert.ok(fp.yaw < -2.3 && fp.yaw >= -Math.PI && fp.pitch > .8 && fp.pitch <= 1.3);
console.log('PASS: first-person eye depth, hand coordinate conversion and combined look mode');

for(const degrees of [20,38,60]) {
  const look=new ViewPose(); look.mode='first'; look.receive(neutral,0);
  look.receive({...neutral,yaw:degrees*Math.PI/180},100);
  for(let i=0;i<40;i++) look.update(100,.1);
  const expected=Math.min(Math.PI,(degrees*Math.PI/180-.025)*5);
  assert.ok(Math.abs(look.yaw+expected)<1e-8);
  assert.ok(Math.abs(look.physicalYaw+degrees*Math.PI/180)<1e-8);
}
const quiet=new ViewPose();quiet.mode='first';quiet.receive(neutral,0);
quiet.receive({...neutral,yaw:.01,pitch:.01,eyeX:1,eyeY:1},100);
assert.deepEqual(quiet.update(100,.1),{yaw:0,pitch:0});
assert.ok(!('eyeX' in facePose(mesh())) && !('blink' in facePose(mesh())));
console.log('PASS: screen-friendly turn gain, rear view, physical avatar angle, dead zone and no gaze input');
const forward=gentleHeadTranslation([0,0,-.1],.45);
const backward=gentleHeadTranslation([0,0,.1],.45);
assert.ok(Math.abs(forward[2]+.2)<1e-8 && Math.abs(backward[2]-.2)<1e-8);
assert.deepEqual(gentleHeadTranslation([0,0,0],.45),[0,0,0]);
const turned=gentleHeadTranslation([0,0,-.1],.45);
assert.ok(Math.abs(turned[0])<1e-8 && Math.abs(turned[2]+.2)<1e-8);
assert.ok(Math.abs(gentleHeadTranslation([0,0,-10],.9)[2])<=.50);
console.log('PASS: gentle forward/backward lean, return to neutral, angle-independent position, bounded travel');
assert.ok(gentleHeadTranslation([.1,0,0],.45)[0]>0 && gentleHeadTranslation([-.1,0,0],.45)[0]<0);
const offset=[.1,.02,-.1];
assert.deepEqual(gentleHeadTranslation(offset,.45,1,2),[.1,.04,-.2]);
assert.deepEqual(gentleHeadTranslation(offset,.45,2,1),[.2,.04,-.1]);
assert.deepEqual(gentleHeadTranslation(offset,.45,0,0).map(v=>v===0?0:v),[0,.04,0]);
assert.deepEqual(gentleHeadTranslation(offset,.45,NaN,NaN),gentleHeadTranslation(offset,.45));
assert.deepEqual(gentleHeadTranslation([1,1,1],.9,4,4),[.5,.3,.5]);
console.log('PASS: independent lateral/depth gains, zero disables each axis, defaults and limits');
console.log('PASS: left/right movement and position independent of head angle');

const responsive=new ViewPose();responsive.mode='first';responsive.sensitivity=1.5;responsive.receive(neutral,0);responsive.receive({...neutral,yaw:.3},20);responsive.update(20,.016);assert.ok(Math.abs(responsive.yaw)>.28);responsive.update(36,.016);assert.ok(Math.abs(responsive.yaw)>.36);console.log('PASS: rapid head motion reaches over 85 percent of target within two 60Hz frames');

assert.deepEqual(gentleHeadTranslation([.1,.02,-.1],.45,2,2,1),[.2,.02,-.2]);
assert.deepEqual(gentleHeadTranslation([.1,.02,-.1],.45,2,2,0),[.2,0,-.2]);
assert.deepEqual(gentleHeadTranslation([0,-.02,0],.45,2,2,4),[0,-.08,0]);
assert.equal(gentleHeadTranslation([0,1,0],.9,2,2,4)[1],.3);
console.log('PASS: independent vertical gain, disabled vertical movement, down direction and travel cap');
