"""Fade the composited image (premultiplied RGB and alpha) toward the frame border so bloom never ends in a hard line,
and tighten the bloom. The logo must stay inside the box (see widen_camera.py). Usage: ... --python feather_edges.py -- <out.blend> [box] [blur_px]"""
import bpy, sys
args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]; box_size = float(args[1]) if len(args) > 1 else 0.78; blur_px = float(args[2]) if len(args) > 2 else 110.0
sc = bpy.context.scene; ct = sc.compositing_node_group
ct.nodes['Glare'].inputs['Size'].default_value = 0.26
gout = ct.nodes['Group Output']
final_link = [l for l in ct.links if l.to_node == gout][0]; final = final_link.from_socket; ct.links.remove(final_link)
box = ct.nodes.new('CompositorNodeBoxMask'); box.inputs['Position'].default_value = (0.5, 0.5); box.inputs['Size'].default_value = (box_size, box_size)
blur = ct.nodes.new('CompositorNodeBlur'); blur.inputs['Size'].default_value = (blur_px, blur_px); blur.inputs['Extend Bounds'].default_value = False
ct.links.new(box.outputs['Mask'], blur.inputs['Image'])
sep = ct.nodes.new('CompositorNodeSeparateColor'); ct.links.new(final, sep.inputs['Image'])
comb = ct.nodes.new('CompositorNodeCombineColor')
for ch in ('Red', 'Green', 'Blue', 'Alpha'):
    m = ct.nodes.new('ShaderNodeMath'); m.operation = 'MULTIPLY'
    ct.links.new(sep.outputs[ch], m.inputs[0]); ct.links.new(blur.outputs['Image'], m.inputs[1]); ct.links.new(m.outputs[0], comb.inputs[ch])
ct.links.new(comb.outputs['Image'], gout.inputs[0])
bpy.ops.wm.save_as_mainfile(filepath=out); print('FEATHER saved', out, 'box', box_size, 'blur', blur_px)
