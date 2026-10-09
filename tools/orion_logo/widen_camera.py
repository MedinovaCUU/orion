"""Pull the camera back so the logo (rings + eye) never exceeds TARGET of the frame in any frame, leaving room for bloom.
Usage: blender -b <scene.blend> --python widen_camera.py -- <out.blend> <target_fraction>"""
import bpy, sys
from bpy_extras.object_utils import world_to_camera_view
sc = bpy.context.scene
out = sys.argv[sys.argv.index('--') + 1]; target = float(sys.argv[sys.argv.index('--') + 2])
cam = bpy.data.objects['Photo']

def extent_at(frame):
    sc.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get(); xs, ys = [], []
    for o in sc.objects:
        if o.type == 'MESH' and (o.name.startswith('Torus') or o.name in ('EyeShell', 'RubyCore')) and not o.hide_render:
            ev = o.evaluated_get(dg)
            for v in ev.data.vertices:
                c = world_to_camera_view(sc, cam, ev.matrix_world @ v.co); xs.append(c.x); ys.append(c.y)
    return max(max(xs) - min(xs), max(ys) - min(ys)), (min(xs), max(xs), min(ys), max(ys))

frames = range(sc.frame_start, sc.frame_end + 1, 3)
before = max(extent_at(f)[0] for f in frames)
factor = before / target
print(f'EXTENT before max={before:.3f} -> camera distance x{factor:.3f}')

# scale every camera location (keyframed or static) away from the origin by `factor`
act = cam.animation_data and cam.animation_data.action
fcs = []
if act:
    try:
        fcs = [fc for layer in act.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves if fc.data_path == 'location']
    except AttributeError:
        fcs = [fc for fc in act.fcurves if fc.data_path == 'location']
if fcs:
    for fc in fcs:
        for k in fc.keyframe_points:
            k.co.y *= factor; k.handle_left.y *= factor; k.handle_right.y *= factor
else:
    cam.location = cam.location * factor
after = max(extent_at(f)[0] for f in frames)
b = [extent_at(f)[1] for f in frames]
print(f'EXTENT after max={after:.3f}  x:[{min(e[0] for e in b):.3f},{max(e[1] for e in b):.3f}] y:[{min(e[2] for e in b):.3f},{max(e[3] for e in b):.3f}]')
sc.frame_set(sc.frame_start)
bpy.ops.wm.save_as_mainfile(filepath=out); print('SAVED', out)
