import test from 'node:test';import assert from 'node:assert/strict';
import {TrackingScheduler,freshHead} from './tracking-scheduler.mjs';
test('busy inference cannot queue another frame',()=>{const s=new TrackingScheduler();for(let i=0;i<20;i++)assert.equal(s.next({busy:true,handReady:true,headReady:true}),null);});
test('head updates are not starved by fast continuous hand frames',()=>{
 const s=new TrackingScheduler(),heads=[],hands=[];let busyUntil=0,lastHead=-Infinity;
 for(let now=0;now<2000;now+=16){const job=s.next({busy:now<busyUntil,handReady:true,headReady:now-lastHead>=33});
 if(job){busyUntil=now+16;if(job==='head'){heads.push(now);lastHead=now;}else hands.push(now);}}
 assert.ok(heads.length>=30);assert.ok(hands.length>=30);
 assert.ok(heads.slice(1).every((t,i)=>t-heads[i]<=64));
});
test('either tracker can run when the other is unavailable',()=>{const s=new TrackingScheduler();for(let i=0;i<10;i++){assert.equal(s.next({headReady:true}),'head');assert.equal(s.next({handReady:true}),'hand');}assert.equal(s.next({}),null);});
test('old capture is rejected even if it just finished inference',()=>{assert.equal(freshHead({pose:{},ts:100},549),true);assert.equal(freshHead({pose:{},ts:100},550),false);assert.equal(freshHead({pose:null,ts:279},550),false);assert.equal(freshHead({pose:{},ts:600},550),false);});
