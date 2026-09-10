import { FilesetResolver, FaceLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { facePose } from './pose.mjs?v=hair9';
import {fitHead,rotation} from './spatial.mjs?v=hair9';
import {paddingPlan,unpadLandmarks,trackFeatureTranslation,trackPointTranslation,selectHeadTexturePoints} from './edge.mjs?v=hair9';

let tracker,previous=null,lastSeen=-Infinity,lastFov=null,lastCenter={x:.5,y:.5},lastPoints=null,lastOutline=[],previousGray=null;
function grayscale(frame){
 if(typeof OffscreenCanvas==='undefined')return null;
 try{
  const width=192,height=Math.max(96,Math.round(width*frame.height/frame.width));
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(frame,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height).data,data=new Uint8Array(width*height);
  for(let i=0,j=0;i<rgba.length;i+=4,j++)data[j]=(rgba[i]*3+rgba[i+1]*6+rgba[i+2])*.1;
  return {width,height,data};
 }catch{return null;}
}
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
    const currentGray=grayscale(frame);
    let result = tracker.detectForVideo(frame, ts),points=result.faceLandmarks[0],detectedByModel=!!points,recoveredByPadding=false,recoveredByMotion=false,recoveredByHair=false,motion=null;
    // On a miss near an image boundary, retry in a padded canvas. This keeps the
    // visible eye/face pixels away from the detector's hard input boundary.
    if(!points&&typeof OffscreenCanvas!=='undefined'&&ts-lastSeen<1600&&(lastCenter.x<.3||lastCenter.x>.7||lastCenter.y<.3||lastCenter.y>.7)){
      const plan=paddingPlan(lastCenter.x,lastCenter.y,frame.width,frame.height);
      const padded=new OffscreenCanvas(plan.width,plan.height),ctx=padded.getContext('2d');
      ctx.fillStyle='#000';ctx.fillRect(0,0,plan.width,plan.height);ctx.drawImage(frame,plan.x,plan.y);
      result=tracker.detectForVideo(padded,ts+.01);points=result.faceLandmarks[0];
      if(points){points=unpadLandmarks(points,plan,frame.width,frame.height);detectedByModel=true;recoveredByPadding=true;}
    }
    if(!points&&ts-lastSeen<900&&lastPoints&&previousGray&&currentGray){
      if(lastOutline.length>=3){motion=trackPointTranslation(previousGray,currentGray,lastOutline,{search:34,minMatches:3,minScore:.62});recoveredByHair=!!motion;}
      if(!motion)motion=trackFeatureTranslation(previousGray,currentGray,lastPoints);
      if(motion){points=lastPoints.map(p=>({...p,x:p.x+motion.dx/currentGray.width,y:p.y+motion.dy/currentGray.height}));recoveredByMotion=true;}
    }
    const aspect=frame.width/frame.height,base=facePose(points,aspect);
    if(ts-lastSeen>1600||hfov!==lastFov)previous=null;
    let fit=base?fitHead(points,aspect,base,hfov,previous):null;
    // Once every canonical face point has crossed the boundary, visible hair can
    // still measure image translation. Move the last solved 3D eye position by
    // that measured displacement while retaining the last reliable head angles.
    if(!fit&&base&&motion&&recoveredByHair&&previous){
      const p=[...previous],focal=1/(2*Math.tan(hfov/2));p[3]+=motion.dx/currentGray.width*p[5]/focal;p[4]+=motion.dy/currentGray.height/aspect*p[5]/focal;
      const r=rotation(p);fit={position:p.slice(3),yaw:Math.atan2(r[2],r[8]),pitch:Math.atan2(r[5],Math.hypot(r[2],r[8])),error:0,quality:motion.quality,visiblePoints:0,edge:-1,parameters:p,motionOnly:true};
    }
    if(fit){
      previous=fit.parameters;lastSeen=ts;lastFov=hfov;lastCenter={x:base.centerX,y:base.centerY};lastPoints=points;
      if(detectedByModel)lastOutline=selectHeadTexturePoints(currentGray,points);else if(motion)lastOutline=lastOutline.map(p=>({...p,x:p.x+motion.dx/currentGray.width,y:p.y+motion.dy/currentGray.height}));
      previousGray=currentGray;
    }
    postMessage({ type:'pose',ts,pose:fit?{...base,yaw:fit.yaw,pitch:fit.pitch,fit}:null,landmarksDetected:detectedByModel,recoveredByPadding,recoveredByMotion,recoveredByHair,outlinePoints:lastOutline.length });
  } catch (e) { postMessage({ type: 'error', message: e.message }); }
  finally { frame.close(); }
};
