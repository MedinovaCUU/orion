import bpy, sys, os, time
sc = bpy.context.scene
outdir = sys.argv[sys.argv.index('--') + 1]
os.makedirs(outdir, exist_ok=True)
cprefs = bpy.context.preferences.addons['cycles'].preferences
cprefs.compute_device_type = 'METAL'; cprefs.get_devices()
for d in cprefs.devices: d.use = True
sc.cycles.device = 'GPU'
t0 = time.time()
for f in range(sc.frame_start, sc.frame_end + 1):
    path = os.path.join(outdir, f'frame_{f:04d}.png')
    if os.path.exists(path) and os.path.getsize(path) > 0: continue
    sc.frame_set(f)
    sc.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f'FRAME {f}/{sc.frame_end} {time.time()-t:.1f}s elapsed {(time.time()-t0)/60:.1f}min', flush=True)
print('ALL FRAMES DONE', flush=True)
