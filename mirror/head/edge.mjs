export function paddingPlan(centerX,centerY,width,height){
 const px=centerX<.30||centerX>.70?Math.round(width*.35):0;
 const py=centerY<.30||centerY>.70?Math.round(height*.35):0;
 return {width:width+px,height:height+py,x:centerX<.30?px:0,y:centerY<.30?py:0};
}
export function unpadLandmarks(points,plan,width,height){
 return points.map(p=>({...p,x:(p.x*plan.width-plan.x)/width,y:(p.y*plan.height-plan.y)/height}));
}

const anchors=[33,133,263,362,168,6,1,10,151,109,338,54,284];
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
// Patch correlation bridges brief detector misses at the frame boundary. It only
// estimates image translation from visible facial features; 3D pose stays with
// the perspective solver and its existing plausibility checks.
export function trackFeatureTranslation(previous,current,points,{radius=3,search=28}={}){
 if(!previous||!current||previous.width!==current.width||previous.height!==current.height||!points)return null;
 const {width,height}=previous,matches=[];
 for(const id of anchors){
  const point=points[id];if(!point)continue;
  const x=Math.round(point.x*width),y=Math.round(point.y*height);
  if(x<radius||x>=width-radius||y<radius||y>=height-radius)continue;
  let best={score:-2,dx:0,dy:0};
  for(let dy=-search;dy<=search;dy+=2)for(let dx=-search;dx<=search;dx+=2){
   const qx=x+dx,qy=y+dy;if(qx<radius||qx>=width-radius||qy<radius||qy>=height-radius)continue;
   let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;
   for(let py=-radius;py<=radius;py++)for(let px=-radius;px<=radius;px++){
    const a=previous.data[(y+py)*width+x+px],b=current.data[(qy+py)*width+qx+px];
    sa+=a;sb+=b;saa+=a*a;sbb+=b*b;sab+=a*b;n++;
   }
   const denominator=Math.sqrt(Math.max(1e-9,(n*saa-sa*sa)*(n*sbb-sb*sb)));
   const score=(n*sab-sa*sb)/denominator;if(score>best.score)best={score,dx,dy};
  }
  if(best.score>.68)matches.push(best);
 }
 if(matches.length<2)return null;
 const dx=median(matches.map(m=>m.dx)),dy=median(matches.map(m=>m.dy));
 const consistent=matches.filter(m=>Math.hypot(m.dx-dx,m.dy-dy)<=4);
 if(consistent.length<2)return null;
 return {dx:median(consistent.map(m=>m.dx)),dy:median(consistent.map(m=>m.dy)),quality:median(consistent.map(m=>m.score)),matches:consistent.length};
}
