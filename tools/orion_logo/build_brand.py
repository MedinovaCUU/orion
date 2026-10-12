"""Brand renders from eye_animated.blend (frame 240 = clean logo pose, eye locked on the viewer).
Modes: splash (light+dark, baked gradient), imagotipo (transparent lock-up), icono (transparent mark), eye (transparent eye only)."""
import bpy, math, sys, os
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
sc = bpy.context.scene
outdir = sys.argv[sys.argv.index('--') + 1]
modes = sys.argv[sys.argv.index('--') + 2].split(',')
sc.frame_set(240)
cam = bpy.data.objects['Photo']; cd = cam.data
cd.sensor_fit = 'HORIZONTAL'; cd.lens = 50.0; cd.sensor_width = 36.0
cam.animation_data_clear()
FWD = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
ROT = cam.matrix_world.to_3x3().copy()
def place_cam(D, shift_x=0.0, shift_y=0.0):
    cam.location = -FWD * D; cd.shift_x = shift_x; cd.shift_y = shift_y
    bpy.context.view_layer.update()
cprefs = bpy.context.preferences.addons['cycles'].preferences
cprefs.compute_device_type = 'METAL'; cprefs.get_devices()
for d in cprefs.devices: d.use = True
cy = sc.cycles; cy.device = 'GPU'; cy.samples = 256; cy.adaptive_threshold = 0.01
sc.render.use_motion_blur = False
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'

# ---- wordmark -----------------------------------------------------------
font = bpy.data.fonts.load(os.path.expanduser('~/Library/Fonts/MagmaWave Caps.otf'))
plat = bpy.data.materials.new('Platinum_Text'); p = plat.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (0.82, 0.82, 0.85, 1); p.inputs['Metallic'].default_value = 1.0
p.inputs['Roughness'].default_value = 0.18; p.inputs['Coat Weight'].default_value = 0.5; p.inputs['Coat Roughness'].default_value = 0.03
p.inputs['Anisotropic'].default_value = 0.3
text_objs = []
def add_text(name, body, size, cam_x, cam_y, D, extrude, yaw_deg):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.font = font
    cu.size = size; cu.extrude = extrude; cu.bevel_depth = size * 0.022; cu.bevel_resolution = 4
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.materials.append(plat)
    o = bpy.data.objects.new(name, cu); sc.collection.objects.link(o)
    o.matrix_world = cam.matrix_world @ Matrix.Translation((cam_x, cam_y, -D)) @ Matrix.Rotation(math.radians(yaw_deg), 4, 'Y')
    o.visible_shadow = False
    text_objs.append(o); return o
def text_lights(target, D):
    """soft key from the front-left and an edge light from the right so the extruded sides read."""
    for name, pos, size, energy, col in (
        ('TextKey',  (1.5, 4.5, -(D - 6.0)), (7.0, 4.0), 900, (1.0, 0.98, 0.96)),
        ('TextEdge', (9.0, 1.5, -(D - 2.5)), (2.0, 6.0), 700, (0.85, 0.92, 1.0)),
        ('TextLow',  (3.0, -4.0, -(D - 5.0)), (6.0, 1.5), 220, (1.0, 0.9, 0.92)),
    ):
        ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size; ld.energy = energy; ld.color = col; ld.use_shadow = False
        lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo)
        lo.matrix_world = cam.matrix_world @ Matrix.Translation(pos)
        c = lo.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
def clear_text():
    for o in list(text_objs): bpy.data.objects.remove(o, do_unlink=True)
    text_objs.clear()
    for n in ('TextKey', 'TextEdge', 'TextLow'):
        o = bpy.data.objects.get(n)
        if o: bpy.data.objects.remove(o, do_unlink=True)

def px_per_unit(W, D): return W / (2 * D * (cd.sensor_width / 2 / cd.lens))
def x_for_px(px, W, D, shift_x): return (px - W / 2 + shift_x * W) / px_per_unit(W, D)
def y_for_px(py, W, H, D, shift_y): return (py - H / 2 + shift_y * W) / px_per_unit(W, D)   # shift_y is in sensor-width units

def logo_bounds():
    """normalized camera-view bounds of the rings + eye at the current camera."""
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for o in sc.objects:
        if o.type == 'MESH' and (o.name.startswith('Torus') or o.name in ('EyeShell', 'RubyCore')) and not o.hide_render:
            ev = o.evaluated_get(dg)
            for v in ev.data.vertices:
                c = world_to_camera_view(sc, cam, ev.matrix_world @ v.co); xs.append(c.x); ys.append(c.y)
    return min(xs), max(xs), min(ys), max(ys)
def fit_square(fill):
    """centre the logo and scale it to `fill` of the frame (square render)."""
    D = 6.0; place_cam(D)
    for _ in range(3):
        x0, x1, y0, y1 = logo_bounds()
        size = max(x1 - x0, y1 - y0); D *= size / fill
        place_cam(D)
        x0, x1, y0, y1 = logo_bounds()
        place_cam(D, shift_x=((x0 + x1) / 2 - 0.5), shift_y=((y0 + y1) / 2 - 0.5))
    return D

def render(path):
    sc.render.filepath = path; bpy.ops.render.render(write_still=True); print('RENDERED', path, flush=True)

def set_transparent(on):
    sc.render.film_transparent = on
    sc.render.use_compositing = not on        # no glare on alpha assets -> clean edges
    sc.render.image_settings.color_mode = 'RGBA' if on else 'RGB'
    cd.dof.use_dof = not on

dust = bpy.data.objects.get('DustRoot')
def show_dust(on):
    for o in sc.objects:
        if o.name.startswith('Dust'): o.hide_render = not on

# ---- splash -------------------------------------------------------------
if 'splash' in modes:
    W, H = 3840, 2160; sc.render.resolution_x, sc.render.resolution_y = W, H
    D = 13.0; SX = 0.17; place_cam(D, SX); cd.dof.aperture_fstop = 4.0
    set_transparent(False); show_dust(True)
    t1 = add_text('WordmarkOrion', 'Orion', 1.35, x_for_px(0.745 * W, W, D, SX), 0.40, D, 0.26, -16)
    t2 = add_text('WordmarkMedinova', 'by medinova', 0.43, x_for_px(0.745 * W, W, D, SX), -0.74, D, 0.09, -16)
    text_lights(t1, D)
    # dust motes across the whole frame (the original cloud only surrounds the logo)
    import random; random.seed(11)
    dust_me = bpy.data.meshes.get('DustMote'); extra = bpy.data.objects.new('DustFrameRoot', None); sc.collection.objects.link(extra)
    hw = (cd.sensor_width / 2 / cd.lens)   # tan(half horizontal fov)
    for i in range(170):
        z = random.uniform(D - 1.0, D + 7.0)
        x = random.uniform(-1.05, 1.05) * z * hw + SX * 2 * z * hw
        y = random.uniform(-1.05, 1.05) * z * hw * H / W
        if (Vector((x, y)) - Vector((x_for_px(0.42 * W, W, D, SX), 0))).length < 2.3 and z < D + 1.0: continue   # keep the logo area as it was
        d = bpy.data.objects.new(f'DustFrame.{i:03d}', dust_me); sc.collection.objects.link(d); d.parent = extra
        d.matrix_world = cam.matrix_world @ Matrix.Translation((x, y, -z)); d.scale = (random.uniform(0.5, 1.4),) * 3
        d.visible_shadow = False
    wt = sc.world.node_tree
    mix = next(n for n in wt.nodes if n.type == 'MIX_SHADER')
    black_bg = [l.from_node for l in wt.links if l.to_node == mix and l.to_socket.identifier == 'Shader_001'][0]
    tc = wt.nodes.new('ShaderNodeTexCoord')
    sub = wt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (0.42, 0.5, 0.0)
    mul = wt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = (W / H, 1.0, 0.0)
    ln = wt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
    mr = wt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.10; mr.inputs['From Max'].default_value = 1.05; mr.interpolation_type = 'SMOOTHSTEP'
    col = wt.nodes.new('ShaderNodeMix'); col.data_type = 'RGBA'
    for a, b in ((tc.outputs['Window'], sub.inputs[0]), (sub.outputs[0], mul.inputs[0]), (mul.outputs[0], ln.inputs[0]), (ln.outputs['Value'], mr.inputs['Value']), (mr.outputs['Result'], col.inputs['Factor']), (col.outputs['Result'], black_bg.inputs['Color'])):
        wt.links.new(a, b)
    def srgb(h):
        h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
        return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)
    for tag, c0, c1 in (('clara', (1.9, 1.9, 1.9, 1.0), srgb('#d8e2ea')), ('oscura', srgb('#1b2130'), srgb('#05070b'))):
        col.inputs['A'].default_value = c0; col.inputs['B'].default_value = c1
        render(os.path.join(outdir, f'splash_{tag}_4K.png'))
    black_bg.inputs['Color'].default_value = (0, 0, 0, 1); wt.links.remove(col.outputs['Result'].links[0])
    for o in list(sc.objects):
        if o.name.startswith('DustFrame'): bpy.data.objects.remove(o, do_unlink=True)
    clear_text()

# ---- imagotipo (horizontal lock-up, transparent, same aspect as the app asset 1920x674) ----
if 'imagotipo' in modes:
    W, H = 3840, 1348; sc.render.resolution_x, sc.render.resolution_y = W, H
    set_transparent(True); show_dust(False)
    D = 15.8; place_cam(D)
    # put the logo's bounding box at the left edge with a small margin, vertically centred
    x0, x1, y0, y1 = logo_bounds(); logo_h = (y1 - y0) * H; D *= logo_h / (0.94 * H); place_cam(D)
    x0, x1, y0, y1 = logo_bounds()
    SX = (x0 - 0.02); SY = ((y0 + y1) / 2 - 0.5) * H / W
    place_cam(D, SX, SY)
    x0, x1, y0, y1 = logo_bounds()                  # bounds AFTER the shift
    PXU = px_per_unit(W, D)
    left_px = (x1 + 0.035) * W                      # just right of the logo
    orion_w = 0.94 * W - left_px                   # ORION spans from there to a 3.5% right margin
    s_orion = (orion_w / PXU) / 2.72                # Magmawave 'Orion' is ~2.72 units wide at size 1
    s_med = (0.70 * orion_w / PXU) / 6.13           # 'by medinova' ~6.13 units wide at size 1
    tx = x_for_px(left_px + orion_w / 2, W, D, SX)
    t1 = add_text('WordmarkOrion', 'Orion', s_orion, tx, y_for_px(0.615 * H, W, H, D, SY), D, s_orion * 0.19, -10)
    t2 = add_text('WordmarkMedinova', 'by medinova', s_med, tx, y_for_px(0.24 * H, W, H, D, SY), D, s_med * 0.19, -10)
    print('IMAGOTIPO sizes', round(s_orion, 3), round(s_med, 3), 'PXU', round(PXU, 1))
    text_lights(t1, D)
    render(os.path.join(outdir, 'imagotipo_3840x1348_alpha.png'))
    clear_text()

# ---- icono (square mark, transparent) ----
if 'icono' in modes:
    W = H = 1024; sc.render.resolution_x = sc.render.resolution_y = W
    set_transparent(True); show_dust(False)
    fit_square(0.94)
    render(os.path.join(outdir, 'icono_1024_alpha.png'))

# ---- eye only (for 16/32 px favicons) ----
if 'eye' in modes:
    W = H = 1024; sc.render.resolution_x = sc.render.resolution_y = W
    set_transparent(True); show_dust(False)
    for o in sc.objects:
        if o.name.startswith('Torus'): o.hide_render = True
    fit_square(0.90)
    render(os.path.join(outdir, 'ojo_1024_alpha.png'))
    for o in sc.objects:
        if o.name.startswith('Torus'): o.hide_render = False
print('BRAND_DONE')
