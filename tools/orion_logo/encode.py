import bpy, sys, os, glob
args = sys.argv[sys.argv.index('--') + 1:]
indir, out = args[0], args[1]                      # out: path WITHOUT extension
files = sorted(glob.glob(os.path.join(indir, 'frame_*.png')))
assert files, 'no frames'
sc = bpy.data.scenes.new('Encode')
sc.render.fps = 30; sc.render.fps_base = 1.0
sc.render.resolution_x = sc.render.resolution_y = 1080; sc.render.resolution_percentage = 100
sc.frame_start = 1; sc.frame_end = len(files)
sc.sequence_editor_create(); se = sc.sequence_editor
new_image = getattr(se.strips, 'new_image', None) or se.sequences.new_image
strip = new_image(name='frames', filepath=files[0], channel=1, frame_start=1)
for f in files[1:]: strip.elements.append(os.path.basename(f))
strip.blend_type = 'ALPHA_OVER'
sc.render.use_sequencer = True; sc.render.use_compositing = False
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.media_type = 'VIDEO'
sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg; ff.audio_codec = 'NONE'
def encode(fmt, codec, ext, rgba, **kw):
    ff.format = fmt; ff.codec = codec
    for k, v in kw.items(): setattr(ff, k, v)
    sc.render.image_settings.color_mode = 'RGBA' if rgba else 'RGB'
    sc.render.filepath = out + ext
    bpy.ops.render.render(animation=True, scene=sc.name)
    print('ENCODED', sc.render.filepath, 'alpha' if rgba else 'opaque', 'frames', len(files), flush=True)
encode('QUICKTIME', 'PRORES', '_alpha.mov', True, ffmpeg_prores_profile='4444')     # editing / keynote / after effects
encode('WEBM', 'WEBM', '_alpha.webm', True, constant_rate_factor='HIGH')             # web with transparency
encode('MPEG4', 'H264', '_negro.mp4', False, constant_rate_factor='HIGH', gopsize=15) # quick preview over black
