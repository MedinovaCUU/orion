import bpy, math, sys, os
from mathutils import Vector, Matrix
sc = bpy.context.scene
out = sys.argv[sys.argv.index('--') + 1]
W, H = 3840, 2160
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.resolution_percentage = 100
sc.frame_set(240)                     # clean logo pose, eye locked on the viewer
cam = bpy.data.objects['Photo']; cd = cam.data
cd.sensor_fit = 'HORIZONTAL'; cd.lens = 50.0
cam.animation_data_clear()
# dolly back so the logo is ~70% of the frame height, keep the same viewing direction
fwd = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
D = 13.0
cam.location = -fwd * D
cd.shift_x = 0.17                     # logo left of centre, lock-up centred overall
cd.dof.aperture_fstop = 4.0
# 3D wordmark facing the camera, at the logo's depth
font = bpy.data.fonts.load(os.path.expanduser('~/Library/Fonts/MagmaWave Caps.otf'))
plat = bpy.data.materials.new('Platinum_Text'); p = plat.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (0.84, 0.84, 0.87, 1); p.inputs['Metallic'].default_value = 1.0
p.inputs['Roughness'].default_value = 0.22; p.inputs['Coat Weight'].default_value = 0.5; p.inputs['Coat Roughness'].default_value = 0.03
def add_text(name, body, size, cam_x, cam_y, extrude):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.font = font
    cu.size = size; cu.extrude = extrude; cu.bevel_depth = size * 0.012; cu.bevel_resolution = 3
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    cu.materials.append(plat)
    o = bpy.data.objects.new(name, cu); sc.collection.objects.link(o)
    o.matrix_world = cam.matrix_world @ Matrix.Translation((cam_x, cam_y, -D))
    return o
PXU = W / (2 * D * (cd.sensor_width / 2 / cd.lens))     # pixels per world unit at depth D
t1 = add_text('WordmarkOrion', 'Orion', 1.35, 4.05, 0.40, 0.12)
t2 = add_text('WordmarkMedinova', 'by medinova', 0.43, 4.05, -0.72, 0.045)
print('PXU', round(PXU, 1))
tl = bpy.data.lights.new('TextKey', 'AREA'); tl.shape = 'RECTANGLE'; tl.size = 7.0; tl.size_y = 4.0; tl.energy = 900; tl.color = (1.0, 0.98, 0.96)
tlo = bpy.data.objects.new('TextKey', tl); sc.collection.objects.link(tlo)
tlo.matrix_world = cam.matrix_world @ Matrix.Translation((4.0, 4.5, -5.5))
c = tlo.constraints.new('TRACK_TO'); c.target = t1; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
tl.use_shadow = False
for ob in (t1, t2): ob.visible_shadow = False
# background baked into the world for camera rays: radial gradient centred behind the logo
sc.render.film_transparent = False
wt = sc.world.node_tree
mix = next(n for n in wt.nodes if n.type == 'MIX_SHADER')
black_bg = [l.from_node for l in wt.links if l.to_node == mix and l.to_socket.identifier == 'Shader_001'][0]
tc = wt.nodes.new('ShaderNodeTexCoord')
sub = wt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (0.42, 0.5, 0.0)
mul = wt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = (W / H, 1.0, 0.0)
ln = wt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
mr = wt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.10; mr.inputs['From Max'].default_value = 1.05
mr.interpolation_type = 'SMOOTHSTEP'
col = wt.nodes.new('ShaderNodeMix'); col.data_type = 'RGBA'; col.name = 'BGGradient'
wt.links.new(tc.outputs['Window'], sub.inputs[0]); wt.links.new(sub.outputs[0], mul.inputs[0]); wt.links.new(mul.outputs[0], ln.inputs[0])
wt.links.new(ln.outputs['Value'], mr.inputs['Value']); wt.links.new(mr.outputs['Result'], col.inputs['Factor'])
wt.links.new(col.outputs['Result'], black_bg.inputs['Color'])
def srgb(hexstr):
    h = hexstr.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)
VARIANTS = {
    'clara':  ('#ffffff', '#d8e2ea'),   # centre, edge — matches the app's light theme (#eaf1f6)
    'oscura': ('#1b2130', '#05070b'),
}
# render
cy = sc.cycles; cy.samples = 256; cy.adaptive_threshold = 0.01
sc.render.use_motion_blur = False
cprefs = bpy.context.preferences.addons['cycles'].preferences
cprefs.compute_device_type = 'METAL'; cprefs.get_devices()
for d in cprefs.devices: d.use = True
cy.device = 'GPU'
sc.render.image_settings.color_mode = 'RGB'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(out), 'orion_splash.blend'))
for tag, (c0, c1) in VARIANTS.items():
    col.inputs['A'].default_value = srgb(c0); col.inputs['B'].default_value = srgb(c1)
    if tag == 'clara': col.inputs['A'].default_value = (1.9, 1.9, 1.9, 1.0)   # push the centre to true white through AgX
    sc.render.filepath = out.replace('.png', f'_{tag}.png')
    bpy.ops.render.render(write_still=True)
    print('SPLASH_RENDERED', sc.render.filepath, flush=True)
