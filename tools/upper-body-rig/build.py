"""Build a connected upper-body mannequin around the supplied sculpture head."""
import bpy, math, json, bmesh
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'mirror/avatar'; assets=root/'assets/upper-body-rig';assets.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def v(p):return Vector((p[0],-p[2],p[1]))
parts=[]
bpy.ops.import_scene.gltf(filepath=str(out/'head.glb'))
parts.extend(o for o in bpy.context.scene.objects if o.type=='MESH')
def ellipsoid(name,center,radii):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=v(center))
 o=bpy.context.object;o.name=name;o.scale=(radii[0],radii[2],radii[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);parts.append(o);return o
def limb(name,a,b,ra,rb):
 a,b=v(a),v(b);d=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=ra,radius2=rb,depth=d.length,location=(a+b)/2)
 o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);parts.append(o)
 for suffix,p,r in [('a',a,ra),('b',b,rb)]:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,radius=r,location=p);parts.append(bpy.context.object)

# Overlapping anatomical masses become one continuous surface, including the head.
ellipsoid('Pelvis',(0,-.66,.085),(.145,.13,.105))
ellipsoid('Waist',(0,-.51,.085),(.135,.18,.09))
ellipsoid('Ribcage',(0,-.355,.075),(.185,.21,.112))
ellipsoid('Upper chest',(0,-.25,.073),(.205,.11,.10))
for s in [-1,1]:
 ellipsoid('Pectoral',(s*.09,-.285,.008),(.102,.09,.027))
 ellipsoid('Scapula',(s*.10,-.30,.15),(.10,.12,.045))
 ellipsoid('Trapezius',(s*.065,-.20,.075),(.095,.055,.072))
 ellipsoid('Deltoid',(s*.205,-.245,.073),(.075,.092,.076))
 limb('Upper arm',(s*.21,-.24,.075),(s*.39,-.445,.07),.057,.043)
 limb('Forearm',(s*.39,-.445,.07),(s*.535,-.64,.045),.043,.026)
limb('Neck',(0,-.19,.06),(0,-.075,.045),.067,.053)

bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name='ConnectedUpperBody'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
remesh=mesh.modifiers.new('Continuous anatomy','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.0028;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
# Remove tiny enclosed sculpture fragments; preserve the connected exterior.
bm=bmesh.new();bm.from_mesh(mesh.data);remaining=set(bm.verts);islands=[]
while remaining:
 seed=remaining.pop();island={seed};stack=[seed]
 while stack:
  for edge in stack.pop().link_edges:
   for vert in edge.verts:
    if vert in remaining:remaining.remove(vert);island.add(vert);stack.append(vert)
 islands.append(island)
islands.sort(key=len,reverse=True)
print('Remesh components:',[len(i) for i in islands],flush=True)
if len(islands)>1:
 if sum(map(len,islands[1:]))>len(islands[0])*.02:raise RuntimeError('Disconnected major body part')
 bmesh.ops.delete(bm,geom=list(set.union(*islands[1:])),context='VERTS')
bm.to_mesh(mesh.data);bm.free()
blend=mesh.vertex_groups.new(name='Body surface blending')
for vert in mesh.data.vertices:
 weight=max(0,min(1,(-vert.co.z-.10)/.06))
 if weight:blend.add([vert.index],weight,'REPLACE')
smooth=mesh.modifiers.new('Blend neck and shoulders','SMOOTH');smooth.vertex_group=blend.name;smooth.factor=.8;smooth.iterations=80;bpy.ops.object.modifier_apply(modifier=smooth.name)
mesh.vertex_groups.remove(mesh.vertex_groups.get('Body surface blending'))
dec=mesh.modifiers.new('Mobile topology','DECIMATE');dec.ratio=min(1,75000/max(1,len(mesh.data.polygons)*2));bpy.ops.object.modifier_apply(modifier=dec.name)
for p in mesh.data.polygons:p.use_smooth=True
mat=bpy.data.materials.new('Ivory mannequin');mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.78,.79,.77,1);bsdf.inputs['Roughness'].default_value=.57
mesh.data.materials.clear();mesh.data.materials.append(mat)

bones={
 'Pelvis':((0,-.66,.085),(0,-.46,.08),None),
 'Spine':((0,-.46,.08),(0,-.27,.075),'Pelvis'),
 'Chest':((0,-.27,.075),(0,-.19,.065),'Spine'),
 'Neck':((0,-.19,.065),(0,-.085,.045),'Chest'),
 'Head':((0,-.085,.045),(0,.10,.015),'Neck'),
}
for label,s in [('Left',-1),('Right',1)]:
 bones[label+'Clavicle']=((0,-.21,.07),(s*.21,-.24,.075),'Chest')
 bones[label+'UpperArm']=((s*.21,-.24,.075),(s*.39,-.445,.07),label+'Clavicle')
 bones[label+'Forearm']=((s*.39,-.445,.07),(s*.535,-.64,.045),label+'UpperArm')
armdata=bpy.data.armatures.new('UpperBodySkeleton');arm=bpy.data.objects.new('UpperBodyRig',armdata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);mesh.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in bones.items():
 bone=armdata.edit_bones.new(name);bone.head=v(head);bone.tail=v(tail)
 if parent:bone.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# Stabilize face topology: rigid skull with a short blended neck transition.
head_group=mesh.vertex_groups.get('Head') or mesh.vertex_groups.new(name='Head')
neck_group=mesh.vertex_groups.get('Neck') or mesh.vertex_groups.new(name='Neck')
for vert in mesh.data.vertices:
 y=vert.co.z
 if y>-.105:
  for group in mesh.vertex_groups:group.remove([vert.index])
  head_group.add([vert.index],1,'REPLACE')
 elif y>-.145 and abs(vert.co.x)<.085:
  w=(y+.145)/.04;w=w*w*(3-2*w)
  for group in mesh.vertex_groups:group.remove([vert.index])
  head_group.add([vert.index],w,'REPLACE');neck_group.add([vert.index],1-w,'REPLACE')
bpy.context.view_layer.objects.active=mesh
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
bad=[]
for vert in mesh.data.vertices:
 if not vert.groups or abs(sum(g.weight for g in vert.groups)-1)>.001:bad.append(vert.index)
if bad:raise RuntimeError('Unweighted or non-normalized vertices: '+str(len(bad)))
# Connected-component audit rejects the old loose-part construction.
parent=list(range(len(mesh.data.vertices)))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for edge in mesh.data.edges:
 a,b=map(find,edge.vertices);parent[a]=b
components=len({find(i) for i in range(len(parent))})
if components!=1:raise RuntimeError('Mesh has disconnected components: '+str(components))
report={'vertices':len(mesh.data.vertices),'faces':len(mesh.data.polygons),'components':components,'bones':len(bones),'unweightedVertices':len(bad),'bonesGameSpace':bones}
(assets/'rig-report.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(assets/'upper-body.blend'))
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'upper-body.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.world.color=(.11,.13,.16)
for p,power,size in [((-.8,1,1),70,1),((.8,.4,.4),45,.8),((0,-.8,.7),70,.7)]:
 bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(v((0,-.3,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=v((.15,-.20,-2.3)));cam=bpy.context.object;cam.rotation_euler=(v((0,-.33,.03))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.22;scene.camera=cam
scene.render.filepath=str(assets/'rest.png');bpy.ops.render.render(write_still=True)
print('RIG_REPORT',json.dumps(report))
