import assert from 'node:assert/strict';
import {Calibration} from './Calibration.js';
const controls=new Map();
const values={'body-mode':'seated','head-mode':'first','setup-fov':'60','setup-distance':'','lateral-sensitivity':'2','depth-sensitivity':'2','vertical-sensitivity':'2','head-sensitivity':'1.5'};
function control(id){if(!controls.has(id))controls.set(id,{value:values[id]??'',hidden:false,reportValidity:()=>true,addEventListener(){},dispatchEvent(){},showModal(){this.open=true;},close(){this.open=false;}});return controls.get(id);}
globalThis.document={getElementById:control,body:{classList:{contains:()=>false,remove(){}}}};
const fit={position:[0,0,.6],yaw:0,pitch:0,error:0};let calibrated=0,resets=0;
const head={mode:'first',video:{readyState:0},window:{latest:fit,seen:0,target:[0,0,0]},calibrate(samples,distance){calibrated++;assert.ok(samples.length>=16);assert.equal(distance,null);}};
const body={pose:{neutral:{},recenter(){resets++;}}};
const setup=new Calibration(head,body);assert.equal(setup.stage,'setup');assert.equal(control('setup-mode').value,'seated');
setup.close();assert.equal(calibrated,0,'Skipping does not overwrite tracking');
setup.open();setup.begin();assert.equal(setup.stage,'center');
for(let i=0;i<=30&&setup.stage==='center';i++){head.window.seen=i*80;setup.update(i*80);}
assert.equal(setup.stage,'side');assert.equal(calibrated,1);assert.equal(resets,1);
for(let i=0;i<10;i++){head.window.seen=3000+i*80;head.window.target=[.05,0,0];setup.update(head.window.seen);}
setup.next();assert.equal(setup.stage,'depth');
for(let i=0;i<10;i++){head.window.seen=4000+i*80;head.window.target=[0,0,-.075];setup.update(head.window.seen);}
setup.next();assert.equal(setup.stage,'done');assert.equal(control('lateral-sensitivity').value,3);assert.equal(control('depth-sensitivity').value,2);
assert.equal(control('head-sensitivity').value,'1.5');assert.equal(control('vertical-sensitivity').value,'2');
setup.close();assert.equal(control('calibration').open,false);
console.log('PASS: seated startup, skip/retry, stable center, range tuning, separate head/up-down controls and closing');
setup.open();control('setup-mode').value='reclined';setup.begin();
assert.equal(control('body-mode').value,'off');assert.equal(control('play-posture').value,'reclined');
assert.equal(setup.stage,'center');
setup.close();control('body-mode').value='off';control('play-posture').value='seated';setup.open();setup.begin();
assert.equal(control('body-mode').value,'off','Calibration preserves head-only mode');
