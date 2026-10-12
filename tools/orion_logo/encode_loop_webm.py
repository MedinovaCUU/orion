import bpy, sys, os, glob
args = sys.argv[sys.argv.index('--') + 1:]
indir, out, size = args[0], args[1], int(args[2])
files = sorted(glob.glob(os.path.join(indir, 'frame_*.png'))); assert files
sc = bpy.data.scenes.new('Encode'); sc.render.fps = 30; sc.render.fps_base = 1.0
sc.render.resolution_x = sc.render.resolution_y = size; sc.render.resolution_percentage = 100
sc.frame_start = 1; sc.frame_end = len(files)
sc.sequence_editor_create(); se = sc.sequence_editor
new_image = getattr(se.strips, 'new_image', None) or se.sequences.new_image
try:
    strip = new_image(name='frames', filepath=files[0], channel=1, frame_start=1, fit_method='FIT')
except TypeError:
    strip = new_image(name='frames', filepath=files[0], channel=1, frame_start=1)
for f in files[1:]: strip.elements.append(os.path.basename(f))
strip.blend_type = 'ALPHA_OVER'
# make sure the 1080 frames are scaled to the output size (otherwise the sequencer crops the centre)
import bpy as _b
src_w = _b.data.images.load(files[0]).size[0]
if hasattr(strip, 'transform'):
    strip.transform.scale_x = strip.transform.scale_y = size / src_w
print('STRIP scale', size / src_w)
sc.render.use_sequencer = True; sc.render.use_compositing = False; sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.media_type = 'VIDEO'; sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg; ff.audio_codec = 'NONE'; ff.format = 'WEBM'; ff.codec = 'WEBM'; ff.constant_rate_factor = 'MEDIUM'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.filepath = out
bpy.ops.render.render(animation=True, scene=sc.name); print('ENCODED', out)
