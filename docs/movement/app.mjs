import {TrackingScheduler,freshHead} from './tracking-scheduler.mjs?v=58';
import {ThumbJoystick,measureThumb} from './thumb-joystick.mjs?v=58';
import {setupThumbstick} from './thumbstick.mjs?v=58';

import {HeadLook,bodyDisplacement} from './head-look.mjs?v=58';
import {DustMap} from './map.mjs?v=58';
import {HeadView} from '../head/HeadView.js';
import * as THREE from 'three';
import {setupUI} from './ui.mjs?v=58';
import {phoneCamera} from './camlink.mjs';   // ?cam: the phone streams its camera to this page over WebRTC and the tracker runs here
import {SwipeController,measurePointer,selectLeftHand} from './swipe.mjs?v=58';
const $=id=>document.getElementById(id);
const trackingUI=setupUI();const stick=setupThumbstick($('thumbstick'),$('stickKnob'));
const trackingLog=[];
$('saveTracking').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:58,frames:trackingLog},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='thumb-tracking-v58.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const held=new ThumbJoystick();let inputMode='poses',trackedHand=null,resting=false;
const scheduler=new TrackingScheduler();const swipe=new SwipeController();const headLook=new HeadLook();let lookDemo=0;
const renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:false});renderer.setPixelRatio(Math.min(1,Math.sqrt(900000/(innerWidth*innerHeight))));
const scene=new THREE.Scene();scene.background=new THREE.Color('#25394a');scene.fog=new THREE.FogExp2('#25394a',.018);
const camera=new THREE.PerspectiveCamera(65,1,.05,200);camera.position.set(0,1.65,7);
scene.background=new THREE.Color('#abc9d9');scene.fog=new THREE.Fog('#abc9d9',90,180);
const dustMap=new DustMap(scene);
dustMap.load().then(()=>{camera.position.copy(dustMap.spawn);$('mapStatus').textContent='Dust II · auto-step on';}).catch(e=>{$('mapStatus').textContent='Map failed to load';$('error').textContent=e.message;});
function resize(){renderer.setPixelRatio(Math.min(1,Math.sqrt(900000/(innerWidth*innerHeight))));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
let head=null,lastHeadVideo=-1,lastFrameTime=0,lastHUD=-Infinity;let walkReason='START CAMERA';
let worker=null,stream=null,running=false,busy=false,lastVideo=-1,lastResult=0,demo=false,demoRun=null;
function status(text,active=false){$('status').textContent=text;$('lamp').classList.toggle('on',active);}
function apply(sample,time){const r=swipe.update(sample,time);const step=bodyDisplacement(r.dx,r.dz,headLook.heading);dustMap.move(camera.position,step.x,step.z);$('gestureStats').textContent=r.active?'MOVE engaged · relax index to release':'Hands free · movement off';status(r.status,r.active);return r;}
function stop(){stick.reset();held.reset();trackedHand=null;lookDemo=0;headLook.resetLook();head?.worker?.terminate();if(head)clearTimeout(head.timer);head=null;$('headStatus').textContent='Head: camera off';running=false;busy=false;worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;$('cam').srcObject=null;swipe.reset();trackingUI.camera(false);$('start').textContent='Start camera';}
async function start(){
 if(running){stop();status('Paused · camera off');return;}
 stop();demo=false;demoRun=null;$('demoControls').classList.remove('visible');$('error').textContent='';$('start').disabled=true;status('Starting camera…');
 try{
  const useCam=new URLSearchParams(location.search).has('cam');
  if(!useCam&&!navigator.mediaDevices?.getUserMedia)throw Error('Camera access needs HTTPS or localhost.');
  stream=useCam?await phoneCamera(t=>status(t)):await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:60}}});
  $('cam').srcObject=stream;await $('cam').play();trackingUI.camera(true);$('previewImage').style.aspectRatio=$('cam').videoWidth+'/'+$('cam').videoHeight;status('Loading motion tracking…');
  worker=new Worker(new URL('./tracker.mjs?v=58',import.meta.url),{type:'module'});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Tracker loading timed out. Check your connection and retry.')),45000);worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve();}else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message));}};worker.postMessage({type:'init'});});
  worker.onerror=e=>{stop();status('Tracking stopped');$('error').textContent=e.message;};
  worker.onmessage=({data})=>{busy=false;if(data.type==='error'){stop();status('Tracking stopped');$('error').textContent=data.message;return;}if(data.type!=='result')return;
    lastResult=performance.now();if(lastResult-data.time>450){held.receive(null,lastResult);apply(null,lastResult);trackingUI.draw([],$('cam').videoWidth,$('cam').videoHeight,false,{centre:held.centre,viewScale:held.scale,scale:held.effectiveScale,reason:held.reason});walkReason='TRACKING TOO OLD · '+Math.round(lastResult-data.time)+' ms';status(walkReason);return;}
    let handIndex=inputMode==='index'?selectLeftHand(data):data.landmarks?.length===1?0:-1;
    if(resting){held.receive(null,lastResult);swipe.reset();walkReason='RESTING';return;}
    const label=handIndex>=0?data.handedness?.[handIndex]?.[0]?.categoryName:null;
    trackedHand=label;
    if(inputMode==='index'){
      const sample=handIndex>=0?measurePointer(data.landmarks[handIndex],data.worldLandmarks[handIndex],$('cam').videoWidth/$('cam').videoHeight):null;
      const result=apply(sample,data.time);trackingUI.draw(handIndex>=0?[data.landmarks[handIndex]]:[],$('cam').videoWidth,$('cam').videoHeight,result.active);
    }else if(inputMode==='poses'){
      const sample=handIndex>=0?measureThumb(data.landmarks[handIndex],data.worldLandmarks[handIndex],$('cam').videoWidth/$('cam').videoHeight):null;
      held.receive(sample,lastResult);
      trackingLog.push({time:lastResult,captureTime:data.time,point:sample?.point??null,rest:sample?.rest??false,centre:held.centre,raw:held.raw,x:held.x,z:held.z,reason:held.reason});while(trackingLog.length>450||trackingLog.length&&lastResult-trackingLog[0].time>15000)trackingLog.shift();
      const active=!!held.direction;walkReason=handIndex<0?'SHOW ONE HAND':held.reason;
      $('gestureStats').textContent=`THUMB X ${held.x.toFixed(2)} · Y ${(-held.z).toFixed(2)} · raw X ${held.raw.x.toFixed(2)} Y ${(-held.raw.z).toFixed(2)} · tracker ${Math.round(data.inferenceMs||0)} ms`;
      trackingUI.draw(handIndex>=0?[data.landmarks[handIndex]]:[],$('cam').videoWidth,$('cam').videoHeight,active,{centre:held.centre,viewScale:held.scale,scale:held.effectiveScale,active,x:held.x,z:held.z,reason:held.reason});
      status(active?'THUMB · '+held.direction:walkReason,active);
    }
  };
  head=new HeadView({mode:$('headEnabled').checked?'first':'off',interval:33,widths:[288,384,512],workerUrl:new URL('./head-tracker.mjs?v=58',import.meta.url)});head.pose.sensitivity=1.5;headLook.gain=+$('headGain').value;lastHeadVideo=-1;lastVideo=-1;running=true;lastResult=performance.now();$('start').textContent='Stop camera';status('Show one hand');
 }catch(e){stop();status('Camera not started');$('error').textContent=e.name==='NotAllowedError'?'Camera access was declined. Allow camera access in your browser, then retry.':e.message;}
 finally{$('start').disabled=false;}
}
$('start').onclick=start;
$('rest').onclick=()=>{resting=!resting;held.receive(null,performance.now());stick.reset();swipe.reset();demoRun=null;lookDemo=0;headLook.resetLook();head?.recenter();$('rest').textContent=resting?'Resume':'Rest';$('rest').setAttribute('aria-pressed',String(resting));walkReason=resting?'RESTING':'THUMB READY';status(walkReason);};
$('centerHead').onclick=()=>{head?.recenter();headLook.resetLook();swipe.reset();};
$('headEnabled').onchange=()=>{if(head)head.mode=$('headEnabled').checked?'first':'off';headLook.resetLook();head?.recenter();camera.rotation.y=headLook.heading;};
$('turnMode').onchange=()=>{headLook.mode=$('turnMode').value;headLook.resetLook();head?.recenter();};
$('headThreshold').oninput=()=>{headLook.deadzoneDegrees=+$('headThreshold').value;$('thresholdValue').textContent=$('headThreshold').value+'°';};
$('headGain').oninput=()=>{if(head)head.pose.sensitivity=1.5;headLook.gain=+$('headGain').value;};
$('reset').onclick=()=>{stick.reset();held.reset();headLook.heading=0;headLook.resetLook();lookDemo=0;head?.recenter();camera.position.copy(dustMap.spawn);camera.rotation.set(0,0,0);swipe.reset();demoRun=null;status('View reset · ready');};
function controlsChanged(){held.reset();swipe.reset();demoRun=null;trackingUI.clear();$('hint').textContent='Show your thumb: the circle appears at its starting position. Move the thumb toward an arrow to walk; green centre or a closed fist stops. After tracking is lost, return to the green centre to resume. Reposition circle starts it at your next visible thumb position. Flick your head for a quick turn, or hold slightly left/right to keep rotating. Face centre to stop. Look up/down to aim.';status('Start camera · thumb joystick ready');}
$('movementMode').onchange=()=>{inputMode=$('movementMode').value;stick.reset();held.reset();trackedHand=null;swipe.reset();demo=false;demoRun=null;$('demoControls').classList.remove('visible');$('stickZone').hidden=inputMode!=='touch';$('hint').textContent=inputMode==='touch'?'Drag thumbstick to walk; release to stop.':inputMode==='poses'?'Thumb up/down in the preview: forward/back. Left/right: sideways. Centre or tucked fist stops.':'Left index out: move your hand to walk. Bend index to release.';};
$('centerThumb').onclick=()=>{held.reset();status('Show thumb to place circle');};
$('joystickSize').oninput=()=>{held.setSize(+$('joystickSize').value);$('joystickSizeValue').textContent=Math.round(held.size*100)+'%';};
$('gain').oninput=()=>held.speed=+$('gain').value;
$('demo').onclick=()=>{stop();demo=true;demoRun=null;$('demoControls').classList.add('visible');status('Demo · choose a movement below');};
document.querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>{lookDemo=+b.dataset.look;if(!lookDemo)headLook.speed=0;});
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>{swipe.reset();demoRun={direction:b.dataset.demo,start:performance.now()};});
document.addEventListener('visibilitychange',()=>{held.reset();swipe.reset();demoRun=null;if(document.hidden&&running)stop();});
addEventListener('pagehide',stop);
function frame(now){
 requestAnimationFrame(frame);
 const dt=lastFrameTime?Math.min(.1,(now-lastFrameTime)/1000):1/60;lastFrameTime=now;
 if(head&&!resting){const pose=head.update(now,dt),valid=head.mode!=='off'&&freshHead(head.lastResult,now);const rawYaw=valid&&head.pose.neutral?-(head.pose.latest.yaw-head.pose.neutral.yaw):0;const viewYaw=headLook.update(rawYaw,dt,valid,head.lastResult?.ts);const rawPitch=valid&&head.pose.neutral?head.pose.latest.pitch-head.pose.neutral.pitch:0;const viewPitch=headLook.updatePitch(rawPitch,dt,valid);if(valid)camera.rotation.set(viewPitch,viewYaw,0,'YXZ');if(now-lastHUD>=100)$('headStatus').textContent=(head.failed?'Head error: '+head.error:!head.ready?'Head loading…':head.mode==='off'?'Head off':valid?'Head tracking · '+head.perf.fps+' fps':'Face not tracked')+(head.lastResult?` · age ${Math.max(0,Math.round(now-head.lastResult.ts))}ms`:'')+(valid?` · yaw ${(rawYaw*180/Math.PI).toFixed(0)}° · pitch ${(rawPitch*180/Math.PI).toFixed(0)}° · ${headLook.state}${headLook.state==='HOLD TO TURN'?' '+Math.round(headLook.progress*100)+'%':''}`:' · turn stopped');}
 if(demo&&!resting){camera.rotation.set(0,headLook.update(lookDemo*.35,dt),0,'YXZ');}

 if(demo&&demoRun&&!resting){const elapsed=now-demoRun.start,t=Math.max(0,Math.min(1,(elapsed-180)/180));const d=demoRun.direction;apply({x:.5+(d.includes('right')?.25:d.includes('left')?-.25:0)*t,z:.5+(d.includes('forward')?-.18:d.includes('backward')?.18:0)*t,pinch:.8,extended:true,pointing:true},now);if(elapsed>1050){demoRun=null;apply(null,now);status('Demo complete · choose another movement');}}
 if(inputMode==='touch'&&!document.hidden&&!demo&&!resting){const v=stick.vector,step=bodyDisplacement(v.x*held.speed*Math.min(.05,dt),v.z*held.speed*Math.min(.05,dt),headLook.heading);dustMap.move(camera.position,step.x,step.z);const moving=Math.hypot(v.x,v.z)>.001;status(moving?'WALKING · release to stop':'Thumbstick ready · drag to walk',moving);$('gestureStats').textContent=moving?'Walking '+Math.round(Math.hypot(v.x,v.z)*100)+'%':'Stopped';}
 if(running&&!resting){
  const movement=held.step(now,dt),world=bodyDisplacement(movement.dx,movement.dz,headLook.heading),beforeX=camera.position.x,beforeZ=camera.position.z;dustMap.move(camera.position,world.x,world.z);if(held.direction){walkReason=!dustMap.ready?'MAP LOADING':Math.hypot(camera.position.x-beforeX,camera.position.z-beforeZ)<.00001?'BLOCKED BY MAP':'MOVING';}
  if(inputMode!=='touch'&&now-lastResult>450){held.receive(null,now);swipe.update(null,now);trackingUI.draw([],$('cam').videoWidth,$('cam').videoHeight,false,{centre:held.centre,viewScale:held.scale,scale:held.effectiveScale,reason:held.reason});walkReason='WAITING FOR TRACKING';status(walkReason);}
  const v=$('cam');
  const job=scheduler.next({busy:busy||!!head?.busy,handReady:inputMode!=='touch'&&v.readyState>=2&&v.currentTime!==lastVideo,headReady:!!head?.wantsFrame(now)&&v.readyState>=2&&v.currentTime!==lastHeadVideo});
  if(job==='head'){lastHeadVideo=v.currentTime;head.capture(v,now);}
  if(job==='hand'){lastVideo=v.currentTime;busy=true;const capture=now,owner=worker;createImageBitmap(v,{resizeWidth:640,resizeHeight:Math.round(640*v.videoHeight/v.videoWidth),resizeQuality:'low'}).then(bitmap=>{if(worker!==owner||!running){bitmap.close();return;}owner.postMessage({type:'frame',bitmap,time:capture},[bitmap]);}).catch(e=>{busy=false;status('Frame unavailable');$('error').textContent=e.message;});}
 }
 if(now-lastHUD>=100){lastHUD=now;
 $('position').innerHTML=`${['N','NE','E','SE','S','SW','W','NW'][Math.round(((-camera.rotation.y*180/Math.PI)%360+360)%360/45)%8]} · ${((-camera.rotation.y*180/Math.PI%360+360)%360).toFixed(0)}°<br>X ${camera.position.x.toFixed(1)} · Z ${camera.position.z.toFixed(1)}`;
 $('turnIndicator').textContent=(running||demo)?headLook.state+(headLook.state==='HOLD TO TURN'?' '+Math.round(headLook.progress*100)+'%':''):'Head control paused';
 $('walkIndicator').textContent=resting?'RESTING · TAP RESUME':inputMode==='poses'?(!running?'START CAMERA':held.direction?'THUMB '+held.direction+' · '+walkReason:'STOP · '+walkReason):inputMode==='index'?'INDEX STROKES':'SCREEN THUMBSTICK';
 $('turnIndicator').style.color=headLook.state.includes('BODY')?'#ffdf75':'#b8ebd1';
 const dot=$('joystickDot');dot.style.transform=`translate(${held.x*30}px,${held.z*30}px)`;$('joystickState').textContent=resting?'REST':held.direction||held.reason;
 }
 renderer.render(scene,camera);
}controlsChanged();requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('cam')){$('start').textContent='Connect phone camera';start();}   // phone-as-camera mode: no local permission prompt, connect right away
$('phoneCam').onclick=()=>{const u=new URL(location.href);u.searchParams.set('cam','');location.href=u.href;};
