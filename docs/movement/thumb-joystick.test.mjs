import test from 'node:test';
import assert from 'node:assert/strict';
import {ThumbJoystick,thumbVector,measureThumb} from './thumb-joystick.mjs';
import {drawThumbJoystick,handViewport} from './ui.mjs';
const s=(x=0,y=0,rest=false,scale=1)=>({point:[x,y],rest,scale});
const ready=()=>{const c=new ThumbJoystick();c.size=1;for(const t of [-400,-300,-200,-100,0])c.receive(s(0,.35,true),t);return c;};
test('fist captures a fixed circle above its resting thumb',()=>{const c=ready();assert.deepEqual(c.centre,[0,0]);assert.equal(c.scale,1);assert.equal(c.direction,null);});
test('hand position and size changes cannot drag or resize the circle',()=>{
 const c=ready();for(let t=40;t<1000;t+=40)c.receive(s(.7,.8,true,2),t);
 assert.deepEqual(c.centre,[0,0]);assert.equal(c.scale,1);assert.deepEqual(c.step(1000),{dx:0,dz:0});
});
test('all held screen directions move with equal maximum speed',()=>{
 for(const [x,z,name] of [[-.5,0,'LEFT'],[.5,0,'RIGHT'],[0,-.5,'FORWARD'],[0,.5,'BACKWARD'],[Math.SQRT1_2*.5,-Math.SQRT1_2*.5,'FORWARD RIGHT']]){
 const c=ready();c.receive(s(x,z),100);c.receive(s(x,z),180);assert.equal(c.direction,name);
 assert.ok(Math.abs(Math.hypot(c.x,c.z)-1)<1e-10);assert.deepEqual(c.step(200),c.step(220));}
});
test('circle centre and fist both stop immediately',()=>{for(const stop of [s(),s(.6,.7,true)]){const c=ready();c.receive(s(.5),100);c.receive(s(.5),180);c.receive(stop,220);assert.deepEqual(c.step(220),{dx:0,dz:0});}});
test('lost tracking preserves circle and fist can resume movement',()=>{
 const c=ready();c.receive(s(.5),100);c.receive(s(.5),180);c.receive(null,220);
 assert.deepEqual(c.centre,[0,0]);c.receive(s(.5),260);c.receive(s(.5),340);assert.deepEqual(c.step(340),{dx:0,dz:0});
 c.receive(s(.7,.8,true),380);c.receive(s(-.5),420);c.receive(s(-.5),500);assert.equal(c.direction,'LEFT');
 assert.deepEqual(c.centre,[0,0]);assert.deepEqual(c.step(951),{dx:0,dz:0});assert.deepEqual(c.centre,[0,0]);
});
test('only reset allows replacing the captured circle',()=>{const c=ready();c.reset();for(let t=0;t<=400;t+=100)c.receive(s(.5,.7,true,2),t);assert.deepEqual(c.centre,[.5,0]);assert.equal(c.scale,2);});
test('neutral jitter and one corrupt reversal do not cause drift',()=>{
 const c=ready();for(let t=40;t<1000;t+=40){c.receive(s(.16+Math.sin(t)*.01),t);assert.deepEqual(c.step(t),{dx:0,dz:0});}
 c.receive(s(.5),1000);c.receive(s(.5),1080);c.receive(s(-.5),1120);assert.ok(c.x>0);c.receive(s(.5),1160);assert.ok(c.x>0);
});
test('continuous circular input covers every heading',()=>{let last;const bins=new Set();for(let i=0;i<=1440;i++){const a=i*Math.PI/720,v=thumbVector([.5*Math.cos(a),.5*Math.sin(a)],[0,0]);bins.add(Math.round((a*180/Math.PI)%360/5)%72);if(last)assert.ok(Math.hypot(v.x-last.x,v.z-last.z)<.01);last=v;}assert.equal(bins.size,72);});
test('measurement follows absolute mirrored tip, not moving thumb base or depth',()=>{
 const world=Array.from({length:21},(_,i)=>({x:Math.sin(i)*.04,y:Math.cos(i)*.04,z:.01}));
 const image=world.map(p=>({x:.5+p.x*3,y:.5+p.y*3}));const a=measureThumb(image,world,1);assert.ok(a);
 const moved=image.map(p=>({...p}));moved[2].x+=.1;assert.deepEqual(measureThumb(moved,world,1).point,a.point);
 moved[4].x+=.1;assert.ok(measureThumb(moved,world,1).point[0]<a.point[0]);
});
test('rendered circle stays put while thumb marker moves',()=>{
 const arcs=[];const ctx=new Proxy({arc:(...a)=>arcs.push(a)}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
 const hand=Array.from({length:21},()=>({x:.5,y:.5}));const joystick={centre:[.5,.4],scale:.2,active:false};
 drawThumbJoystick(ctx,hand,640,480,joystick);const first=arcs.map(a=>a.slice());arcs.length=0;
 hand[2]={x:.9,y:.9};hand[4]={x:.7,y:.6};drawThumbJoystick(ctx,hand,640,480,joystick);
 assert.deepEqual(arcs.slice(0,4),first.slice(0,4));assert.notDeepEqual(arcs[4],first[4]);
});

test('size changes preserve anchor, require rest and adjust thumb travel',()=>{
 const c=ready(),anchor=[...c.centre];c.setSize(.65);assert.deepEqual(c.centre,anchor);assert.equal(c.effectiveScale,.65);
 c.receive(s(.4),100);c.receive(s(.4),180);assert.equal(c.direction,null);
 c.receive(s(0,.35,true),220);c.receive(s(.4),260);c.receive(s(.4),340);assert.ok(c.x>1&&c.x<=1.6);
 c.setSize(1.6);c.receive(s(0,.35,true),380);c.receive(s(.4),420);c.receive(s(.4),500);assert.ok(c.x>0&&c.x<.4);assert.deepEqual(c.centre,anchor);
 c.reset();assert.equal(c.size,1.6);
});

test('compact default reaches forward and reverse boost within a small thumb span',()=>{
 const c=new ThumbJoystick();assert.equal(c.size,.8);c.setSize(.55);for(let t=0;t<=400;t+=100)c.receive(s(0,.35,true),t);
 c.receive(s(0,-.44),440);c.receive(s(0,-.44),520);assert.ok(c.z<=-1.59);
 c.receive(s(0,.44),560);c.receive(s(0,.44),640);c.receive(s(0,.44),680);assert.ok(c.z>1.5);
 c.receive(s(),720);assert.deepEqual(c.step(720),{dx:0,dz:0});
});
test('boost starts continuously at circle edge and stays capped in every direction',()=>{
 assert.equal(thumbVector([.5,0],[0,0]).x,1);assert.ok(thumbVector([.50001,0],[0,0]).x<1.001);
 for(let i=0;i<360;i++){const a=i*Math.PI/180,v=thumbVector([100*Math.cos(a),100*Math.sin(a)],[0,0]);assert.ok(Math.abs(Math.hypot(v.x,v.z)-1.6)<1e-10);}
});

test('zoom crop stays anchored and includes the joystick boost ring',()=>{
 const j={centre:[.5,.35],viewScale:.15,scale:.15*.55};const hand=Array.from({length:21},()=>({x:.5,y:.5}));
 const a=handViewport(640,480,hand,j);hand[4]={x:.1,y:.9};assert.deepEqual(handViewport(640,480,hand,j),a);
 const r=.8*j.scale*640,cx=j.centre[0]*640,cy=j.centre[1]*640;
 assert.ok(cx-r>=a.x&&cx+r<=a.x+a.width&&cy-r>=a.y&&cy+r<=a.y+a.height);
 assert.ok(a.width<640*.5);assert.ok(Math.abs(a.width/a.height-4/3)<1e-10);
});
test('zoom crop remains inside image near its edges',()=>{for(const centre of [[0,0],[1,.75],[.99,.01]]){const c=handViewport(640,480,null,{centre,viewScale:.2});assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=640&&c.y+c.height<=480);}});

test('a visible thumb starts immediately without any fist calibration',()=>{
 const c=new ThumbJoystick();c.receive(s(.4,.3),100);assert.deepEqual(c.centre,[.4,.3]);assert.equal(c.needsRest,false);
 c.receive(s(.4+.4,.3),140);c.receive(s(.4+.4,.3),220);assert.equal(c.direction,'RIGHT');
});
test('tracking dropout stops but centre entry resumes without a fist',()=>{
 const c=ready();c.receive(s(.5),100);c.receive(s(.5),180);c.receive(null,220);
 c.receive(s(-.5),260);assert.equal(c.direction,null);c.receive(s(),300);
 c.receive(s(-.5),340);c.receive(s(-.5),420);assert.equal(c.direction,'LEFT');assert.deepEqual(c.centre,[0,0]);
});
test('phone inference gaps do not repeatedly lock the joystick',()=>{
 const c=ready();c.receive(s(.5),300);c.receive(s(.5),600);assert.equal(c.direction,'RIGHT');
 assert.ok(c.step(900).dx>0);assert.deepEqual(c.step(1051),{dx:0,dz:0});
});

test('two consistent 30fps samples engage without an extra 70ms wait',()=>{
 const c=ready();c.receive(s(.5),100);assert.equal(c.direction,null);c.receive(s(.5),133);assert.equal(c.direction,'RIGHT');
 c.receive(s(-.5),166);assert.equal(c.direction,'RIGHT');c.receive(s(-.5),199);assert.equal(c.direction,'LEFT');
 c.receive(s(),215);assert.equal(c.direction,null);
});

test('default joystick gives the thumb more room while preserving full speed',()=>{
 const c=new ThumbJoystick();c.receive(s(),0);assert.equal(c.effectiveScale,.8);
 c.receive(s(.4),40);c.receive(s(.4),80);assert.ok(Math.abs(c.x-1)<1e-10);
});
