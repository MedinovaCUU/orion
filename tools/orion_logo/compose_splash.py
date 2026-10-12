import bpy, sys, os, numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
logo_path, outdir = args[0], args[1]; renders = args[2:]
logo = bpy.data.images.load(logo_path); lw, lh = logo.size
lp = np.empty(lw * lh * 4, dtype=np.float32); logo.pixels.foreach_get(lp); lp = lp.reshape(lh, lw, 4)
ys, xs = np.where(lp[:, :, 3] > 0.02)
lp = lp[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
ch, cw = lp.shape[:2]
def resize_logo(w, h):
    img = logo.copy(); img.scale(lw, lh)            # fresh copy of the full logo
    # crop by scaling the whole image then slicing (keeps Blender's filtered resampling)
    sx = w / cw; sy = h / ch
    img.scale(int(lw * sx), int(lh * sy))
    o = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32); img.pixels.foreach_get(o)
    o = o.reshape(img.size[1], img.size[0], 4)
    y0 = int(ys.min() * sy); x0 = int(xs.min() * sx)
    bpy.data.images.remove(img)
    return o[y0:y0 + h, x0:x0 + w]
for rp in renders:
    r = bpy.data.images.load(rp); W, H = r.size
    px = np.empty(W * H * 4, dtype=np.float32); r.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    tw = int(W * 0.13); th = int(tw * ch / cw); margin = int(W * 0.032)
    lg = resize_logo(tw, th); th, tw = lg.shape[:2]
    # byte images expose sRGB-encoded floats; the 16-bit render is a linear float buffer -> linearise the logo
    if not logo.is_float:
        c = lg[:, :, :3]; lg[:, :, :3] = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    if not r.is_float:
        raise SystemExit('render is a byte image; expected 16-bit float buffer')
    x0 = W - margin - tw; y0 = margin
    a = lg[:, :, 3:4]
    px[y0:y0 + th, x0:x0 + tw, :3] = lg[:, :, :3] * a + px[y0:y0 + th, x0:x0 + tw, :3] * (1 - a)
    px[:, :, 3] = 1.0
    r.pixels.foreach_set(px.ravel())
    base = os.path.splitext(os.path.basename(rp))[0].replace('splash_render_rgba_', '').replace('splash_', '').replace('_4K', '')
    r.filepath_raw = os.path.join(outdir, f'Orion_bienvenida_{base}_4K.png'); r.file_format = 'PNG'; r.save()
    print('COMPOSED', r.filepath_raw, flush=True)
    bpy.data.images.remove(r)
