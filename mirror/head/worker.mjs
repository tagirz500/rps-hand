import { FilesetResolver, FaceLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { facePose } from './pose.mjs?v=recline5';
import {fitHead} from './spatial.mjs?v=recline5';

let tracker,previous=null,lastSeen=-Infinity,lastFov=null;
try {
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm', true);
  const opts = { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false };
  let delegate;
  for(delegate of ['GPU','CPU']){
    try {opts.baseOptions.delegate=delegate;tracker=await FaceLandmarker.createFromOptions(files,opts);break;}
    catch(e){if(delegate==='CPU')throw e;}
  }
  postMessage({ type: 'ready', delegate });
} catch (e) { postMessage({ type: 'error', message: e.message }); }

onmessage = ({ data }) => {
  const { frame, ts, hfov=Math.PI/3 } = data;
  if (!frame) return;
  try {
    const result = tracker.detectForVideo(frame, ts);
    const points=result.faceLandmarks[0],aspect=frame.width/frame.height,base=facePose(points,aspect);
    if(ts-lastSeen>650||hfov!==lastFov)previous=null;
    const fit=base?fitHead(points,aspect,base,hfov,previous):null;
    if(fit){previous=fit.parameters;lastSeen=ts;lastFov=hfov;}
    postMessage({ type:'pose',ts,pose:fit?{...base,yaw:fit.yaw,pitch:fit.pitch,fit}:null });
  } catch (e) { postMessage({ type: 'error', message: e.message }); }
  finally { frame.close(); }
};
