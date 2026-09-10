import assert from 'node:assert/strict';
import {paddingPlan,unpadLandmarks,trackFeatureTranslation,trackPointTranslation,selectHeadTexturePoints} from './edge.mjs';
for(const [x,y] of [[.05,.5],[.95,.5],[.5,.05],[.5,.95],[.05,.05]]){
 const plan=paddingPlan(x,y,640,480),source=[{x:.08,y:.12,z:.1},{x:.95,y:.9,z:-.2}];
 const padded=source.map(p=>({...p,x:(p.x*640+plan.x)/plan.width,y:(p.y*480+plan.y)/plan.height}));
 const restored=unpadLandmarks(padded,plan,640,480);
 restored.forEach((p,i)=>{assert.ok(Math.abs(p.x-source[i].x)<1e-12);assert.ok(Math.abs(p.y-source[i].y)<1e-12);assert.equal(p.z,source[i].z);});
}
assert.deepEqual(paddingPlan(.5,.5,640,480),{width:640,height:480,x:0,y:0});
const width=80,height=60,shiftX=8,shiftY=-4,make=(dx=0,dy=0)=>{const data=new Uint8Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=x-dx,sy=y-dy;data[y*width+x]=(sx*17+sy*31+((sx*sy)%23)*7)&255;}return {width,height,data};};
const points=Array.from({length:455},()=>null);for(const id of [33,133,263,362,168,6])points[id]={x:.5+(id%3-.5)*.08,y:.5+(id%2-.5)*.08};
const motion=trackFeatureTranslation(make(),make(shiftX,shiftY),points,{search:12});assert.ok(motion&&motion.matches>=2);assert.equal(motion.dx,shiftX);assert.equal(motion.dy,shiftY);
const texture=[{x:.35,y:.25},{x:.48,y:.18},{x:.62,y:.27},{x:.44,y:.34}];
const outlineMotion=trackPointTranslation(make(),make(shiftX,shiftY),texture,{search:12,minMatches:3});assert.ok(outlineMotion?.matches>=3);assert.equal(outlineMotion.dx,shiftX);assert.equal(outlineMotion.dy,shiftY);
const face=Array.from({length:455},()=>({x:.5,y:.5}));for(const [i,x,y] of [[10,.5,.25],[151,.5,.27],[109,.42,.26],[338,.58,.26],[67,.38,.3],[297,.62,.3],[54,.32,.38],[284,.68,.38],[127,.29,.48],[356,.71,.48],[234,.3,.58],[454,.7,.58],[33,.41,.46],[263,.59,.46],[152,.5,.72]])face[i]={x,y};
const hair=selectHeadTexturePoints(make(),face,{minScore:5});assert.ok(hair.length>=8,'Textured hair/head cap points are learned above the face');assert.ok(hair.some(p=>p.y<.25),'Selected region extends above MediaPipe face landmarks into hair');
assert.equal(trackFeatureTranslation(make(),make(),null),null);
console.log('PASS: boundary padding, landmark restoration, facial patches and learned hair/head texture tracking');
