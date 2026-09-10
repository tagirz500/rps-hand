import assert from 'node:assert/strict';
import {relativeAngles} from './orientation.mjs';
import {SpatialPose,fitHead,project,template} from './spatial.mjs';
import {ViewPose} from './pose.mjs';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const neutral of [[0,0,0],[.25,-.2,.8],[0,0,Math.PI/2]]){
 const r=relativeAngles(neutral,neutral);Object.values(r).forEach(v=>near(v,0));
}
near(relativeAngles([0,.3,0],[0,0,0]).yaw,-.3);
near(relativeAngles([.3,0,0],[0,0,0]).pitch,-.3);
near(relativeAngles([0,0,1.1],[0,0,.8]).roll,.3);
// A sideways face still fits translation independently from rotation.
const aspect=4/3,focal=1/(2*Math.tan(Math.PI/6)),parameters=[.12,.2,1.35,.015,-.01,.6];
const points=Array.from({length:468},()=>({x:.5,y:.5,z:0}));
for(const {id,point} of template){const uv=project(point,parameters,focal);points[id]={x:uv[0]+.5,y:uv[1]*aspect+.5,z:0};}
const fit=fitHead(points,aspect,{yaw:.2,pitch:-.12,span:.09*focal/.6,centerX:.5+focal*.015/.6,centerY:.5-aspect*focal*.01/.6});
assert.ok(fit);fit.position.forEach((v,i)=>near(v,parameters[i+3],.001));
const s=new SpatialPose(),base={position:[0,0,.6],quality:1};
assert.equal(s.receive(base,0),true);
assert.equal(s.receive({...base,position:[0,0,1.2]},33),false,'Reject isolated depth jump');
near(s.target[2],0);assert.equal(s.receive(base,66),true);
assert.equal(s.receive({...base,position:[0,0,.56]},99),true,'Accept quick ordinary lean');
for(let i=0;i<20;i++)s.update(100+i*16,.016);
const held=[...s.eye];s.update(5000,.016);near(s.eye[2],held[2],.0001);
assert.equal(s.receive({...base,position:[.2,0,.6]},5100),false);
assert.equal(s.receive({...base,position:[.201,0,.6]},5133),true,'Corroborate reacquisition');
const before=[...s.eye];s.update(5133,.016);assert.ok(Math.abs(s.eye[0]-before[0])<.04,'Blend recovery');
assert.equal(s.receive({...base,quality:.3},5166),false);
const view=new ViewPose();view.mode='first';view.preserveNeutral=true;
view.receive({yaw:0,pitch:0,fit:{parameters:[0,0,.8]}},0);
view.receive({yaw:0,pitch:0,fit:{parameters:[0,0,1.1]}},33);
for(let i=0;i<30;i++)view.update(40+i*16,.016);
near(view.physicalRoll,.3,.001);near(view.physicalYaw,0);near(view.physicalPitch,0);
view.update(5000,.016);near(view.physicalRoll,.3,.001);
console.log('PASS: reclined neutral, rotation signs, tilted-face perspective fit, depth outliers, held view and smooth reacquisition');
