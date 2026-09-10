import {relativeAngles} from './orientation.mjs';
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

// Face mesh coordinates: x right, y down (height units), z away (width units).
// A cheek/forehead/chin plane estimates orientation without depending on mouth shape.
export function facePose(points, aspect = 1) {
  if (!points || points.length < 455) return null;
  const sub = (a, b) => [a.x-b.x, (a.y-b.y)/aspect, a.z-b.z];
  const x = sub(points[454], points[234]), y = sub(points[152], points[10]);
  const n = [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]];
  if (n[2] < 0) n.forEach((_, i) => n[i] *= -1);
  if (Math.hypot(...n) < 1e-7) return null;
  const pose = {
    centerX: (points[33].x + points[263].x) / 2,
    centerY: (points[33].y + points[263].y) / 2,
    span: Math.hypot(...sub(points[263], points[33])),
    yaw: Math.atan2(n[0], n[2]),
    pitch: Math.atan2(n[1], Math.hypot(n[0], n[2]))
  };
  return Object.values(pose).every(v => typeof v === 'boolean' || Number.isFinite(v)) ? pose : null;
}

// Eye position relative to a neutral viewer, metres in mirrored scene coordinates.
// 3D outer-eye span reduces false depth changes from turning the head.
export class WindowPose {
  constructor() { this.neutral = null; this.seen = -Infinity; this.target = [0,0,0]; this.eye = [0,0,0]; }
  recenter() { this.neutral = null; this.target = [0,0,0]; }
  receive(p, now, aspect, hfov) {
    if (!p || !Number.isFinite(p.span) || p.span < .025) return;
    if (now - this.seen > 1500 && !this.preserveNeutral) this.neutral = null;
    this.neutral ??= {...p}; this.seen = now;
    const distance = .45, depth = distance * this.neutral.span / p.span;
    const k = 2 * Math.tan(hfov / 2), n = this.neutral;
    this.target = [
      clamp(-k*((p.centerX-.5)*depth-(n.centerX-.5)*distance), .20),
      clamp(-k*((p.centerY-.5)*depth-(n.centerY-.5)*distance)/aspect, .16),
      Math.max(-.18, Math.min(.30, depth-distance))
    ];
  }
  update(now, dt, enabled = true) {
    const target = enabled && now-this.seen < 650 ? this.target : [0,0,0];
    const fast=Math.hypot(...target.map((v,i)=>v-this.eye[i]))>.025;
    const a = 1-Math.exp(-Math.min(dt,.1)/(fast?.012:.025));
    this.eye = this.eye.map((v,i) => enabled ? v+(target[i]-v)*a : 0);
    return this.eye;
  }
}

// Fixed virtual screen at z=-distance. Its edges remain fixed as the eye moves.
export function windowFrustum(eye, fov, aspect, zoom, near, distance=.35) {
  const halfY = distance * Math.tan(fov*Math.PI/360) / zoom;
  const halfX = halfY * aspect, scale = near/(distance+eye[2]);
  return { left:(-halfX-eye[0])*scale, right:(halfX-eye[0])*scale,
    top:(halfY-eye[1])*scale, bottom:(-halfY-eye[1])*scale };
}

// Approximate viewer eye origin in the first-person world. The phone observes
// the user from the opposite side, so this is a proper 180-degree Y rotation.
export function firstPersonOrigin(neutral, aspect, hfov) {
  if (!neutral) return [0,.10,.60];
  const k=2*Math.tan(hfov/2);
  const depth=Math.max(.28,Math.min(.9,.09/(k*neutral.span)));
  return [-k*(neutral.centerX-.5)*depth,-k*(neutral.centerY-.5)*depth/aspect,depth];
}

export function gentleHeadTranslation(offset, depth, lateralGain = 2, depthGain = 2, verticalGain = 2) {
  const scale=depth/.45;
  const gain=v=>Number.isFinite(v)?Math.max(0,Math.min(4,v)):2;
  const x=clamp(offset[0]*scale*gain(lateralGain),.50), y=clamp(offset[1]*scale*gain(verticalGain),.30);
  const z=clamp(offset[2]*scale*gain(depthGain),.50);
  // Lean is a bounded position offset, not velocity: holding still never drifts.
  return [x,y,z];
}

export class ViewPose {
  constructor() { this.mode = 'head'; this.sensitivity=5; this.physicalYaw=0; this.physicalPitch=0;this.physicalRoll=0;this.recoveryUntil=0; this.neutral = null; this.latest = null; this.seen = -Infinity; this.yaw = 0; this.pitch = 0; }
  recenter() { this.neutral = null; this.latest = null; }
  receive(pose, now) {
    if (!pose) return;
    if(Number.isFinite(this.seen)&&now-this.seen>650)this.recoveryUntil=now+350;
    // Reacquisition uses a fresh neutral rather than jumping to an old offset.
    if (now - this.seen > 1500 && !this.preserveNeutral) this.neutral = null;
    this.latest = pose; this.seen = now;
    this.neutral ??= { ...pose };
  }
  update(now, dt) {
    let yaw = 0, pitch = 0, physicalYaw=0, physicalPitch=0,physicalRoll=0;
    if (this.mode !== 'off' && this.latest && this.neutral && (now - this.seen < 650||this.preserveNeutral)) {
      // n points INTO the head (+z), opposite the viewing direction. With the
      // image mirrored, a positive plane yaw looks screen-right (negative camera yaw).
      physicalYaw=-(this.latest.yaw-this.neutral.yaw);
      physicalPitch=this.latest.pitch-this.neutral.pitch;
      if(this.latest.fit?.parameters&&this.neutral.fit?.parameters){const relative=relativeAngles(this.latest.fit.parameters,this.neutral.fit.parameters);physicalYaw=relative.yaw;physicalPitch=relative.pitch;physicalRoll=clamp(relative.roll,.75);}
      const deadzone=v=>Math.sign(v)*Math.max(0,Math.abs(v)-.025);
      yaw=this.mode==='first'?deadzone(physicalYaw)*this.sensitivity:physicalYaw*.65;
      pitch=this.mode==='first'?deadzone(physicalPitch)*this.sensitivity*.6:physicalPitch*.65;
    }
    const fast=Math.max(Math.abs(physicalYaw-this.physicalYaw),Math.abs(physicalPitch-this.physicalPitch))>.06;
    const a = 1 - Math.exp(-Math.min(dt, .1) / (now<this.recoveryUntil?.12:fast?.012:.03));
    this.physicalYaw+=(physicalYaw-this.physicalYaw)*a;
    this.physicalPitch+=(physicalPitch-this.physicalPitch)*a;
    this.physicalRoll+=(physicalRoll-this.physicalRoll)*a;
    this.yaw += (clamp(yaw, this.mode==='first'?Math.PI:.24) - this.yaw) * a;
    this.pitch += (clamp(pitch, this.mode==='first'?1.3:.18) - this.pitch) * a;
    if (this.mode === 'off') this.yaw = this.pitch = 0;
    return { yaw: this.yaw, pitch: this.pitch };
  }
}
