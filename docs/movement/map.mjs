import {computeBoundsTree,acceleratedRaycast} from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.15/build/index.module.js';
import {mergeGeometries} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import {OBJLoader} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/OBJLoader.js';
import {MTLLoader} from 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/loaders/MTLLoader.js';
export class DustMap {
 constructor(scene){this.scene=scene;this.ready=false;this.meshes=[];this.ray=new THREE.Raycaster();this.spawn=new THREE.Vector3();this.eye=1.65;}
 async load(){
  const base=new URL('./dust2/',import.meta.url).href;
  const materials=await new MTLLoader().setPath(base).loadAsync('de_dust2.mtl');materials.preload();
  const obj=await new OBJLoader().setMaterials(materials).setPath(base).loadAsync('de_dust2.obj');
  obj.rotation.x=-Math.PI/2;obj.scale.setScalar(.0254);this.scene.add(obj);obj.updateMatrixWorld(true);
  obj.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();const many=Array.isArray(m.material),mats=many?m.material:[m.material];const basic=mats.map(old=>new THREE.MeshBasicMaterial({map:old.map,color:old.color,side:THREE.DoubleSide}));m.material=many?basic:basic[0];this.meshes.push(m);}});
  // Collision uses one position-only mesh, without thousands of material groups.
  const parts=this.meshes.map(m=>{const g=new THREE.BufferGeometry();g.setAttribute('position',m.geometry.getAttribute('position').clone());if(m.geometry.index)g.setIndex(m.geometry.index.clone());g.applyMatrix4(m.matrixWorld);return g;});
  const geometry=mergeGeometries(parts,false);for(const p of parts)p.dispose();computeBoundsTree.call(geometry);
  const collision=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));collision.raycast=acceleratedRaycast;collision.updateMatrixWorld(true);this.meshes=[collision];
  for(const [x,z] of [[-38,20],[-30,20],[-20,20],[0,0],[-10,-20]]){const y=this.floor(x,z,12);if(y!==null){this.spawn.set(x,y+this.eye,z);this.ready=true;return;}}
  throw Error('No walkable spawn found');
 }
 floor(x,z,top){this.ray.set(new THREE.Vector3(x,top,z),new THREE.Vector3(0,-1,0));this.ray.far=25;for(const h of this.ray.intersectObjects(this.meshes,false)){const normal=h.face.normal.clone().transformDirection(h.object.matrixWorld);if(normal.y>.5)return h.point.y;}return null;}
 blocked(position,dx,dz,base=position.y-this.eye){const length=Math.hypot(dx,dz);if(!length)return false;const direction=new THREE.Vector3(dx/length,0,dz/length);for(const height of [.08,.8,1.6]){this.ray.set(new THREE.Vector3(position.x,base+height,position.z),direction);this.ray.far=length+.25;if(this.ray.intersectObjects(this.meshes,false).length)return true;}return false;}
 clearAbove(x,z,base){this.ray.set(new THREE.Vector3(x,base+.02,z),new THREE.Vector3(0,1,0));this.ray.far=1.75;return !this.ray.intersectObjects(this.meshes,false).length;}
 move(position,dx,dz){
  if(!this.ready)return;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1)),stepHeight=.55;
  for(let i=0;i<steps;i++)for(const [sx,sz] of [[dx/steps,0],[0,dz/steps]]){
   if(!sx&&!sz)continue;
   const length=Math.hypot(sx,sz),x=position.x+sx,z=position.z+sz,oldFloor=position.y-this.eye;
   const y=this.floor(x,z,oldFloor+stepHeight);
   if(y===null||y<oldFloor-1.5)continue;
   // Probe the same distance as the body clearance rays, so a stair riser does
   // not block us before the feet reach its top. Test the body at step height.
   const frontX=x+sx/length*.25,frontZ=z+sz/length*.25;
   const ahead=this.floor(frontX,frontZ,oldFloor+stepHeight),base=Math.max(oldFloor,y,ahead??oldFloor);
   if(!this.clearAbove(x,z,base)||!this.clearAbove(frontX,frontZ,base)||this.blocked(position,sx,sz,base))continue;
   position.set(x,y+this.eye,z);
  }
 }
}
