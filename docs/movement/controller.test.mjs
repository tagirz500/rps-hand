import test from 'node:test';import assert from 'node:assert/strict';import {MovementController,measureHand} from './controller.mjs';
const sample=(x=.5,z=.5,pinch=.2)=>({x,z,pinch,extended:true});
function run(axis,end,mode='pinch',hz=60){const c=new MovementController();c.mode=mode;let dx=0,dz=0;for(let i=0;i<=hz;i++){let s=sample();s[axis]+=(end-s[axis])*Math.max(0,(i/hz-.2)/.8);const r=c.update(s,i*1000/hz);dx+=r.dx;dz+=r.dz;}return {c,dx,dz};}
test('screen-right/left gestures strafe with no depth movement',()=>{const r=run('x',.8),l=run('x',.2);assert.ok(r.dx>.5);assert.ok(l.dx<-.5);assert.equal(r.dz,0);});
test('push toward camera moves back, pull moves forward',()=>{assert.ok(run('z',.3).dz>.5);assert.ok(run('z',.7).dz<-.5);});
test('stationary jitter does not move',()=>{const c=new MovementController();for(let i=0;i<120;i++){const r=c.update(sample(.5+Math.sin(i)*.002,.5+Math.cos(i)*.003),i*16);assert.equal(Math.abs(r.dx)+Math.abs(r.dz),0);}});
test('release and tracking loss discard anchors before reacquisition',()=>{const {c}=run('x',.8);assert.equal(c.update(sample(.1,.5,.9),1100).active,false);assert.equal(c.update(sample(.1),1120).dx,0);c.update(null,1140);assert.equal(c.update(sample(.9),1160).dx,0);});
test('long frame gaps and large jumps cannot teleport',()=>{const {c}=run('x',.8);assert.equal(c.update(sample(.1),1020).dx,0);assert.equal(c.update(sample(.6),2000).dx,0);});
test('index mode gates movement on extension',()=>{assert.ok(run('x',.8,'index').dx>.5);const c=new MovementController();c.mode='index';assert.equal(c.update({...sample(),extended:false},0).active,false);});
test('pinch hysteresis avoids releasing in threshold noise',()=>{const c=new MovementController();for(let i=0;i<10;i++)c.update(sample(),i*20);assert.equal(c.update(sample(.5,.5,.45),200).active,true);assert.equal(c.update(sample(.5,.5,.6),220).active,false);});
test('travel is consistent at 30 and 60 fps',()=>{assert.ok(Math.abs(run('x',.8,'pinch',30).dx-run('x',.8,'pinch',60).dx)<.1);});
test('invalid landmarks never create movement samples',()=>{assert.equal(measureHand([],[]),null);});
