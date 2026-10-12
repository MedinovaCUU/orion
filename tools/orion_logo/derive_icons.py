"""Derive every icon size from the 1024 transparent renders. Transparent PNGs are 8-bit RGBA; opaque variants
(iOS touch icon, maskable) get a flat background. Run with Blender (uses its filtered resampling)."""
import bpy, sys, os, numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
src_logo, src_eye, outdir = args
sc = bpy.context.scene
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '8'; sc.render.image_settings.color_mode = 'RGBA'
def to_linear(c): return np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
def load_linear(path):
    img = bpy.data.images.load(path); W, H = img.size
    px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    if not img.is_float: px[:, :, :3] = to_linear(px[:, :, :3])
    return img, px
def save(img, path, rgba=True):
    sc.render.image_settings.color_mode = 'RGBA' if rgba else 'RGB'
    img.save_render(path); print('ICON', path, flush=True)
def resized(path, n):
    img = bpy.data.images.load(path); img.scale(n, n); return img
# transparent sizes
for n in (1024, 674, 512, 256, 192, 128, 96, 64, 48, 32):
    img = resized(src_logo, n); save(img, os.path.join(outdir, f'orion-icono-{n}.png')); bpy.data.images.remove(img)
for n in (64, 48, 32, 16):
    img = resized(src_eye, n); save(img, os.path.join(outdir, f'orion-ojo-{n}.png')); bpy.data.images.remove(img)
# opaque variants: background colour (sRGB hex) + centred logo at `fill`
def srgb_lin(h):
    h = h.lstrip('#'); return to_linear(np.array([int(h[i:i+2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32))
def opaque(name, size, bg_hex, fill, src=src_logo):
    canvas = bpy.data.images.load(src); canvas.scale(size, size)
    px = np.empty(size * size * 4, dtype=np.float32); px[:] = 0
    px = px.reshape(size, size, 4); px[:, :, :3] = srgb_lin(bg_hex); px[:, :, 3] = 1.0
    n = int(size * fill); lg_img, lg = load_linear(src); lg_img.scale(n, n)
    lg = np.empty(n * n * 4, dtype=np.float32); lg_img.pixels.foreach_get(lg); lg = lg.reshape(n, n, 4)
    if not lg_img.is_float: lg[:, :, :3] = to_linear(lg[:, :, :3])
    o = (size - n) // 2; a = lg[:, :, 3:4]
    px[o:o + n, o:o + n, :3] = lg[:, :, :3] * a + px[o:o + n, o:o + n, :3] * (1 - a)
    canvas.pixels.foreach_set(px.ravel()); save(canvas, os.path.join(outdir, name), rgba=False)
    bpy.data.images.remove(canvas); bpy.data.images.remove(lg_img)
opaque('apple-touch-icon-180-claro.png', 180, '#eaf1f6', 0.84)
opaque('apple-touch-icon-180-oscuro.png', 180, '#0b0f18', 0.84)
opaque('apple-touch-icon-1024-claro.png', 1024, '#eaf1f6', 0.84)
opaque('apple-touch-icon-1024-oscuro.png', 1024, '#0b0f18', 0.84)
opaque('pwa-maskable-512-claro.png', 512, '#eaf1f6', 0.66)
opaque('pwa-maskable-512-oscuro.png', 512, '#0b0f18', 0.66)
opaque('pwa-maskable-192-claro.png', 192, '#eaf1f6', 0.66)
print('DERIVE_DONE')
