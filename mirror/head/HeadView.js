import { ViewPose, windowFrustum, gentleHeadTranslation } from './pose.mjs?v=hair9';
import {SpatialPose,median} from './spatial.mjs?v=hair9';

export class HeadView {
  constructor(video, camera, { mode, recenter, status, sensitivity, lateralSensitivity, depthSensitivity, verticalSensitivity, hfov = Math.PI/3 }) {
    this.video = video; this.camera = camera; this.status = status;
    this.pose = new ViewPose(); this.pose.preserveNeutral=true; this.window = new SpatialPose(); this.mode = mode.value; this.hfov = hfov; this.busy = false; this.ready = false; this.failed = false;
    this.pose.mode = this.mode;
    this.sensitivity=sensitivity;
    this.lateralSensitivity=lateralSensitivity; this.depthSensitivity=depthSensitivity; this.verticalSensitivity=verticalSensitivity;
    this.performance={fps:0,frames:0,start:performance.now(),latency:0,delegate:""};
    this.lastCapture = -Infinity; this.lastVideo = -1;
    this.completedFrames=0;
    this.worker = new Worker(new URL('./worker.mjs?v=hair9', import.meta.url), { type: 'module' });
    const fail = () => { this.failed = true; this.busy = false; this.worker.terminate(); clearTimeout(this.timer); };
    this.worker.onerror = fail;
    this.worker.onmessage = ({ data }) => {
      if(data.type==='pose')this.completedFrames++;
      if (data.type === 'error') return fail();
      if (data.type === 'ready') { this.performance.delegate=data.delegate; this.ready = true; clearTimeout(this.timer); }
      if (data.type === 'pose') { this.busy = false; const now=performance.now(); this.performance.frames++; this.performance.latency=now-data.ts;if(data.recoveredByPadding||data.recoveredByMotion)this.lastEdgeRecovery=now;if(data.recoveredByHair)this.lastHairRecovery=now; if(now-this.performance.start>=1000){this.performance.fps=Math.round(this.performance.frames*1000/(now-this.performance.start));this.performance.frames=0;this.performance.start=now;} if(this.window.receive(data.pose?.fit, now))this.pose.receive(data.pose, now); }
    };
    this.timer = setTimeout(fail, 60000);
    mode.onchange = () => { this.mode = mode.value; this.pose.mode = mode.value; this.pose.recenter(); this.window.recenter(); };
    recenter.onclick = () => { this.pose.recenter(); this.window.recenter(); };
    addEventListener('pagehide', () => { this.worker.terminate(); clearTimeout(this.timer); }, { once: true });
  }
  calibrate(samples,distance=null){
    this.window.calibrate(samples,distance);
    this.pose.neutral={...this.pose.latest,yaw:median(samples.map(s=>s.yaw)),pitch:median(samples.map(s=>s.pitch))};
    if(samples.every(s=>s.parameters))this.pose.neutral.fit={parameters:[0,1,2,3,4,5].map(i=>median(samples.map(s=>s.parameters[i])))};
    this.pose.yaw=this.pose.pitch=this.pose.physicalYaw=this.pose.physicalPitch=this.pose.physicalRoll=0;
  }
  async capture(now) {
    if (this.failed || !this.ready || this.busy || this.body?.busy || this.body?.wantsFrame(now) || this.pose.mode === 'off' || document.hidden || now-this.lastCapture < 30 || this.video.readyState < 2 || this.video.currentTime === this.lastVideo) return;
    this.busy = true; this.lastCapture = now; this.lastVideo = this.video.currentTime;
    try {
      const width = Math.min(384, this.video.videoWidth);
      const frame = await createImageBitmap(this.video, { resizeWidth: width, resizeHeight: Math.round(width*this.video.videoHeight/this.video.videoWidth) });
      this.worker.postMessage({ frame, ts: now, hfov:this.hfov }, [frame]);
    } catch { this.busy = false; this.failed = true; this.worker.terminate(); }
  }
  update(now, dt) {
    this.capture(now);
    this.pose.sensitivity=Number(this.sensitivity.value);
    const { yaw, pitch } = this.pose.update(now, dt);
    let eye = [...this.window.update(now, dt, this.mode === 'window' || this.mode === 'first')];
    this.origin=[0,0,(this.window.neutral?.[2]??.6)*this.window.scale];
    if (this.mode === 'first') eye=gentleHeadTranslation(eye,.45,Number(this.lateralSensitivity?.value ?? 2),Number(this.depthSensitivity?.value ?? 2),Number(this.verticalSensitivity?.value ?? 2));
    this.camera.position.set(...eye);
    this.camera.rotation.set(this.mode === 'window' ? 0 : pitch, this.mode === 'window' ? 0 : yaw, 0, 'YXZ');
    this.camera.updateProjectionMatrix();
    if (this.mode === 'window') {
      const f=windowFrustum(eye,this.camera.fov,this.camera.aspect,this.camera.zoom,this.camera.near);
      this.camera.projectionMatrix.makePerspective(f.left,f.right,f.top,f.bottom,this.camera.near,this.camera.far);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }
    this.status.textContent = this.mode === 'off' ? 'View paused' : this.failed ? 'Head tracking unavailable — reload to try again' : !this.ready ? 'Loading head tracking…' : now-this.pose.seen > 650 ? 'Head fully out of frame · visible shoulders and arms still track' : now-(this.lastHairRecovery??-Infinity)<250?'Face hidden · following hair and head outline':now-this.pose.seen>100?'Face partly lost · continuing last motion':now-(this.lastEdgeRecovery??-Infinity)<250?'Face at camera edge · recovered':`Head: ${this.performance.fps} fps · ${Math.round(this.performance.latency)} ms · depth estimated`;
  }
}
