import struct, sys, os
out = sys.argv[1]; pngs = sys.argv[2:]          # PNG-in-ICO (supported by every modern browser and Windows Vista+)
blobs = [open(p, 'rb').read() for p in pngs]
sizes = []
for b in blobs:
    w, h = struct.unpack('>II', b[16:24]); sizes.append((w, h))
hdr = struct.pack('<HHH', 0, 1, len(blobs)); off = 6 + 16 * len(blobs); entries = b''
for (w, h), b in zip(sizes, blobs):
    entries += struct.pack('<BBBBHHII', w % 256, h % 256, 0, 0, 1, 32, len(b), off); off += len(b)
open(out, 'wb').write(hdr + entries + b''.join(blobs)); print('ICO', out, sizes)
