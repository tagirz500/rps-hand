export class HairHeadTracker {
  constructor({onPose=()=>{},onStatus=()=>{},hfov=Math.PI/3}={}){
    this.onPose=onPose;this.onStatus=onStatus;this.hfov=hfov;this.busy=false;this.closed=false;
    this.worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    this.ready=new Promise((resolve,reject)=>{
      this.worker.onmessage=({data})=>{
        if(data.type==='ready'){this.onStatus({state:'ready',delegate:data.delegate});resolve(data);return;}
        if(data.type==='error'){this.busy=false;this.onStatus({state:'error',message:data.message});reject(new Error(data.message));return;}
        if(data.type==='pose'){this.busy=false;this.onPose(data);}
      };
      this.worker.onerror=event=>{this.busy=false;reject(new Error(event.message||'Head tracking worker failed'));};
    });
  }
  async track(source,ts=performance.now()){
    if(this.busy||this.closed)return false;
    await this.ready;this.busy=true;
    try{
      const sourceWidth=source.videoWidth||source.width,sourceHeight=source.videoHeight||source.height;
      const width=Math.min(384,sourceWidth),height=Math.round(width*sourceHeight/sourceWidth);
      const frame=await createImageBitmap(source,{resizeWidth:width,resizeHeight:height});
      this.worker.postMessage({frame,ts,hfov:this.hfov},[frame]);return true;
    }catch(error){this.busy=false;throw error;}
  }
  close(){this.closed=true;this.worker.terminate();}
}
