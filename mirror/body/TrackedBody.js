import * as THREE from 'three';
const up=new THREE.Vector3(0,1,0);
export class TrackedBody {
  constructor(scene){
    this.object=new THREE.Group();scene.add(this.object);this.object.visible=false;
    const suit=new THREE.MeshStandardMaterial({color:0x4d788a,roughness:.72,metalness:.1});
    const joint=new THREE.MeshStandardMaterial({color:0xc6d9db,roughness:.6});
    this.links=[];
    for(const [a,b,radius] of [['leftShoulder','rightShoulder',.065],['leftShoulder','leftElbow',.047],['leftElbow','leftWrist',.036],['rightShoulder','rightElbow',.047],['rightElbow','rightWrist',.036]]){
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.78,radius,1,12),suit);
      this.object.add(mesh);this.links.push({a,b,mesh});
    }
    this.dots={};
    for(const name of ['leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist']){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(name.includes('Wrist')?.025:.047,12,8),joint);
      this.object.add(mesh);this.dots[name]=mesh;
    }
    this.torso=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),suit);this.object.add(this.torso);
    this.neck=new THREE.Mesh(new THREE.CylinderGeometry(.046,.06,1,12),joint);this.object.add(this.neck);
    this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.delta=new THREE.Vector3();
    this.across=new THREE.Vector3();this.vertical=new THREE.Vector3();this.front=new THREE.Vector3();this.basis=new THREE.Matrix4();
  }
  segment(mesh,a,b){
    this.a.fromArray(a);this.b.fromArray(b);this.delta.subVectors(this.b,this.a);
    const distance=this.delta.length();mesh.visible=distance>.015&&distance<.85;
    if(!mesh.visible)return;
    mesh.position.copy(this.a).add(this.b).multiplyScalar(.5);
    mesh.scale.y=distance;mesh.quaternion.setFromUnitVectors(up,this.delta.normalize());
  }
  update(camera,joints){
    this.object.visible=!!joints;if(!joints)return;
    // Only position follows the eye; torso and arm angles come from body tracking.
    this.object.position.copy(camera.position);
    for(const {a,b,mesh} of this.links){mesh.visible=!!(joints[a]&&joints[b]);if(mesh.visible)this.segment(mesh,joints[a],joints[b]);}
    for(const [name,mesh] of Object.entries(this.dots)){mesh.visible=!!joints[name];if(mesh.visible)mesh.position.fromArray(joints[name]);}
    const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
    const shoulder=mid(joints.leftShoulder,joints.rightShoulder),hip=mid(joints.leftHip,joints.rightHip);
    this.segment(this.neck,[0,-.11,.045],shoulder);
    this.a.fromArray(shoulder);this.b.fromArray(hip);
    this.vertical.subVectors(this.a,this.b);const height=this.vertical.length();this.vertical.normalize();
    this.across.fromArray(joints.leftShoulder).sub(new THREE.Vector3().fromArray(joints.rightShoulder));
    const width=this.across.length();this.across.normalize();
    this.front.crossVectors(this.across,this.vertical).normalize();this.across.crossVectors(this.vertical,this.front).normalize();
    this.basis.makeBasis(this.across,this.vertical,this.front);
    this.torso.quaternion.setFromRotationMatrix(this.basis);this.torso.position.copy(this.a).add(this.b).multiplyScalar(.5);
    this.torso.scale.set(width*.57,height*.63,.12);
  }
}
