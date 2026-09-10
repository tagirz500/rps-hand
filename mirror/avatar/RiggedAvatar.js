import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const V=a=>new T.Vector3().fromArray(a);
const identity=new T.Quaternion();

// All joint translations stay in their bind pose. Tracking rotates bones only.
export class RiggedAvatar {
  constructor(scene,playerCamera,status){
    this.object=new T.Group();scene.add(this.object);this.bones={};this.bind={};this.meshes=[];
    this.playerCamera=playerCamera;this.bodyVisible=true;
    this.ready=new GLTFLoader().loadAsync(new URL('./upper-body.glb',import.meta.url).href).then(gltf=>{
      this.object.add(gltf.scene);this.object.updateMatrixWorld(true);
      gltf.scene.traverse(o=>{
        if(o.isBone){this.bones[o.name]=o;this.bind[o.name]={q:o.getWorldQuaternion(new T.Quaternion()),p:o.getWorldPosition(new T.Vector3()),local:o.quaternion.clone()};}
        if(o.isSkinnedMesh){
          this.meshes.push(o);o.frustumCulled=false;
          const positions=o.geometry.attributes.position,mask=new Float32Array(positions.count);
          for(let i=0;i<mask.length;i++)mask[i]=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).y>-.145?1:0;
          o.geometry.setAttribute('headMask',new T.BufferAttribute(mask,1));
          const uniforms={hideHead:{value:0},hideBody:{value:0}};
          o.material.onBeforeCompile=shader=>{
            Object.assign(shader.uniforms,uniforms);
            shader.vertexShader='attribute float headMask; varying float vHeadMask;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHeadMask=headMask;');
            shader.fragmentShader='uniform float hideHead; uniform float hideBody; varying float vHeadMask;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif ((hideHead>.5 && vHeadMask>.5)||(hideBody>.5 && vHeadMask<.5)) discard;');
          };
          o.material.customProgramCacheKey=()=> 'connected-avatar-v1';
          o.onBeforeRender=(renderer,world,camera)=>{uniforms.hideHead.value=camera===this.playerCamera?1:0;uniforms.hideBody.value=this.bodyVisible?0:1;o.material.uniformsNeedUpdate=true;};
        }
      });
      this.eyeLocal=this.bones.Head.worldToLocal(new T.Vector3());
      this.loaded=true;if(status)status.textContent='Connected upper-body rig · 11 bones';
      return this;
    }).catch(e=>{if(status)status.textContent='Avatar could not load: '+e.message;throw e;});
  }
  rotate(name,delta){
    const bone=this.bones[name];
    const parent=bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(delta.clone().multiply(this.bind[name].q)));
    bone.updateMatrixWorld(true);
  }
  arm(side,joints,camera,bodyRotation){
    const key=side.toLowerCase(),elbow=joints?.[key+'Elbow'],wrist=joints?.[key+'Wrist'];
    if(!elbow||!wrist)return;
    const upper=side+'UpperArm',fore=side+'Forearm';
    const start=this.bones[upper].getWorldPosition(new T.Vector3());
    const a=this.bind[fore].p.clone().sub(this.bind[upper].p);
    const b=V([side==='Left'?-.145:.145,-.195,-.025]);
    const target=V(wrist).add(camera.position),guide=V(elbow).add(camera.position).sub(start);
    const direction=target.clone().sub(start),distance=T.MathUtils.clamp(direction.length(),Math.abs(a.length()-b.length())+.001,a.length()+b.length()-.001);
    if(direction.lengthSq()<1e-10)return;
    direction.normalize();guide.addScaledVector(direction,-guide.dot(direction));
    if(guide.lengthSq()<1e-8){guide.set(0,0,-1).applyQuaternion(bodyRotation);guide.addScaledVector(direction,-guide.dot(direction));}
    if(guide.lengthSq()<1e-8)guide.set(1,0,0).addScaledVector(direction,-direction.x);
    guide.normalize();
    const along=(a.lengthSq()-b.lengthSq()+distance*distance)/(2*distance);
    const bend=start.clone().addScaledVector(direction,along).addScaledVector(guide,Math.sqrt(Math.max(0,a.lengthSq()-along*along)));
    const end=start.clone().addScaledVector(direction,distance);
    this.rotate(upper,new T.Quaternion().setFromUnitVectors(a.normalize(),bend.clone().sub(start).normalize()));
    this.rotate(fore,new T.Quaternion().setFromUnitVectors(b.normalize(),end.sub(bend).normalize()));
  }
  update(camera,head,joints,bodyVisible=true){
    if(!this.loaded)return;this.bodyVisible=bodyVisible;
    this.object.position.set(0,0,0);
    for(const [name,bone] of Object.entries(this.bones))bone.quaternion.copy(this.bind[name].local);
    this.object.updateMatrixWorld(true);
    const bodyRotation=new T.Quaternion();
    if(joints?.leftShoulder&&joints?.rightShoulder&&joints?.leftHip&&joints?.rightHip){
      const x=V(joints.rightShoulder).sub(V(joints.leftShoulder)).normalize();
      const y=V(joints.leftShoulder).add(V(joints.rightShoulder)).sub(V(joints.leftHip)).sub(V(joints.rightHip)).normalize();
      const z=new T.Vector3().crossVectors(x,y).normalize();x.crossVectors(y,z).normalize();
      if(z.lengthSq()>.5){bodyRotation.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));const angle=identity.angleTo(bodyRotation);if(angle>.7)bodyRotation.slerp(identity,1-.7/angle);}
    }
    this.rotate('Spine',identity.clone().slerp(bodyRotation,.4));this.rotate('Chest',bodyRotation);
    const headRotation=new T.Quaternion().setFromEuler(new T.Euler(head?.pose?.physicalPitch??0,head?.pose?.physicalYaw??0,0,'YXZ'));
    this.rotate('Neck',bodyRotation.clone().slerp(headRotation,.5));this.rotate('Head',headRotation);
    // Move the entire skeleton so its eyes follow the player. Never stretch a neck.
    const eyes=this.bones.Head.localToWorld(this.eyeLocal.clone());
    this.object.position.copy(camera.position).sub(eyes);this.object.updateMatrixWorld(true);
    for(const side of ['Left','Right']){
      const shoulder=joints?.[side.toLowerCase()+'Shoulder'];
      if(shoulder){
        const name=side+'Clavicle',start=this.bones[name].getWorldPosition(new T.Vector3());
        const rest=this.bind[side+'UpperArm'].p.clone().sub(this.bind[name].p).normalize();
        const target=V(shoulder).add(camera.position).sub(start).normalize();
        const swing=new T.Quaternion().setFromUnitVectors(rest.clone().applyQuaternion(bodyRotation),target);
        const angle=identity.angleTo(swing);if(angle>.25)swing.slerp(identity,1-.25/angle);
        this.rotate(name,swing.multiply(bodyRotation));
      }
      this.arm(side,joints,camera,bodyRotation);
    }
    this.object.updateMatrixWorld(true);
  }
}
