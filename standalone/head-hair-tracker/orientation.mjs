import {rotation} from './spatial.mjs';
// Relative screen-space rotation handles a sideways/reclined neutral face.
export function relativeAngles(current,neutral){
 const a=rotation(current),b=rotation(neutral),s=[-1,-1,1];
 const r=Array.from({length:9},(_,n)=>{const i=Math.floor(n/3),j=n%3;return s[i]*s[j]*(a[i*3]*b[j*3]+a[i*3+1]*b[j*3+1]+a[i*3+2]*b[j*3+2]);});
 return {pitch:Math.asin(Math.max(-1,Math.min(1,-r[5]))),yaw:Math.atan2(r[2],r[8]),roll:Math.atan2(r[3],r[4])};
}
