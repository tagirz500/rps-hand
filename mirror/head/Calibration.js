import {NeutralCapture} from './spatial.mjs?v=recline5';
const $=id=>document.getElementById(id);
export class Calibration{
 constructor(head=null,body=null){
  this.head=head;this.body=body;this.dialog=$('calibration');this.stage='setup';
  $('setup-start').onclick=()=>this.head?this.begin():this.request(true);
  $('setup-skip').onclick=()=>{if(this.stage==='setup')this.applyPosture();if(!this.head)this.request(false);this.close();};
  $('setup-retry').onclick=()=>this.begin();
  $('setup-next').onclick=()=>this.next();
  $('setup-finish').onclick=()=>this.close();
  $('setup-open').onclick=()=>this.open();
  this.dialog.addEventListener('cancel',()=>this.close());
  $('setup-start').disabled=false;$('setup-loading').hidden=true;
  this.open();
 }
 attach(head,body){this.head=head;this.body=body;$('setup-start').disabled=false;$('setup-loading').hidden=true;}
 async request(calibrate){
  if(this.requesting)return;this.requesting=true;$('setup-start').disabled=true;
  $('setup-loading').hidden=false;$('setup-loading').textContent='Starting camera… Allow camera access to continue.';
  try{await this.onRequest();if(calibrate&&this.stage!=='closed')this.begin();}
  catch(e){const message='Camera could not start. Allow camera access and try again. '+e.message;$('setup-loading').hidden=false;$('setup-loading').textContent=message;$('head-status').textContent=message;}
  finally{this.requesting=false;$('setup-start').disabled=false;}
 }
 open(){
  this.stage='setup';$('setup-mode').value=$('play-posture')?.value||($('body-mode').value==='standing'?'standing':'seated');
  this.wasCameraVisible=document.body.classList.contains('show-camera');
  this.wasPaused=this.head?.mode==='off';
  if(this.wasPaused){$('head-mode').value='first';$('head-mode').dispatchEvent(new Event('change'));}
  this.render();this.dialog.showModal();
 }
 applyPosture(){
  const posture=$('setup-mode').value;
  if($('play-posture')){$('play-posture').value=posture;$('play-posture').dispatchEvent(new Event('change'));}
  if(posture==='reclined')$('body-mode').value='off';
  else if($('body-mode').value!=='off')$('body-mode').value=posture;
  $('body-mode').dispatchEvent(new Event('change'));
 }
 begin(){
  if(!this.head)return;
  const distance=$('setup-distance');if(!distance.reportValidity()||!$('setup-fov').reportValidity()||!$('setup-fov').value)return;
  this.distance=distance.value?Number(distance.value)/100:null;
  this.head.hfov=Number($('setup-fov').value)*Math.PI/180;
  this.applyPosture();
  this.capture=new NeutralCapture();this.stage='center';this.lastSample=-1;this.ranges=[0,0,0];this.rangeSamples=[[],[],[]];this.render();
 }
 next(){
  if(this.stage==='side'){this.stage='depth';this.render();}
  else if(this.stage==='depth'){
   // Conservative recommendations: observed comfortable lean maps to 15cm.
   // Never amplify tiny/noisy motion; skipped axes retain the existing setting.
   for(const [axis,id,out] of [[0,'lateral-sensitivity','lateral-gain'],[2,'depth-sensitivity','depth-gain']]){
    if(this.ranges[axis]>.035){const gain=Math.max(.5,Math.min(4,Math.round(.15/this.ranges[axis]*4)/4));$(id).value=gain;$(out).textContent=gain+'×';}
   }
   this.stage='done';this.render();
  }
 }
 close(){
  this.stage='closed';this.dialog.close();
  if(!this.wasCameraVisible)document.body.classList.remove('show-camera');
  $('show-camera').textContent=document.body.classList.contains('show-camera')?'Hide camera':'Show camera';
  if(this.wasPaused){$('head-mode').value='off';$('head-mode').dispatchEvent(new Event('change'));}
 }
 render(){
  for(const id of ['setup-intro','setup-live','setup-complete'])$(id).hidden=true;
  $('setup-start').hidden=this.stage!=='setup';$('setup-next').hidden=!['side','depth'].includes(this.stage);
  $('setup-retry').hidden=!['side','depth','done'].includes(this.stage);$('setup-finish').hidden=this.stage!=='done';
  $('setup-skip').textContent=this.stage==='setup'?'Skip setup':'Close setup';
  if(this.stage==='setup'){$('setup-intro').hidden=false;$('setup-title').textContent='Set up your playing position';return;}
  if(this.stage==='done'){
   $('setup-title').textContent='Ready to play';$('setup-complete').hidden=false;
   $('setup-result').textContent=`Your center is saved. Left/right ${$('lateral-sensitivity').value}× · forward/back ${$('depth-sensitivity').value}×. Head turn and up/down remain separately adjustable.`;
   return;
  }
  $('setup-live').hidden=false;
  $('setup-title').textContent=this.stage==='center'?'Find your comfortable center':this.stage==='side'?'Lean gently left and right':'Lean gently forward and back';
  $('setup-instruction').textContent=this.stage==='center'?'Keep the phone fixed facing you. Rest comfortably, seated or lying down, and look toward the screen. Only your face is needed.':this.stage==='side'?'Move gently left and right as far as comfortable. You can skip this if resting against a pillow.':'Move your head nearer and farther from the screen if comfortable, or continue to keep your sensitivity.';
  $('setup-next').textContent=this.stage==='depth'?'Use this range':'Continue';
 }
 update(now){
  if(!['center','side','depth'].includes(this.stage))return;
  const video=this.head.video,canvas=$('setup-camera');
  if(video.readyState>=2){const height=Math.round(canvas.width*video.videoHeight/video.videoWidth);if(canvas.height!==height)canvas.height=height;const ctx=canvas.getContext('2d');ctx.save();ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.restore();}
  const fit=this.head.window.latest,stamp=this.head.window.seen;
  const status=$('setup-feedback');
  if(this.stage==='center'){
   const done=this.capture.add(fit,stamp,now);$('setup-progress').value=this.capture.progress(now);
   status.textContent=now-stamp>300?'Keep your whole face visible; waiting for a clear view.':`Hold still · ${Math.round(this.capture.progress(now)*100)}%${this.body?.pose.neutral?' · shoulders ready':' · shoulders optional for head control'}`;
   if(done){
    const depths=this.capture.samples.map(s=>s.position[2]).sort((a,b)=>a-b),scale=this.distance?this.distance/depths[Math.floor(depths.length/2)]:1;
    if(scale<.4||scale>2.5){this.stage='setup';this.render();$('setup-loading').hidden=false;$('setup-loading').textContent='That distance differs too much from the camera estimate. Check the measurement or leave it blank.';return;}
    this.head.calibrate(this.capture.samples,this.distance);this.body?.pose.recenter($('body-mode').value);this.stage='side';this.render();
   }
  }else{
   if(now-stamp<300&&stamp!==this.lastSample){
    this.lastSample=stamp;const axis=this.stage==='side'?0:2,values=this.rangeSamples[axis];
    values.push(Math.abs(this.head.window.target[axis]));
    // Ignore isolated spikes when selecting a comfortable movement extent.
    const sorted=[...values].sort((a,b)=>a-b);this.ranges[axis]=values.length>=8?sorted[Math.floor((sorted.length-1)*.9)]:0;
   }
   const extent=this.ranges[this.stage==='side'?0:2];$('setup-progress').value=Math.min(1,extent/.08);
   status.textContent=now-stamp>300?'Face lost; move back into view.':extent>.035?'Comfortable movement detected. Continue when ready.':'Make a small comfortable lean, or continue to keep the current sensitivity.';
  }
 }
}
