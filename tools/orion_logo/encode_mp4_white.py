"""Opaque H.264 MP4 of a PNG frame sequence over a flat white background (hardware-decoded everywhere, incl. Safari)."""
import bpy, sys, os, glob
args = sys.argv[sys.argv.index('--') + 1:]
indir, out, size = args[0], args[1], int(args[2])
files = sorted(glob.glob(os.path.join(indir, 'frame_*.png'))); assert files
sc = bpy.data.scenes.new('Encode'); sc.render.fps = 30; sc.render.fps_base = 1.0
sc.render.resolution_x = sc.render.resolution_y = size; sc.render.resolution_percentage = 100
sc.frame_start = 1; sc.frame_end = len(files)
sc.sequence_editor_create(); se = sc.sequence_editor
strips = se.strips if hasattr(se, 'strips') else se.sequences
bg = strips.new_effect(name='white', type='COLOR', channel=1, frame_start=1, length=len(files) + 1); bg.color = (1.0, 1.0, 1.0)
new_image = getattr(strips, 'new_image', None)
try: strip = new_image(name='frames', filepath=files[0], channel=2, frame_start=1, fit_method='FIT')
except TypeError: strip = new_image(name='frames', filepath=files[0], channel=2, frame_start=1)
for f in files[1:]: strip.elements.append(os.path.basename(f))
strip.blend_type = 'ALPHA_OVER'
src_w = bpy.data.images.load(files[0]).size[0]
if hasattr(strip, 'transform'): strip.transform.scale_x = strip.transform.scale_y = size / src_w
sc.render.use_sequencer = True; sc.render.use_compositing = False; sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.media_type = 'VIDEO'; sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg; ff.audio_codec = 'NONE'; ff.format = 'MPEG4'; ff.codec = 'H264'; ff.constant_rate_factor = 'MEDIUM'; ff.gopsize = 15
sc.render.image_settings.color_mode = 'RGB'; sc.render.filepath = out
bpy.ops.render.render(animation=True, scene=sc.name); print("ENCODED", out)
import subprocess, sys as _s; subprocess.run([_s.executable if False else "python3", os.path.join(os.path.dirname(os.path.abspath(__file__)), "mp4_faststart.py"), out], check=False)
