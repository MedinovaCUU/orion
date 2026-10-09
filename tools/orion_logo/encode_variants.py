"""Encode a PNG frame sequence into the web variants used by the app, with padding around the logo so glows never clip.
Outputs: <base>-alpha.mov (ProRes 4444, to be converted to HEVC alpha), <base>.webm (VP9 alpha), <base>.mp4 (H.264 over white),
<base>-still.png (first frame, alpha) and <base>-still-white.png. Run with Blender."""
import bpy, sys, os, glob
args = sys.argv[sys.argv.index('--') + 1:]
indir, base, size, content = args[0], args[1], int(args[2]), float(args[3])
files = sorted(glob.glob(os.path.join(indir, 'frame_*.png'))); assert files
src_w = bpy.data.images.load(files[0]).size[0]

def scene(white):
    sc = bpy.data.scenes.new('Enc_white' if white else 'Enc_alpha'); sc.render.fps = 30; sc.render.fps_base = 1.0
    sc.render.resolution_x = sc.render.resolution_y = size; sc.render.resolution_percentage = 100
    sc.frame_start = 1; sc.frame_end = len(files)
    sc.sequence_editor_create(); se = sc.sequence_editor
    strips = se.strips if hasattr(se, 'strips') else se.sequences
    if white:
        bg = strips.new_effect(name='white', type='COLOR', channel=1, frame_start=1, length=len(files) + 1); bg.color = (1, 1, 1)
    try: strip = strips.new_image(name='frames', filepath=files[0], channel=2, frame_start=1, fit_method='FIT')
    except TypeError: strip = strips.new_image(name='frames', filepath=files[0], channel=2, frame_start=1)
    for f in files[1:]: strip.elements.append(os.path.basename(f))
    strip.blend_type = 'ALPHA_OVER'
    strip.transform.scale_x = strip.transform.scale_y = (size / src_w) * content   # centred, padded
    sc.render.use_sequencer = True; sc.render.use_compositing = False
    sc.render.film_transparent = not white
    sc.view_settings.view_transform = 'Standard'
    return sc

def video(sc, path, fmt, codec, rgba, **kw):
    sc.render.image_settings.media_type = 'VIDEO'; sc.render.image_settings.file_format = 'FFMPEG'
    ff = sc.render.ffmpeg; ff.audio_codec = 'NONE'; ff.format = fmt; ff.codec = codec
    for k, v in kw.items(): setattr(ff, k, v)
    sc.render.image_settings.color_mode = 'RGBA' if rgba else 'RGB'
    sc.render.filepath = path; bpy.ops.render.render(animation=True, scene=sc.name); print('ENCODED', path, flush=True)

def still(sc, path, rgba):
    sc.render.image_settings.media_type = 'IMAGE'; sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA' if rgba else 'RGB'; sc.render.image_settings.color_depth = '8'
    sc.frame_set(1); sc.render.filepath = path; bpy.ops.render.render(write_still=True, scene=sc.name); print('STILL', path, flush=True)

a = scene(white=False)
video(a, base + '-alpha.mov', 'QUICKTIME', 'PRORES', True, ffmpeg_prores_profile='4444')
video(a, base + '.webm', 'WEBM', 'WEBM', True, constant_rate_factor='MEDIUM')
still(a, base + '-still.png', True)
w = scene(white=True)
video(w, base + '.mp4', 'MPEG4', 'H264', False, constant_rate_factor='MEDIUM', gopsize=15)
still(w, base + '-still-white.png', False)
print('VARIANTS_DONE')
