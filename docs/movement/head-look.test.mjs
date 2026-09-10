import test from 'node:test';import assert from 'node:assert/strict';import {HeadLook,bodyDisplacement} from './head-look.mjs';
const rad=d=>d*Math.PI/180;
test('glances change view but never body heading or walking direction',()=>{const c=new HeadLook();c.mode='hold';for(let i=0;i<120;i++)c.update(rad(8),1/60);assert.equal(c.heading,0);assert.ok(c.look>rad(10));assert.deepEqual(bodyDisplacement(0,-1,c.heading),{x:0,z:-1});});
test('brief large glance does not turn; held glance turns and centre stops',()=>{const c=new HeadLook();c.mode='hold';for(let i=0;i<10;i++)c.update(rad(25),1/60);assert.equal(c.heading,0);for(let i=0;i<600;i++)c.update(rad(25),1/60);assert.ok(c.heading>Math.PI*2);const h=c.heading;c.update(0,1/60);assert.equal(c.heading,h);assert.equal(c.speed,0);});
test('lost face immediately stops and reacquisition must dwell again',()=>{const c=new HeadLook();c.mode='hold';for(let i=0;i<60;i++)c.update(.4,1/60);const h=c.heading;c.update(.4,.1,false);c.update(.4,.1);assert.equal(c.heading,h);assert.equal(c.speed,0);});
test('threshold jitter does not toggle an engaged turn',()=>{const c=new HeadLook();c.mode='hold';for(let i=0;i<30;i++)c.update(rad(15),1/60);c.update(rad(7),1/60);assert.equal(c.turning,true);c.update(rad(4),1/60);assert.equal(c.turning,false);});
test('quick mode slow head movement looks only, outward flick turns once, return cannot undo',()=>{const c=new HeadLook();c.mode='hold';c.mode='quick';for(let i=0;i<=20;i++)c.update(rad(i),.05,true,i*50);assert.equal(c.heading,0);c.resetLook();c.update(0,.05,true,1100);c.update(rad(12),.05,true,1150);assert.ok(Math.abs(c.heading-rad(30))<1e-10);const h=c.heading;c.update(rad(25),.05,true,1200);c.update(0,.05,true,1250);assert.equal(c.heading,h);for(let i=1;i<=4;i++)c.update(0,.05,true,1250+i*50);c.update(rad(-12),.05,true,1500);assert.ok(Math.abs(c.heading)<1e-10);});
test('duplicate tracker frames and face reacquisition cannot trigger flick',()=>{const c=new HeadLook();c.mode='hold';c.mode='quick';c.update(0,.016,true,100);c.update(.4,.016,true,100);assert.equal(c.heading,0);c.update(0,.016,false);c.update(.4,.016,true,200);assert.equal(c.heading,0);});
test('recenter clears look without changing body; body basis rotates walking',()=>{const c=new HeadLook();c.mode='hold';c.heading=Math.PI/2;c.update(.1,.1);c.resetLook();assert.equal(c.heading,Math.PI/2);assert.equal(c.look,0);const d=bodyDisplacement(0,-1,c.heading);assert.ok(Math.abs(d.x+1)<1e-10&&Math.abs(d.z)<1e-10);});

test('gentle nine-degree hold turns with the new default but a brief glance does not',()=>{const c=new HeadLook();c.mode='hold';for(let i=0;i<10;i++)c.update(rad(9),1/60);assert.equal(c.heading,0);for(let i=0;i<10;i++)c.update(rad(9),1/60);assert.ok(c.heading>0);const h=c.heading;c.update(0,1/60);assert.equal(c.heading,h);});

test('quick flick is the default and turns each way once with centre rearm',()=>{const c=new HeadLook();assert.equal(c.mode,'quick');c.update(0,.05,true,0);c.update(rad(12),.05,true,50);assert.ok(Math.abs(c.heading-rad(30))<1e-10);c.update(rad(12),.05,true,100);assert.ok(Math.abs(c.heading-rad(30))<1e-10);for(let i=0;i<4;i++)c.update(0,.05,true,150+i*50);c.update(rad(-12),.05,true,350);assert.ok(Math.abs(c.heading)<1e-10);});

test('flick spread across small high-rate deltas turns, holding does not repeat',()=>{
 const c=new HeadLook();for(let i=0;i<=6;i++)c.update(rad(i*2),.02,true,i*20);
 assert.ok(Math.abs(c.heading-rad(30))<1e-10);
 for(let i=7;i<30;i++)c.update(rad(12),.02,true,i*20);
 assert.ok(Math.abs(c.heading-rad(30))<1e-10);
});
test('flick uses selected threshold and tolerates phone-rate samples',()=>{
 const c=new HeadLook();c.deadzoneDegrees=12;c.update(0,.1,true,0);c.update(rad(9),.1,true,100);assert.equal(c.heading,0);
 c.update(rad(16),.1,true,220);assert.ok(c.heading>0);
});
