"""Render selected frames of the current scene: blender -b scene.blend --python render_frames.py -- <outdir> <f1,f2,...> [percent]"""
import bpy, sys, time, os
sc = bpy.context.scene
args = sys.argv[sys.argv.index('--') + 1:]
outdir = args[0]; frames = [int(x) for x in args[1].split(',')]
pct = int(args[2]) if len(args) > 2 else 100
sc.render.resolution_percentage = pct
cprefs = bpy.context.preferences.addons['cycles'].preferences
cprefs.compute_device_type = 'METAL'; cprefs.get_devices()
for d in cprefs.devices: d.use = True
sc.cycles.device = 'GPU'
os.makedirs(outdir, exist_ok=True)
for f in frames:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(outdir, f'test_{f:04d}.png')
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f'FRAME {f} took {time.time()-t:.1f}s', flush=True)
