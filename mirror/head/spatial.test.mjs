import assert from 'node:assert/strict';
import {template,project,fitHead,SpatialPose,NeutralCapture} from './spatial.mjs';
const aspect=4/3,focal=1/(2*Math.tan(Math.PI/6));
function fixture(parameters){
 const points=Array.from({length:468},()=>({x:.5,y:.5,z:0}));
 for(const {id,point} of template){const uv=project(point,parameters,focal);points[id]={x:uv[0]+.5,y:uv[1]*aspect+.5,z:0};}
 return points;
}
let last=null;
for(const p of [[0,0,0,0,0,.6],[.2,.5,.1,0,0,.6],[-.2,-.45,-.1,.06,-.03,.5],[.1,.2,0,-.07,.04,.8]]){
 const points=fixture(p),prior={yaw:p[1],pitch:-p[0],span:focal*.09/p[5],centerX:.5+focal*p[3]/p[5],centerY:.5+aspect*focal*p[4]/p[5]};
 const fit=fitHead(points,aspect,prior,Math.PI/3,last);assert.ok(fit);last=fit.parameters;
 fit.position.forEach((v,i)=>assert.ok(Math.abs(v-p[i+3])<1e-4,`position ${i}: ${v} vs ${p[i+3]}`));
}
// Predicted landmarks may sit beyond the viewport when eyes remain near an edge.
for(const x of [-.34,.34]){
 const p=[.05,.18,.06,x,0,.6],points=fixture(p);
 const prior={yaw:p[1],pitch:-p[0],span:focal*.09/p[5],centerX:.5+focal*p[3]/p[5],centerY:.5};
 const fit=fitHead(points,aspect,prior,Math.PI/3,last);assert.ok(fit,`partial face at ${x}`);
 assert.ok(fit.visiblePoints>=4&&fit.visiblePoints<23);assert.ok(Math.abs(fit.position[0]-x)<.002);
}
const base={position:[0,0,.6],yaw:0,pitch:0,error:0};
const spatial=new SpatialPose();spatial.calibrate([base,base,base],.75);
spatial.receive({...base,position:[.04,-.02,.5]},100);
assert.ok(Math.abs(spatial.target[0]+.05)<1e-9);assert.ok(Math.abs(spatial.target[2]+.125)<1e-9);
spatial.update(100,.016);assert.ok(spatial.eye[0]<0&&spatial.eye[1]>0&&spatial.eye[2]<0);
spatial.update(2000,.1);spatial.receive(base,2200);assert.deepEqual(spatial.neutral,[0,0,.6]);
const movingSpatial=new SpatialPose();movingSpatial.receive(base,0);movingSpatial.receive({...base,position:[.03,0,.6]},33);movingSpatial.update(33,.016);const beforeCoast=movingSpatial.eye[0];movingSpatial.update(400,.1);assert.ok(movingSpatial.eye[0]<beforeCoast,'Short prediction continues last screen direction');const coastEnd=movingSpatial.eye[0];movingSpatial.update(1400,.1);assert.ok(Math.abs(movingSpatial.eye[0]-coastEnd)<.01,'Prediction remains bounded after loss');
const capture=new NeutralCapture();let done=false;
for(let i=0;i<=30;i++)done=capture.add(base,i*80,i*80);
assert.ok(done);assert.ok(capture.samples.length>=16);
const still=new NeutralCapture();for(let i=0;i<100;i++)assert.equal(still.add(base,1,100),false);
assert.equal(still.samples.length,1,'Repeated render frames do not count as samples');
capture.add(null,0,3000);assert.equal(capture.progress(3000),0);
const moving=new NeutralCapture();for(let i=0;i<40;i++)assert.equal(moving.add({...base,position:[i*.02,0,.6]},i*80,i*80),false);
console.log('PASS: perspective fit at multiple rotations/depths, independent translation, measured scale, saved center, real-time stable calibration and movement rejection');
