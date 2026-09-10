export function setupUI(){
 const $=id=>document.getElementById(id),panel=$('panel'),preview=$('preview');
 const keepInside=el=>{const r=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.left,innerWidth-r.width-8))+'px';el.style.top=Math.max(8,Math.min(r.top,innerHeight-r.height-8))+'px';el.style.right='auto';el.style.bottom='auto';};
 function draggable(el,handle){let drag;
  handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=el.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();});
  handle.addEventListener('pointermove',e=>{if(!drag)return;el.style.left=drag.left+e.clientX-drag.x+'px';el.style.top=drag.top+e.clientY-drag.y+'px';el.style.right='auto';el.style.bottom='auto';keepInside(el);});
  const done=()=>{drag=null;};handle.addEventListener('pointerup',done);handle.addEventListener('pointercancel',done);handle.addEventListener('lostpointercapture',done);
  handle.addEventListener('keydown',e=>{const d={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!d)return;e.preventDefault();const r=el.getBoundingClientRect();el.style.left=r.left+d[0]+'px';el.style.top=r.top+d[1]+'px';keepInside(el);});
 }
 draggable(panel,$('panelHandle'));draggable(preview,$('previewHandle'));
 $('collapse').onclick=()=>{const collapsed=panel.classList.toggle('collapsed');$('collapse').textContent=collapsed?'Show controls':'Hide controls';$('collapse').setAttribute('aria-expanded',String(!collapsed));requestAnimationFrame(()=>keepInside(panel));};
 $('hidePreview').onclick=()=>{preview.hidden=true;$('showPreview').hidden=false;};
 $('showPreview').onclick=()=>{preview.hidden=false;$('showPreview').hidden=true;keepInside(preview);};
 $('resetLayout').onclick=()=>{panel.removeAttribute('style');preview.removeAttribute('style');panel.classList.remove('collapsed');$('collapse').textContent='Hide controls';$('collapse').setAttribute('aria-expanded','true');preview.hidden=false;$('showPreview').hidden=true;};
 addEventListener('resize',()=>{if(panel.style.left)keepInside(panel);if(preview.style.left&&!preview.hidden)keepInside(preview);});
 const canvas=$('tracking'),ctx=canvas.getContext('2d');let trail=[];
 const zoomView=(hands,w,h,joystick)=>{
  const crop=handViewport(w,h,hands?.[0],joystick),box=$('previewImage');
  box.style.aspectRatio='4/3';$('cam').style.visibility=hands?.length||joystick?.centre?'visible':'hidden';const zoom=box.clientWidth/crop.width;
  for(const el of [$('cam'),canvas]){el.style.width=w*zoom+'px';el.style.height=h*zoom+'px';el.style.left=-crop.x*zoom+'px';el.style.top=-crop.y*zoom+'px';}
  const speed=Math.hypot(joystick?.x||0,joystick?.z||0);
  $('handZoomState').textContent=!joystick?.centre?'Show resting fist':joystick.active?(speed>1.01?'BOOST ':'MOVE ')+Math.round(speed*100)+'%':joystick.reason?.includes('TRACKING')||!hands?.length?'Show hand to resume':'Centre / fist = stop';
 };

 const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
 return {clear(){trail=[];ctx.clearRect(0,0,canvas.width,canvas.height);},camera(on){$('previewNote').hidden=on;this.clear();},draw(hands,w,h,active=false,joystick=null){
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;$('previewImage').style.aspectRatio=w+'/'+h;}
  ctx.clearRect(0,0,w,h);if(preview.hidden)return;zoomView(hands,w,h,joystick);
  const point=p=>[(1-p.x)*w,p.y*h];
  const now=performance.now();trail=trail.filter(p=>now-p.t<350);if(active&&hands?.length===1)trail.push({xy:point(hands[0][4]),t:now});else trail=[];
  for(const hand of hands??[]){if(hand.length!==21)continue;
   ctx.lineWidth=Math.max(2,w/240);ctx.lineCap='round';
   for(const [a,b]of edges){ctx.strokeStyle=a>=1&&b<=4?'#ffdf75':'#67ffbb';ctx.beginPath();ctx.moveTo(...point(hand[a]));ctx.lineTo(...point(hand[b]));ctx.stroke();}
   for(let i=0;i<21;i++){ctx.fillStyle=i===4?'#ffdf75':'#e5fff3';ctx.beginPath();ctx.arc(...point(hand[i]),i===4?w/65:w/160,0,Math.PI*2);ctx.fill();}
   const [x,y]=point(hand[4]);ctx.strokeStyle=active?'#ffdf75':'#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,w/38,0,Math.PI*2);ctx.stroke();
  }
  if(joystick)drawThumbJoystick(ctx,hands?.[0],w,h,joystick);
  if(trail.length>1){ctx.strokeStyle='#ffab45';ctx.lineWidth=Math.max(3,w/140);ctx.beginPath();trail.forEach((p,i)=>i?ctx.lineTo(...p.xy):ctx.moveTo(...p.xy));ctx.stroke();}
 }};
}

// Captured screen anchor and scale stay fixed while the live thumb moves.
export function drawThumbJoystick(ctx,hand,w,h,joystick){
 const {centre,scale,active,reason}=joystick;
 const vx=joystick.x||0,vz=joystick.z||0,speed=Math.min(1.6,Math.hypot(vx,vz));

 ctx.save();ctx.font=`bold ${Math.max(12,w/42)}px sans-serif`;
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 const label=(text,x,y)=>{ctx.lineWidth=5;ctx.strokeStyle='#07131fee';ctx.strokeText(text,x,y);ctx.fillStyle='#ffffff';ctx.fillText(text,x,y);};
 if(!centre||!Number.isFinite(scale)){
  label('HOLD RESTING FIST TO SET CENTRE',w/2,h-24);ctx.restore();return;
 }
 const unit=scale*w,cx=centre[0]*w,cy=centre[1]*w;
 const r=.5*unit,dead=(active?.14:.20)*unit;
 const tx=hand?.[4]?(1-hand[4].x)*w:cx,ty=hand?.[4]?hand[4].y*h:cy;
 ctx.lineWidth=Math.max(2,w/300);
 ctx.fillStyle='#06172744';ctx.strokeStyle='#ffffffdd';
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();
 if(active&&speed>0){
  const angle=Math.atan2(vz,vx);
  ctx.fillStyle='#ffdb6833';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle-.30,angle+.30);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#ffdb68';ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,r,angle-.30,angle+.30);ctx.stroke();
 }
 ctx.strokeStyle='#ffa14a99';ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(cx,cy,.8*unit,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#6dffb344';ctx.strokeStyle='#6dffb3';
 ctx.beginPath();ctx.arc(cx,cy,dead,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.setLineDash([4,5]);ctx.strokeStyle='#ffffff77';ctx.beginPath();
 ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=active?'#ffdb68':'#6dffb3';ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty);ctx.stroke();
 ctx.fillStyle='#ffdb68';ctx.beginPath();ctx.arc(tx,ty,Math.max(7,w/75),0,Math.PI*2);ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#101b25';ctx.stroke();
 const font=Math.max(7,unit*.14);ctx.font=`bold ${font}px sans-serif`;
 label('↑',cx,cy-.66*unit);label('↓',cx,cy+.66*unit);
 label('←',cx-.66*unit,cy);label('→',cx+.66*unit,cy);
 const direction=[vz<-.05?'FORWARD':vz>.05?'BACK':'',vx<-.05?'LEFT':vx>.05?'RIGHT':''].filter(Boolean).join(' ');
 const waiting=!hand||reason==='SHOW FIST TO RESUME'||reason==='TRACKING LOST';
 label(active?`${speed>1.01?'BOOST · ':''}${direction} ${Math.round(speed*100)}%`:waiting?'SHOW FIST TO RESUME':reason?.includes('FIST')?'FIST REST':'CENTRE = STOP',w/2,20);
 const barWidth=w*.24,bx=(w-barWidth)/2;
 ctx.fillStyle='#08151dcc';ctx.fillRect(bx,36,barWidth,7);
 ctx.fillStyle=active?'#ffdb68':'#6dffb3';ctx.fillRect(bx,36,barWidth*Math.min(1,speed/1.6),7);
 ctx.restore();
}

// Crop in the same mirrored pixel coordinates as the overlay. Once centred,
// the crop depends only on the saved anchor/scale, never the moving hand.
export function handViewport(w,h,hand,joystick){
 if(!w||!h)return {x:0,y:0,width:1,height:.75};
 let cx,cy,width;
 if(joystick?.centre&&joystick?.viewScale>0){
  const unit=(joystick.scale||joystick.viewScale*.55)*w;cx=joystick.centre[0]*w;cy=joystick.centre[1]*w;width=unit*2.65;
 }else if(hand?.length===21){
  const thumb=hand.slice(2,5);const xs=thumb.map(p=>(1-p.x)*w),ys=thumb.map(p=>p.y*h);
  cx=(Math.min(...xs)+Math.max(...xs))/2;cy=(Math.min(...ys)+Math.max(...ys))/2;
  width=Math.max(Math.max(...xs)-Math.min(...xs),(Math.max(...ys)-Math.min(...ys))*4/3)*1.35;
 }else{return {x:0,y:0,width:w,height:h};}
 width=Math.min(Math.max(w*.12,width),w,h*4/3);const height=width*.75;
 return {x:Math.max(0,Math.min(w-width,cx-width/2)),y:Math.max(0,Math.min(h-height,cy-height/2)),width,height};
}
