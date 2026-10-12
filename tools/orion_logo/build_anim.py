import bpy, bmesh, math, sys, os
import numpy as np
from mathutils import Vector, Quaternion, Matrix, Euler

FPS = 30
F0, F1 = 1, 240
T = F1 - F0 + 1
sc = bpy.context.scene
sc.render.fps = FPS; sc.render.fps_base = 1.0
sc.frame_start, sc.frame_end = F0, F1
sc.render.resolution_x = sc.render.resolution_y = 1080
sc.render.resolution_percentage = 100
sc.render.film_transparent = True   # transparent background
sc.camera = bpy.data.objects['Photo']
prefs = bpy.context.preferences.edit

def link(obj, coll=None):
    (coll or sc.collection).objects.link(obj)

def new_empty(name, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.3
    link(e)
    if parent: e.parent = parent
    return e

# ---------------------------------------------------------------- cleanup
for n in ['Camera', 'Text', 'Text.001', 'Cube', 'Cube.001', 'Icosphere.001', 'crystal exterior', 'Area']:
    o = bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.name.startswith('MCH_Rotation_target'):
        bpy.data.objects.remove(o, do_unlink=True)
old_eye = bpy.data.objects['Icosphere.002']
old_eye.hide_render = True; old_eye.hide_viewport = True

# ---------------------------------------------------------------- rings
def torus_axis_local(obj):
    """Axis of the torus island (largest connected part) via PCA, in object space."""
    me = obj.data
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    seen = set(); best = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; isl = []
        while stack:
            x = stack.pop()
            if x.index in seen: continue
            seen.add(x.index); isl.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: stack.append(y)
        if len(isl) > len(best): best = isl
    X = np.array([[c for c in x.co] for x in best]); X -= X.mean(axis=0)
    w, v = np.linalg.eigh(X.T @ X)
    bm.free()
    return Vector(v[:, 0]).normalized()

VIEW_AXIS = Vector((-0.939, -0.343, 0.0)).normalized()  # camera forward
Z = Vector((0, 0, 1))
# (precession axis in world, precession turns, spin turns about own axis)
TILT = Vector((0.35, 0.0, 1.0)).normalized()
# whole turns only: every ring ends exactly in the original logo pose
RING_PLAN = {
    'Torus.003': (Z, 1.0, 0.0),          # outer heavy ring: slow, stately
    'Torus.004': (TILT, -1.0, 0.0),      # second heavy ring: counter-rotating on a tilted axis
    'Torus.005': (VIEW_AXIS, 2.0, 0.0),  # thin ring: sweeps in the camera plane
    'Torus.006': (Z, -1.0, 2.0),         # satellite ring: slow precession, 2 orbits
    'Torus.008': (None, 0.0, -2.0),      # satellite ring: retrograde
    'Torus.007': (None, 0.0, 3.0),       # innermost satellite: fastest (Kepler-like)
}
SETTLE_START, SETTLE_END = 150, 232      # constant speed, then decelerate and lock into the logo pose

def fcurve_of(obj, data_path, index):
    act = obj.animation_data.action
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for fc in cb.fcurves:
                        if fc.data_path == data_path and fc.array_index == index: return fc
    except AttributeError:
        pass
    return act.fcurves.find(data_path, index=index)

def key_spin(obj, total_angle):
    """Constant angular speed, then a quadratic ease-out that ends exactly on total_angle at SETTLE_END."""
    lin = SETTLE_START - F0; dec = SETTLE_END - SETTLE_START
    w = total_angle / (lin + dec / 2.0)          # per-frame speed so the ease-out lands on the full turns
    obj.rotation_axis_angle[0] = 0.0;              obj.keyframe_insert('rotation_axis_angle', index=0, frame=F0)
    obj.rotation_axis_angle[0] = w * lin;          obj.keyframe_insert('rotation_axis_angle', index=0, frame=SETTLE_START)
    obj.rotation_axis_angle[0] = total_angle;      obj.keyframe_insert('rotation_axis_angle', index=0, frame=SETTLE_END)
    fc = fcurve_of(obj, 'rotation_axis_angle', 0)
    k0, k1, k2 = fc.keyframe_points
    k0.interpolation = 'LINEAR'
    k1.interpolation = 'QUAD'; k1.easing = 'EASE_OUT'
    k2.interpolation = 'CONSTANT'
HAIRLINE = {'Torus.003': 0.045, 'Torus.004': 0.05, 'Torus.005': 0.075}  # light channel width on the thicker rings

def N(nt, t, name=None, **kw):
    n = nt.nodes.new(t)
    if name: n.name = n.label = name
    for k, v in kw.items(): setattr(n, k, v)
    return n
def L(nt, a, b): nt.links.new(a, b)

hairline_mix_nodes = []   # (node_tree, mix node) to key the light-channel colour
def make_ring_material(name, axis_local, hairline_width, has_uv):
    m = bpy.data.materials.new(f'Platinum_{name}')
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = N(nt, 'ShaderNodeOutputMaterial')
    pl = N(nt, 'ShaderNodeBsdfPrincipled', 'Platinum')
    pl.inputs['Base Color'].default_value = (0.70, 0.70, 0.73, 1)
    pl.inputs['Metallic'].default_value = 1.0
    pl.inputs['Roughness'].default_value = 0.10
    pl.inputs['Coat Weight'].default_value = 0.35
    pl.inputs['Coat Roughness'].default_value = 0.03
    if has_uv:
        pl.inputs['Anisotropic'].default_value = 0.45
        pl.inputs['Roughness'].default_value = 0.14
    if hairline_width is None:
        L(nt, pl.outputs[0], out.inputs['Surface'])
        return m
    # light channel along the outer equator of the torus: |n·axis| small and n pointing away from the axis
    geo = N(nt, 'ShaderNodeNewGeometry')
    n_obj = N(nt, 'ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='WORLD', convert_to='OBJECT')
    L(nt, geo.outputs['Normal'], n_obj.inputs[0])
    axis = N(nt, 'ShaderNodeCombineXYZ', 'Axis')
    axis.inputs[0].default_value, axis.inputs[1].default_value, axis.inputs[2].default_value = axis_local
    dot_na = N(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT'); L(nt, n_obj.outputs[0], dot_na.inputs[0]); L(nt, axis.outputs[0], dot_na.inputs[1])
    ab = N(nt, 'ShaderNodeMath', operation='ABSOLUTE'); L(nt, dot_na.outputs['Value'], ab.inputs[0])
    band = N(nt, 'ShaderNodeMapRange'); band.interpolation_type = 'SMOOTHSTEP'
    band.inputs['From Min'].default_value = hairline_width * 0.6; band.inputs['From Max'].default_value = hairline_width
    band.inputs['To Min'].default_value = 1.0; band.inputs['To Max'].default_value = 0.0
    L(nt, ab.outputs[0], band.inputs['Value'])
    tc = N(nt, 'ShaderNodeTexCoord')
    dot_pa = N(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT'); L(nt, tc.outputs['Object'], dot_pa.inputs[0]); L(nt, axis.outputs[0], dot_pa.inputs[1])
    axial = N(nt, 'ShaderNodeVectorMath', operation='SCALE'); L(nt, axis.outputs[0], axial.inputs[0]); L(nt, dot_pa.outputs['Value'], axial.inputs['Scale'])
    radial = N(nt, 'ShaderNodeVectorMath', operation='SUBTRACT'); L(nt, tc.outputs['Object'], radial.inputs[0]); L(nt, axial.outputs[0], radial.inputs[1])
    rnorm = N(nt, 'ShaderNodeVectorMath', operation='NORMALIZE'); L(nt, radial.outputs[0], rnorm.inputs[0])
    dot_nr = N(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT'); L(nt, n_obj.outputs[0], dot_nr.inputs[0]); L(nt, rnorm.outputs[0], dot_nr.inputs[1])
    outer = N(nt, 'ShaderNodeMath', operation='GREATER_THAN'); outer.inputs[1].default_value = 0.2; L(nt, dot_nr.outputs['Value'], outer.inputs[0])
    fac = N(nt, 'ShaderNodeMath', operation='MULTIPLY'); L(nt, band.outputs[0], fac.inputs[0]); L(nt, outer.outputs[0], fac.inputs[1])
    col = N(nt, 'ShaderNodeMix', 'HairlineColor', data_type='RGBA')
    col.inputs['A'].default_value = (1.0, 0.93, 0.85, 1)     # warm white light channel
    col.inputs['B'].default_value = (1.0, 0.05, 0.10, 1)     # ruby when the eye locks on
    em = N(nt, 'ShaderNodeEmission', 'Hairline'); em.inputs['Strength'].default_value = 1.2
    L(nt, col.outputs['Result'], em.inputs['Color'])
    mx = N(nt, 'ShaderNodeMixShader'); L(nt, fac.outputs[0], mx.inputs[0]); L(nt, pl.outputs[0], mx.inputs[1]); L(nt, em.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    hairline_mix_nodes.append((nt, col))
    return m

prefs.keyframe_new_interpolation_type = 'LINEAR'
ORIG_ROT = {}
for name, (paxis, pturns, sturns) in RING_PLAN.items():
    ring = bpy.data.objects[name]
    ORIG_ROT[name] = ring.matrix_world.to_3x3().copy()
    if ring.animation_data: ring.animation_data_clear()
    R0 = ring.matrix_world.to_3x3()
    axis_local = torus_axis_local(ring)
    ring.data.materials[0] = make_ring_material(name, axis_local, HAIRLINE.get(name), bool(ring.data.uv_layers))
    prec = new_empty(f'Prec_{name}')
    orient = new_empty(f'Orient_{name}', prec)
    orient.rotation_mode = 'QUATERNION'
    orient.rotation_quaternion = R0.to_quaternion()
    ring.parent = orient
    ring.matrix_parent_inverse = Matrix.Identity(4)
    ring.location = (0, 0, 0)
    ring.rotation_mode = 'AXIS_ANGLE'
    ring.rotation_axis_angle = (0.0, *axis_local)
    if sturns:
        key_spin(ring, 2 * math.pi * sturns)
    if paxis is not None and pturns:
        prec.rotation_mode = 'AXIS_ANGLE'
        prec.rotation_axis_angle = (0.0, *paxis)
        key_spin(prec, 2 * math.pi * pturns)

# ---------------------------------------------------------------- eye
prefs.keyframe_new_interpolation_type = 'BEZIER'
eye_rig = new_empty('EyeRig')
eye_rig.rotation_mode = 'QUATERNION'

def split_island(src_obj, name, keep_mat_index, parent):
    """Copy of the ORIGINAL low-poly mesh keeping only the island with the given material index."""
    me = src_obj.data.copy(); me.name = name
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != keep_mat_index], context='FACES')
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False; p.material_index = 0
    me.materials.clear()
    o = bpy.data.objects.new(name, me); link(o)
    o.matrix_world = src_obj.matrix_world.copy()   # same size, same orientation as the original
    o.parent = parent
    return o

# original Icosphere.002: material index 0 = ruby core (20 faces), index 1 = outer low-poly shell
shell = split_island(old_eye, 'EyeShell', 1, eye_rig)
core = split_island(old_eye, 'RubyCore', 0, eye_rig)

# The original shell has a triangular well sunk into it at this local axis; the ruby tip shows through it.
WELL_AXIS = Vector((0.073, 0.057, 0.996)).normalized()
me = shell.data
def is_well(v):
    return v.co.angle(WELL_AXIS) < math.radians(25) and v.co.length < 1.0 + 1e-3 and v.co.length > 0.6
well_idx = {v.index for v in me.vertices if is_well(v)}
# well faces (dark iris) vs cornea faces
me.materials.append(None); me.materials.append(None)
for poly in me.polygons:
    c = poly.center
    inward_wall = c.angle(WELL_AXIS) < math.radians(25) and poly.normal.dot(c) < 0
    poly.material_index = 1 if (inward_wall or all(i in well_idx for i in poly.vertices)) else 0

# shape keys: angular warp around the well axis. Vertices slide along the sphere (radius kept), the
# mapping angle' = R*(angle/R)^k is monotonic so faces never fold. k<1 dilates the pupil, k>1 contracts it.
shell.shape_key_add(name='Basis')
WARP_R = math.radians(40.0)
def warp_key(name, k):
    key = shell.shape_key_add(name=name, from_mix=False)
    key.slider_min = -0.3; key.slider_max = 1.3
    for v in me.vertices:
        ang = v.co.angle(WELL_AXIS)
        if 1e-6 < ang < WARP_R:
            new_ang = WARP_R * (ang / WARP_R) ** k
            rot_axis = WELL_AXIS.cross(v.co)
            if rot_axis.length < 1e-9: continue
            key.data[v.index].co = Quaternion(rot_axis.normalized(), new_ang - ang) @ v.co
    return key
sk_open = warp_key('PupilDilate', 0.62)      # rim 20° -> ~26°
sk = warp_key('PupilContract', 2.1)          # rim 20° -> ~9°

# -- cornea: white pearl metal ------------------------------------------
m = bpy.data.materials.new('EyeCornea_WhitePearl')
nt = m.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = N(nt, 'ShaderNodeOutputMaterial')
pearl = N(nt, 'ShaderNodeBsdfPrincipled', 'Pearl')
pearl.inputs['Base Color'].default_value = (0.80, 0.81, 0.85, 1)
pearl.inputs['Metallic'].default_value = 0.85
pearl.inputs['Roughness'].default_value = 0.22
pearl.inputs['Coat Weight'].default_value = 0.6
pearl.inputs['Coat Roughness'].default_value = 0.05
pearl.inputs['Thin Film Thickness'].default_value = 420.0
pearl.inputs['Thin Film IOR'].default_value = 1.33
L(nt, pearl.outputs[0], out.inputs['Surface'])
shell.data.materials[0] = m

# -- well interior: dark anodized iris ------------------------------------
im = bpy.data.materials.new('EyeIris_Dark')
it = im.node_tree
for n in list(it.nodes): it.nodes.remove(n)
iout = N(it, 'ShaderNodeOutputMaterial')
iris = N(it, 'ShaderNodeBsdfPrincipled', 'Iris')
iris.inputs['Base Color'].default_value = (0.03, 0.03, 0.035, 1)
iris.inputs['Metallic'].default_value = 1.0
iris.inputs['Roughness'].default_value = 0.28
iris.inputs['Coat Weight'].default_value = 0.5
L(it, iris.outputs[0], iout.inputs['Surface'])
shell.data.materials[1] = im

# -- ruby core: the original 20-face icosphere, glowing ------------------
rm = bpy.data.materials.new('RubyCore')
rnt = rm.node_tree
for n in list(rnt.nodes): rnt.nodes.remove(n)
rout = N(rnt, 'ShaderNodeOutputMaterial')
ruby = N(rnt, 'ShaderNodeBsdfPrincipled', 'Ruby')
ruby.inputs['Base Color'].default_value = (0.55, 0.01, 0.04, 1)
ruby.inputs['Roughness'].default_value = 0.05
ruby.inputs['IOR'].default_value = 1.77
ruby.inputs['Transmission Weight'].default_value = 1.0
ruby.inputs['Coat Weight'].default_value = 1.0
ruby.inputs['Emission Color'].default_value = (1.0, 0.04, 0.10, 1)
L(rnt, ruby.outputs[0], rout.inputs['Surface'])
core.data.materials.append(rm)

def key_value(node_tree, node, value, frame):
    node.outputs[0].default_value = value
    node_tree.keyframe_insert(data_path=f'nodes["{node.name}"].outputs[0].default_value', frame=frame)
def key_input(node_tree, node, inp, value, frame):
    node.inputs[inp].default_value = value
    node_tree.keyframe_insert(data_path=f'nodes["{node.name}"].inputs["{inp}"].default_value', frame=frame)

# ---------------------------------------------------------------- gaze animation
cam = bpy.data.objects['Photo']
cam_pos = cam.matrix_world.translation.copy()
WELL_WORLD = (shell.matrix_world.to_3x3() @ WELL_AXIS).normalized()   # well axis with EyeRig at rest
T_WELL_INV = WELL_WORLD.to_track_quat('Z', 'Y').inverted()
def gaze_quat(yaw_deg, pitch_deg):
    """Quaternion for EyeRig that points the pupil well toward the camera, offset by yaw/pitch (degrees)."""
    d = cam_pos.normalized()
    q = Euler((0, 0, math.radians(yaw_deg))).to_quaternion()          # yaw around world Z
    side = d.cross(Z).normalized()
    p = Quaternion(side, math.radians(pitch_deg))                        # pitch toward/away from Z
    target = p @ (q @ d)
    return target.to_track_quat('Z', 'Y') @ T_WELL_INV
def key_gaze(frame, yaw, pitch):
    eye_rig.rotation_quaternion = gaze_quat(yaw, pitch)
    eye_rig.keyframe_insert('rotation_quaternion', frame=frame)

# searching ... lock-on ... hold with micro-saccades
GAZE = [
    (1,   -42, -12), (30, -36, -8),
    (62,   34,  18), (70,  36,  19),
    (98,  -14,  30), (110, -9,  26),
    (122,   0,   0),               # lock on the viewer
    (127,   2,  -1), (134, 0, 0),  # tiny overshoot / settle
    (176,  1.2, 0.6), (180, 0, 0),
    (203, -1.0, 1.0), (207, 0, 0),
    (228,  0.8, -0.8), (232, 0, 0),
    (240, 0, 0),
]
for f, y, p in GAZE: key_gaze(f, y, p)

# pupil: dilated while searching, snaps shut after lock-on with a small bounce, then breathes
DILATE   = [(1, 1.0), (118, 1.0), (124, 1.0), (134, 1.0), (146, 0.0), (240, 0.0)]
CONTRACT = [(1, 0.0), (134, 0.0), (148, 1.0), (155, 1.12), (164, 0.86), (172, 0.97), (200, 0.90), (215, 1.0), (240, 0.94)]
for f, v in DILATE:
    sk_open.value = v; sk_open.keyframe_insert('value', frame=f)
for f, v in CONTRACT:
    sk.value = v; sk.keyframe_insert('value', frame=f)

# ruby glow: tenuous, pulses on lock-on
for f, v in [(1, 0.6), (118, 0.6), (132, 2.4), (150, 1.0), (240, 1.0)]: key_input(rnt, ruby, 'Emission Strength', v, f)

# gentle camera push-in
cam.animation_data_clear()
fwd = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
cam.keyframe_insert('location', frame=F0)
cam.location = cam_pos + fwd * 0.28
cam.keyframe_insert('location', frame=F1)

# lights: tame the blown highlights, keep the look
bpy.data.objects['Spot.002'].data.energy = 7e6
sc.render.use_sequencer = False  # VSE strips were replacing the render output
bpy.data.objects['Spot'].data.energy = 2.5e6
# world: rebuilt from scratch — HDRI lights the scene, camera sees black
wt = sc.world.node_tree
old_env = next(n for n in wt.nodes if n.type == 'TEX_ENVIRONMENT')
hdri_img = old_env.image
for n in list(wt.nodes): wt.nodes.remove(n)
w_out = N(wt, 'ShaderNodeOutputWorld'); w_out.target = 'ALL'; w_out.is_active_output = True
w_env = N(wt, 'ShaderNodeTexEnvironment'); w_env.image = hdri_img
w_bg = N(wt, 'ShaderNodeBackground'); w_bg.inputs['Strength'].default_value = 1.0
w_black = N(wt, 'ShaderNodeBackground'); w_black.inputs['Color'].default_value = (0, 0, 0, 1)
w_lp = N(wt, 'ShaderNodeLightPath')
w_mix = N(wt, 'ShaderNodeMixShader')
L(wt, w_env.outputs['Color'], w_bg.inputs['Color'])
L(wt, w_lp.outputs['Is Camera Ray'], w_mix.inputs[0])
L(wt, w_bg.outputs[0], w_mix.inputs[1])
L(wt, w_black.outputs[0], w_mix.inputs[2])
L(wt, w_mix.outputs[0], w_out.inputs['Surface'])

# ---------------------------------------------------------------- luxury lighting & extras
def add_area(name, loc, size_x, size_y, energy, color, track=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'
    ld.size = size_x; ld.size_y = size_y; ld.energy = energy; ld.color = color
    lo = bpy.data.objects.new(name, ld); link(lo); lo.location = loc
    c = lo.constraints.new('TRACK_TO'); c.target = track or eye_rig; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return lo
add_area('KeyStrip',  ( 4.5,  6.5,  5.5), 0.9, 7.0, 340, (1.0, 0.97, 0.93))   # long soft specular streak
add_area('RimStrip',  (-5.0, -4.5,  4.0), 0.6, 8.0, 420, (0.80, 0.90, 1.00))  # cool rim from behind
add_area('FillStrip', ( 4.0, -5.5, -3.5), 1.2, 6.0,  140, (0.85, 0.92, 1.00))  # low cool fill
add_area('TopGlint',  ( 0.5,  1.0,  8.0), 0.3, 3.0, 140, (1.0, 1.0, 1.0))     # thin glint from above
bpy.data.objects['Spot.002'].data.energy = 2.2e6
bpy.data.materials['STAR'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 35.0
bpy.data.objects['Light'].data.energy = 60000

# the pupil projects a ruby beam once it locks on the viewer
beam_d = bpy.data.lights.new('PupilBeam', 'SPOT')
beam_d.color = (1.0, 0.08, 0.14); beam_d.spot_size = math.radians(42); beam_d.spot_blend = 0.6
beam_d.shadow_soft_size = 0.15; beam_d.energy = 0.0
beam = bpy.data.objects.new('PupilBeam', beam_d); link(beam); beam.parent = eye_rig
beam.location = WELL_WORLD * (0.855 * 1.08)          # just outside the cornea, on the well axis
beam.rotation_euler = WELL_WORLD.to_track_quat('-Z', 'Y').to_euler()
for f, v in [(118, 0.0), (128, 900.0), (140, 260.0), (240, 260.0)]:
    beam_d.energy = v; beam_d.keyframe_insert('energy', frame=f)

# light channels on the heavy rings flash ruby when the eye finds the viewer
for nt_, col_ in hairline_mix_nodes:
    for f, v in [(118, 0.0), (126, 1.0), (150, 1.0), (175, 0.0)]:
        col_.inputs['Factor'].default_value = v
        nt_.keyframe_insert(data_path=f'nodes["{col_.name}"].inputs["Factor"].default_value', frame=f)

# floating dust motes: depth and a cinematic feel
import random
random.seed(7)
dust_root = new_empty('DustRoot')
dust_me = bpy.data.meshes.new('DustMote')
bmd = bmesh.new(); bmesh.ops.create_icosphere(bmd, subdivisions=1, radius=0.009); bmd.to_mesh(dust_me); bmd.free()
dmat = bpy.data.materials.new('Dust'); dn = dmat.node_tree
dp = dn.nodes['Principled BSDF']; dp.inputs['Emission Color'].default_value = (1, 0.95, 0.9, 1); dp.inputs['Emission Strength'].default_value = 1.4
dust_me.materials.append(dmat)
for i in range(140):
    while True:
        v = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))
        if 0.55 < v.length < 1.0 and v.normalized().dot(cam_pos.normalized()) < 0.15: break   # only behind/beside the logo
    d = bpy.data.objects.new(f'Dust.{i:03d}', dust_me); link(d); d.parent = dust_root
    d.location = v * 4.2; d.scale = (random.uniform(0.5, 1.4),) * 3
    d.visible_shadow = False
dust_root.rotation_mode = 'XYZ'
dust_root.keyframe_insert('rotation_euler', frame=F0)
dust_root.rotation_euler = (0.0, 0.0, math.radians(14)); dust_root.location = (0, 0, 0.25)
dust_root.keyframe_insert('rotation_euler', frame=F1); dust_root.keyframe_insert('location', frame=F1)
dust_root.location = (0, 0, 0); dust_root.keyframe_insert('location', frame=F0)

# camera: shallow depth of field focused on the eye
cam.data.dof.use_dof = True; cam.data.dof.focus_object = eye_rig; cam.data.dof.aperture_fstop = 2.8

# ---------------------------------------------------------------- render settings
cy = sc.cycles
cprefs = bpy.context.preferences.addons['cycles'].preferences
cprefs.compute_device_type = 'METAL'; cprefs.get_devices()
for d in cprefs.devices: d.use = True
cy.device = 'GPU'
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.samples = 160
cy.use_denoising = True
cy.denoiser = 'OPENIMAGEDENOISE'
cy.denoising_use_gpu = True
cy.max_bounces = 8; cy.transmission_bounces = 8; cy.glossy_bounces = 4; cy.transparent_max_bounces = 12
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.sample_clamp_indirect = 6.0
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
sc.render.use_persistent_data = True
sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.5

# compositor bloom tune (keeps the existing Bloom -> Streaks chain)
ct = sc.compositing_node_group
g = ct.nodes['Glare']
g.inputs['Threshold'].default_value = 1.8
g.inputs['Strength'].default_value = 0.035
g.inputs['Size'].default_value = 0.35
g.inputs['Tint'].default_value = (1.0, 0.90, 0.92, 1.0)
g.inputs['Saturation'].default_value = 0.9
g2 = ct.nodes['Glare.001']
g2.inputs['Strength'].default_value = 0.010
g2.inputs['Threshold'].default_value = 16.0
g2.inputs['Streaks'].default_value = 4
g2.inputs['Streaks Angle'].default_value = math.radians(45)
g2.inputs['Fade'].default_value = 0.88
g2.inputs['Tint'].default_value = (1.0, 0.9, 0.95, 1.0)
# keep the bloom/streak halos in the alpha channel so the glow survives on a transparent background
rl = ct.nodes['Render Layers']
gout = ct.nodes['Group Output']
for l in list(ct.links):
    if l.to_node == gout: ct.links.remove(l)
def lum(node_out):
    n = ct.nodes.new('CompositorNodeRGBToBW'); ct.links.new(node_out, n.inputs['Image']); return n.outputs['Val']
l1, l2 = lum(g.outputs['Glare']), lum(g2.outputs['Glare'])
add1 = ct.nodes.new('ShaderNodeMath'); add1.operation = 'ADD'
ct.links.new(l1, add1.inputs[0]); ct.links.new(l2, add1.inputs[1])
boost = ct.nodes.new('ShaderNodeMath'); boost.operation = 'MULTIPLY'; boost.inputs[1].default_value = 1.6
ct.links.new(add1.outputs[0], boost.inputs[0])
add2 = ct.nodes.new('ShaderNodeMath'); add2.operation = 'ADD'; add2.use_clamp = True
ct.links.new(rl.outputs['Alpha'], add2.inputs[0]); ct.links.new(boost.outputs[0], add2.inputs[1])
sep = ct.nodes.new('CompositorNodeSeparateColor'); ct.links.new(g2.outputs['Image'], sep.inputs['Image'])
comb = ct.nodes.new('CompositorNodeCombineColor')
for ch in ('Red', 'Green', 'Blue'): ct.links.new(sep.outputs[ch], comb.inputs[ch])
ct.links.new(add2.outputs[0], comb.inputs['Alpha'])
ct.links.new(comb.outputs['Image'], gout.inputs[0])

# verify: rings at the last frame must match the original logo pose
sc.frame_set(F1)
for name in RING_PLAN:
    r = bpy.data.objects[name]
    err = max(abs(a - b) for ra, rb in zip(r.matrix_world.to_3x3(), ORIG_ROT[name]) for a, b in zip(ra, rb))
    print(f'POSE_CHECK {name} max_abs_err={err:.5f}')
sc.frame_set(F0)

OUT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('SAVED', OUT)
