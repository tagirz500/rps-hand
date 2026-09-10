import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const TIPS = new Set([4, 8, 12, 16, 20]);
const assetPromises = new Map();
const vector = p => p.isVector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z);
function palmFrame(p) {
  const y = p[9].clone().sub(p[0]).normalize();
  const x = p[5].clone().sub(p[17]); x.addScaledVector(y, -x.dot(y)).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y).normalize()));
}

// Dual-quaternion rotation plus blended stretch. A vertex fully attached to one
// bone follows its exact affine transform, including tracked segment length.
// Blended rotations retain knuckle volume rather than collapsing like LBS.
function volumeMaterial(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <skinning_pars_vertex>', `
      #include <skinning_pars_vertex>
      uniform vec4 handReal[21];
      uniform vec4 handDual[21];
      uniform mat3 handStretch[21];
      vec4 handMul(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
      vec3 handRotate(vec4 q,vec3 p){return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
      void handBlend(out vec4 r,out vec4 d,out mat3 s){
        vec4 ref=handReal[int(skinIndex.x)];r=vec4(0.0);d=vec4(0.0);s=mat3(0.0);
        for(int k=0;k<4;k++){int j=int(skinIndex[k]);float w=skinWeight[k];float signQ=dot(ref,handReal[j])<0.0?-1.0:1.0;
          r+=w*signQ*handReal[j];d+=w*signQ*handDual[j];s+=w*handStretch[j];}
        float n=max(length(r),.00001);r/=n;d/=n;d-=r*dot(r,d);
      }`);
    shader.vertexShader = shader.vertexShader.replace('#include <skinbase_vertex>', '');
    shader.vertexShader = shader.vertexShader.replace('#include <skinnormal_vertex>', `
      vec4 nr,nd;mat3 ns;handBlend(nr,nd,ns);
      objectNormal=handRotate(nr,transpose(inverse(ns))*objectNormal);
      #ifdef USE_TANGENT
      objectTangent=handRotate(nr,ns*objectTangent);
      #endif`);
    shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', `
      vec4 hr,hd;mat3 hs;handBlend(hr,hd,hs);
      transformed=handRotate(hr,hs*transformed)+2.0*handMul(hd,vec4(-hr.xyz,hr.w)).xyz;`);
  };
  material.customProgramCacheKey = () => 'tracked-hand-volume-v2';
  material.needsUpdate = true;
}

export class TrackedHand {
  static async load(base = './hand/') {
    if (!assetPromises.has(base)) assetPromises.set(base, Promise.all([
      new GLTFLoader().loadAsync(base + 'tracked-hand.glb'),
      fetch(base + 'rig.json').then(r => { if (!r.ok) throw Error('Hand joint map failed to load'); return r.json(); })
    ]));
    const [asset, manifest] = await assetPromises.get(base);
    return new TrackedHand(asset, manifest);
  }
  constructor(asset, manifest) {
    this.manifest = manifest;
    this.object = new THREE.Group(); this.object.name = 'Tracked human hand';
    this.rest = manifest.restLandmarks.map(p => new THREE.Vector3(...p));
    asset.scene.updateMatrixWorld(true);
    this.restQ = manifest.jointNames.map(n => {
      const b = asset.scene.getObjectByName(n); if (!b?.isBone) throw Error('Missing joint ' + n);
      return b.getWorldQuaternion(new THREE.Quaternion());
    });
    this.restFrame = palmFrame(this.rest);
    this.restMatrices = this.rest.map((p,i) => new THREE.Matrix4().compose(p,this.restQ[i],new THREE.Vector3(1,1,1)));
    this.bones = manifest.jointNames.map(n => { const b = new THREE.Bone(); b.name = n; return b; });
    this.bones.forEach((b,i) => {
      const parent = manifest.parents[i];
      (parent === null ? this.object : this.bones[parent]).add(b);
      const local = this.restMatrices[i].clone();
      if (parent !== null) local.premultiply(this.restMatrices[parent].clone().invert());
      b.matrix.copy(local); b.matrixAutoUpdate = false;
    });
    this.object.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones); this.skeleton.calculateInverses();
    this.uniforms = {
      handReal: { value: this.bones.map(() => new THREE.Vector4(0,0,0,1)) },
      handDual: { value: this.bones.map(() => new THREE.Vector4()) },
      handStretch: { value: this.bones.map(() => new THREE.Matrix3()) }
    };
    this.meshes = [];
    const originals = []; asset.scene.traverse(o => { if (o.isSkinnedMesh) originals.push(o); });
    if (!originals.length) throw Error('Hand asset has no skinned mesh');
    for (const source of originals) {
      const geometry = source.geometry.clone(); geometry.applyMatrix4(source.matrixWorld);
      const joints = geometry.getAttribute('skinIndex');
      const remap = source.skeleton.bones.map(b => manifest.jointNames.indexOf(b.name));
      for (let i=0;i<joints.count;i++) for (let k=0;k<4;k++) {
        const j=remap[joints.getComponent(i,k)]; if(j<0)throw Error('Unknown skin joint'); joints.setComponent(i,k,j);
      }
      const material = Array.isArray(source.material) ? source.material.map(m=>m.clone()) : source.material.clone();
      for (const m of Array.isArray(material)?material:[material]) volumeMaterial(m,this.uniforms);
      const mesh=new THREE.SkinnedMesh(geometry,material);this.object.add(mesh);mesh.bind(this.skeleton,new THREE.Matrix4());mesh.frustumCulled=false;
      mesh.castShadow=mesh.receiveShadow=true;
      mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});volumeMaterial(mesh.customDepthMaterial,this.uniforms);
      mesh.customDistanceMaterial=new THREE.MeshDistanceMaterial();volumeMaterial(mesh.customDistanceMaterial,this.uniforms);
      this.meshes.push(mesh);
    }
    this.target = this.rest.map(p=>p.clone());
    this.matrices = this.restMatrices.map(m=>m.clone());
    this.lastError = 0; this.handedness = null;
    const edges = manifest.parents.flatMap((p,i) => p===null?[]:[p,i]);
    this.edges = edges;
    const lineGeo = new THREE.BufferGeometry();lineGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(edges.length*3),3));
    this.lines=new THREE.LineSegments(lineGeo,new THREE.LineBasicMaterial({color:0x99e6cc,depthTest:false,transparent:true,opacity:.75}));this.lines.renderOrder=20;
    const dotGeo=new THREE.BufferGeometry();dotGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(63),3));
    this.dots=new THREE.Points(dotGeo,new THREE.PointsMaterial({color:0xffe186,size:.004,depthTest:false}));this.dots.renderOrder=21;
    this.object.add(this.lines,this.dots);
    this.showJoints(true);
  }
  showJoints(show) { this.lines.visible=this.dots.visible=show; }
  // Inputs are the repo's true GL points (x,-y,-z). No second filter, curl
  // inference, fixed-length retargeting, or pose presets are applied here.
  update(points, handedness='Right') {
    if(!points || points.length!==21)return false;
    const incoming=points.map(vector);
    if(incoming.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))return false;
    if(!['Right','Left'].includes(handedness))return false;
    const mirror=handedness==='Left'?-1:1;
    const p=incoming.map(v=>new THREE.Vector3(v.x*mirror,v.y,v.z));
    if(p[9].distanceTo(p[0])<.01 || p[5].clone().sub(p[17]).cross(p[9].clone().sub(p[0])).lengthSq()<1e-10)return false;
    for(let i=1;i<21;i++){const len=p[i].distanceTo(p[this.manifest.parents[i]]);if(len<.001 || len>.3)return false;}
    this.object.scale.x=mirror;this.handedness=handedness;
    const palmRotation=palmFrame(p).multiply(this.restFrame.clone().invert());
    const palmWidth=p[5].distanceTo(p[17])/this.rest[5].distanceTo(this.rest[17]);
    const palmLength=p[9].distanceTo(p[0])/this.rest[9].distanceTo(this.rest[0]);
    const radialScale=Math.sqrt(palmWidth*palmLength);
    for(let i=0;i<21;i++){
      const end=i===0?9:TIPS.has(i)?i-1:i+1;
      const restDir=this.rest[end].clone().sub(this.rest[i]);
      const targetDir=p[end].clone().sub(p[i]);
      let q=palmRotation.clone().multiply(this.restQ[i]);
      if(i!==0&&!TIPS.has(i)) q.premultiply(new THREE.Quaternion().setFromUnitVectors(restDir.clone().normalize().applyQuaternion(palmRotation),targetDir.clone().normalize()));
      if(TIPS.has(i))q=this.posedQ[i-1].clone();
      if(i===0)this.posedQ=[];this.posedQ[i]=q;
      const sy=TIPS.has(i)?1:targetDir.length()/restDir.length();
      let sx=radialScale,sz=radialScale;
      if(i===0){sx=palmWidth;sz=radialScale;}
      const stretchLocal=new THREE.Matrix4().makeScale(sx,sy,sz);
      const restRot=new THREE.Matrix4().makeRotationFromQuaternion(this.restQ[i]);
      const stretch=restRot.clone().multiply(stretchLocal).multiply(restRot.clone().invert());
      this.uniforms.handStretch.value[i].setFromMatrix4(stretch);
      const delta=q.clone().multiply(this.restQ[i].clone().invert());
      const shift=p[i].clone().sub(this.rest[i].clone().applyMatrix4(stretch).applyQuaternion(delta));
      this.uniforms.handReal.value[i].set(delta.x,delta.y,delta.z,delta.w);
      const dual=new THREE.Quaternion(shift.x,shift.y,shift.z,0).multiply(delta);
      this.uniforms.handDual.value[i].set(dual.x*.5,dual.y*.5,dual.z*.5,dual.w*.5);
      this.matrices[i].compose(p[i],q,new THREE.Vector3(sx,sy,sz));
      const parent=this.manifest.parents[i];this.bones[i].matrix.copy(this.matrices[i]);
      if(parent!==null)this.bones[i].matrix.premultiply(this.matrices[parent].clone().invert());
    }
    this.target=p;this.object.updateWorldMatrix(true,true);
    const parentInverse=this.object.parent ? this.object.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
    this.lastError=Math.max(...this.bones.map((b,i)=>b.getWorldPosition(new THREE.Vector3()).applyMatrix4(parentInverse).distanceTo(incoming[i])));
    // These dots are the actual rig bone positions, not a separate tracker drawing.
    const dots=this.dots.geometry.attributes.position,lines=this.lines.geometry.attributes.position;
    const rigPoints=this.bones.map(b=>this.object.worldToLocal(b.getWorldPosition(new THREE.Vector3())));
    rigPoints.forEach((v,i)=>dots.setXYZ(i,v.x,v.y,v.z));this.edges.forEach((j,i)=>lines.setXYZ(i,rigPoints[j].x,rigPoints[j].y,rigPoints[j].z));dots.needsUpdate=lines.needsUpdate=true;
    return true;
  }
}
