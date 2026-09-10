import { FilesetResolver, FaceLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { facePose } from './pose.mjs?v=fast7';

let tracker;
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
  const { frame, ts } = data;
  if (!frame) return;
  try {
    const result = tracker.detectForVideo(frame, ts);
    postMessage({ type: 'pose', ts, pose: facePose(result.faceLandmarks[0], frame.width / frame.height) });
  } catch (e) { postMessage({ type: 'error', message: e.message }); }
  finally { frame.close(); }
};
