import bpy,math,json,os,sys
from mathutils import Vector,Matrix
from pathlib import Path
work=Path(os.environ['VR_RENDER_DIR'])
sc=bpy.context.scene;bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.2,trans=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*color,1);s.inputs['Roughness'].default_value=rough;s.inputs['Metallic'].default_value=metal;s.inputs['Transmission Weight'].default_value=trans;s.inputs['IOR'].default_value=1.333 if trans else 1.5
 return m
paint=mat('VR Drinks print',(.3,.1,.1),.32,.265)
bs=paint.node_tree.nodes['Principled BSDF'];bs.inputs['Coat Weight'].default_value=.33;bs.inputs['Coat Roughness'].default_value=.18
tex=paint.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(Path.cwd()/'dist/hero/label.jpg'));paint.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
metal=mat('Brushed aluminium',(.71,.74,.76),.92,.22);groove=mat('Recess',(.33,.34,.35),.88,.25)
wet=mat('Water',(.96,.976,.99),0,.055,.94)
base=json.load(open(work/'geometry/base.json'))
rot=Matrix.Rotation(math.pi/2,4,'X')
def matrix(vals):return Matrix([vals[i:i+4] for i in range(0,16,4)]).transposed()
def makegeo(g,name,m):
 v=g['pos'];idx=g['index'] or list(range(len(v)//3));mesh=bpy.data.meshes.new(name);mesh.from_pydata([v[i:i+3] for i in range(0,len(v),3)],[],[idx[i:i+3] for i in range(0,len(idx),3)]);mesh.materials.append(m)
 for f in mesh.polygons:f.use_smooth=True
 if m==paint:
  uv=mesh.uv_layers.new(name='Print');uv.data.foreach_set('uv',[a for l in mesh.loops for a in (g['uv'][l.vertex_index*2]+.5,g['uv'][l.vertex_index*2+1])])
 return mesh
def obj(name,mesh):
 o=bpy.data.objects.new(name,mesh);sc.collection.objects.link(o);return o
parent=obj('Can',None)
def instances(g,m,name,parent=None):
 mesh=makegeo(g,name,m);res=[]
 for i in range(0,len(g['instances']),16):
  o=obj(name,mesh);o.parent=parent;o.matrix_local=matrix(g['instances'][i:i+16]);res.append(o)
 return res
for i,g in enumerate(base['mesh']):
 if g['instances']:instances(g,wet,'Condensation',parent);continue
 o=obj('Can part',makegeo(g,'Spun metal',paint if i==0 else groove if i in [5,6] else metal));o.parent=parent;o.matrix_local=matrix(g['matrix'])
sheet=obj('Water sheet',makegeo(base['sheet'],'Crown',wet)); sheet.matrix_world=rot
# Thickness catches the backlight at the torn lip and around the holes.
smooth=sheet.modifiers.new('Round torn edges','SUBSURF');smooth.levels=1;smooth.render_levels=1
solid=sheet.modifiers.new('Meniscus','SOLIDIFY');solid.thickness=.012
rain=instances(base['drops'],wet,'Spray')
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.location.z=-.016;floor.data.materials.append(mat('Wet black stage',(.007,.006,.007),.28,.235))
fm=floor.data.materials[0];nodes=fm.node_tree.nodes;links=fm.node_tree.links
def mathnode(op,a,b=0):
 n=nodes.new('ShaderNodeMath');n.operation=op
 for k,x in enumerate((a,b)):
  if isinstance(x,(int,float)):n.inputs[k].default_value=x
  else:links.new(x,n.inputs[k])
 return n.outputs[0]
coord=nodes.new('ShaderNodeTexCoord');length=nodes.new('ShaderNodeVectorMath');length.operation='LENGTH';links.new(coord.outputs['Object'],length.inputs[0])
clock=nodes.new('ShaderNodeValue');age=clock.outputs[0];rad=length.outputs['Value']
phase=mathnode('SUBTRACT',rad,mathnode('ADD',.5,mathnode('MULTIPLY',1.45,age)))
envelope=mathnode('EXPONENT',mathnode('MULTIPLY',-3.8,mathnode('MULTIPLY',phase,phase)))
wave=mathnode('MULTIPLY',envelope,mathnode('SINE',mathnode('MULTIPLY',21,phase)))
bump=nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.018;links.new(wave,bump.inputs['Height']);links.new(bump.outputs[0],nodes['Principled BSDF'].inputs['Normal'])
def area(loc,point,size,height,pow,color):
 d=bpy.data.lights.new('Softbox','AREA');d.energy=pow;d.shape='RECTANGLE';d.size=size;d.size_y=height;d.color=color
 o=obj('Softbox',d);o.location=loc;o.rotation_euler=(Vector(point)-o.location).to_track_quat('-Z','Y').to_euler()
area((-2.8,-3,3.7),(0,0,1),.8,4.1,245,(1,.94,.9));area((3.1,-1.8,2.7),(0,0,1),.34,3.7,215,(.86,.94,1));area((-.15,1.8,4.5),(0,0,1),3.2,1.2,310,(1,.96,.93));area((-2.8,2.2,1),(0,0,.6),2,2.5,190,(1,.055,.065));area((.7,-4,2),(0,0,1),3,3,42,(1,.95,.91))
sc.world.color=(.04,.04,.04);cam=obj('Camera',bpy.data.cameras.new('Camera'));sc.camera=cam;cam.location=(0,-9,2.65);cam.rotation_euler=(Vector((0,0,1.18))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=5.06
sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=False;sc.cycles.max_bounces=6;sc.cycles.transparent_max_bounces=3;sc.render.resolution_percentage=100;sc.render.resolution_x=864;sc.render.resolution_y=540;sc.render.threads_mode='FIXED';sc.render.threads=8;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB';sc.render.use_persistent_data=True
(work/'frames').mkdir(exist_ok=True)
for i in range(79):
 if (work/('frames/%03d.png'%i)).exists():continue
 t=max(0,i/30-.32);age.default_value=t;bump.inputs['Strength'].default_value=min(1,t*7)*math.exp(-1.3*t)*.68
 f=json.load(open(work/('geometry/%s.json'%i)));parent.matrix_world=rot@matrix(f['can']);sheet.hide_render=not f['wet']
 if f['wet']:
  v=f['verts'];v[1::3]=[y*f['ys'] for y in v[1::3]];sheet.data.vertices.foreach_set('co',v);sheet.data.update()
 for j,o in enumerate(rain):
  a=f['inst'][j*16:j*16+16];o.hide_render=not f['rain'] or abs(a[10])<.0001
  if not o.hide_render:o.matrix_world=rot@matrix(a)
 sc.render.filepath=str(work/('frames/%03d.png'%i));bpy.ops.render.render(write_still=True)
