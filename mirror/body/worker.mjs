import {FilesetResolver,PoseLandmarker} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import {upperBodyPose} from './pose.mjs?v=body1';
let tracker;
try{
  const files=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',true);
  let delegate;
  for(delegate of ['GPU','CPU']){
    try{
      tracker=await PoseLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate},
        runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false,
        minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5
      });break;
    }catch(e){if(delegate==='CPU')throw e;}
  }
  postMessage({type:'ready',delegate});
}catch(e){postMessage({type:'error',message:e.message});}
onmessage=({data:{frame,ts}})=>{
  if(!frame)return;
  try{
    const start=performance.now(),result=tracker.detectForVideo(frame,ts);
    postMessage({type:'pose',ts,inferenceMs:performance.now()-start,
      pose:upperBodyPose(result.landmarks[0],result.worldLandmarks[0])});
  }catch(e){postMessage({type:'error',message:e.message});}
  finally{frame.close();}
};
