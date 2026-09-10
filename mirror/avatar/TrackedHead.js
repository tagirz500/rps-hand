import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class TrackedHead {
  constructor(world, canvas, label) {
    this.label=label; this.canvas=canvas;
    this.object=new THREE.Group(); world.add(this.object);
    this.preview=new THREE.Scene(); this.preview.background=new THREE.Color(0x192633);
    this.turn=new THREE.Group(); this.preview.add(this.turn);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.setSize(140,170,false);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.camera=new THREE.PerspectiveCamera(34,140/170,.01,2);
    this.camera.position.set(0,.025,.52); this.camera.lookAt(0,.025,0);
    this.preview.add(new THREE.HemisphereLight(0xffffff,0x617b92,2));
    const light=new THREE.DirectionalLight(0xffedd8,2.4); light.position.set(-1,2,3);this.preview.add(light);
    new GLTFLoader().load(new URL('./head.glb',import.meta.url).href, gltf=>{
      // The local eye camera excludes layer 1 so it cannot see inside its own head.
      const actual=gltf.scene; actual.traverse(o=>o.layers.set(1));this.object.add(actual);
      const visible=actual.clone(true); visible.traverse(o=>o.layers.set(0));
      visible.rotation.y=Math.PI; this.turn.add(visible); this.loaded=true;
    },undefined,()=>{this.label.textContent='Head model unavailable';});
  }
  update(camera, headView, now) {
    this.object.position.copy(camera.position);
    // The avatar shows physical head angles; only the view uses navigation gain.
    this.object.rotation.set(headView?.pose.physicalPitch??0,headView?.pose.physicalYaw??0,0,'YXZ');
    const tracking=headView && now-headView.pose.seen<650;
    // Preview is a mirror of the user's pose, without the navigation gain.
    this.turn.rotation.set(-(headView?.pose.physicalPitch??0),-(headView?.pose.physicalYaw??0),0,'YXZ');
    if(this.loaded) this.label.textContent=tracking?'Your head · tracking':'Your head · preview';
    if(this.canvas.clientHeight && !document.hidden) this.renderer.render(this.preview,this.camera);
  }
}
