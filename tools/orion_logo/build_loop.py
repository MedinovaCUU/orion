"""Seamless idle loop for the app loader: eye locked on the viewer, rings turning whole turns, satellites orbiting.
Built from eye_animated.blend; saves eye_loop.blend."""
import bpy, math, sys
from mathutils import Vector, Quaternion, Euler
sc = bpy.context.scene
F0, F1 = 1, 150                      # 5 s at 30 fps; frame F1+1 == frame F0
sc.frame_start, sc.frame_end = F0, F1
out = sys.argv[sys.argv.index('--') + 1]
prefs = bpy.context.preferences.edit
def fcurves(obj):
    act = obj.animation_data and obj.animation_data.action
    if not act: return []
    try:
        return [fc for layer in act.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]
    except AttributeError:
        return list(act.fcurves)
def clear_anim(idblock):
    if idblock.animation_data: idblock.animation_data_clear()
# ---- rings: linear whole turns -------------------------------------------
TURNS = {'Torus.003': (1.0, 0.0), 'Torus.004': (-1.0, 0.0), 'Torus.005': (1.0, 0.0),
         'Torus.006': (-1.0, 1.0), 'Torus.008': (0.0, -2.0), 'Torus.007': (0.0, 2.0)}   # (precession turns, spin turns)
prefs.keyframe_new_interpolation_type = 'LINEAR'
for name, (pt, st) in TURNS.items():
    ring = bpy.data.objects[name]; prec = bpy.data.objects['Prec_' + name]
    for ob, turns in ((ring, st), (prec, pt)):
        clear_anim(ob)
        if ob.rotation_mode != 'AXIS_ANGLE': continue
        ob.rotation_axis_angle[0] = 0.0; ob.keyframe_insert('rotation_axis_angle', index=0, frame=F0)
        ob.rotation_axis_angle[0] = 2 * math.pi * turns; ob.keyframe_insert('rotation_axis_angle', index=0, frame=F1 + 1)
# ---- eye: locked on the camera with tiny periodic saccades ---------------
prefs.keyframe_new_interpolation_type = 'BEZIER'
rig = bpy.data.objects['EyeRig']; clear_anim(rig)
cam = bpy.data.objects['Photo']; clear_anim(cam)
cam_pos = cam.matrix_world.translation.copy()
shell = bpy.data.objects['EyeShell']
WELL_AXIS = Vector((0.073, 0.057, 0.996)).normalized()
rig.rotation_quaternion = Quaternion((1, 0, 0, 0)); bpy.context.view_layer.update()
well_world = (shell.matrix_world.to_3x3() @ WELL_AXIS).normalized()
T_inv = well_world.to_track_quat('Z', 'Y').inverted()
Z = Vector((0, 0, 1))
def gaze(yaw, pitch):
    d = cam_pos.normalized(); q = Euler((0, 0, math.radians(yaw))).to_quaternion()
    p = Quaternion(d.cross(Z).normalized(), math.radians(pitch))
    return (p @ (q @ d)).to_track_quat('Z', 'Y') @ T_inv
# searching gaze that loops: wander -> find the viewer (lock, pupil contracts) -> resume the search -> back to the start pose
GAZE = [(1, -30, -8), (22, -34, 2), (40, 24, 14), (52, 18, 10), (62, 0, 0), (66, 1.2, -0.6), (72, 0, 0),
        (100, 0, 0), (104, -0.8, 0.9), (108, 0, 0), (118, -12, 16), (134, -26, 6), (151, -30, -8)]
for f, y, p in GAZE:
    rig.rotation_quaternion = gaze(y, p); rig.keyframe_insert('rotation_quaternion', frame=f)
# ---- pupil: dilated while searching, snaps shut on lock, re-opens before the loop closes ----
kb = shell.data.shape_keys.key_blocks
clear_anim(shell.data.shape_keys)
for f, v in [(1, 1.0), (60, 1.0), (72, 0.0), (104, 0.0), (124, 1.0), (151, 1.0)]:
    kb['PupilDilate'].value = v; kb['PupilDilate'].keyframe_insert('value', frame=f)
for f, v in [(1, 0.0), (62, 0.0), (72, 1.0), (78, 1.1), (86, 0.92), (104, 0.95), (122, 0.0), (151, 0.0)]:
    kb['PupilContract'].value = v; kb['PupilContract'].keyframe_insert('value', frame=f)
# ---- ruby glow and pupil beam pulse on lock-on ----
rm = bpy.data.materials['RubyCore']; clear_anim(rm.node_tree)
ruby = rm.node_tree.nodes['Ruby']
for f, v in [(1, 0.6), (60, 0.6), (70, 2.2), (90, 1.0), (118, 0.6), (151, 0.6)]:
    ruby.inputs['Emission Strength'].default_value = v
    rm.node_tree.keyframe_insert(data_path='nodes["Ruby"].inputs["Emission Strength"].default_value', frame=f)
beam = bpy.data.lights.get('PupilBeam')
if beam:
    clear_anim(beam)
    for f, v in [(1, 0.0), (60, 0.0), (68, 700.0), (90, 260.0), (118, 0.0), (151, 0.0)]:
        beam.energy = v; beam.keyframe_insert('energy', frame=f)
# ---- constants: ruby glow, hairlines white, beam on, no dust, static camera -----
for m in bpy.data.materials:
    if m.name.startswith('Platinum_Torus') and m.node_tree:
        clear_anim(m.node_tree)
        n = m.node_tree.nodes.get('HairlineColor')
        if n: n.inputs['Factor'].default_value = 0.0
for o in sc.objects:
    if o.name.startswith('Dust'): o.hide_render = True
dr = bpy.data.objects.get('DustRoot'); dr and clear_anim(dr)
cam.data.dof.use_dof = True
# loop check: ring pose at F1+1 must equal F0
sc.frame_set(F1 + 1); a = {n: bpy.data.objects[n].matrix_world.copy() for n in TURNS}
sc.frame_set(F0); err = max(max(abs(x - y) for ra, rb in zip(a[n], bpy.data.objects[n].matrix_world) for x, y in zip(ra, rb)) for n in TURNS)
print('LOOP_CHECK max_err', round(err, 6))
bpy.ops.wm.save_as_mainfile(filepath=out); print('SAVED', out)
