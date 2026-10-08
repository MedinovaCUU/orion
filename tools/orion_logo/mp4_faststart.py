"""Move the moov atom before mdat (qt-faststart) so browsers can start playing before the whole file is downloaded."""
import struct, sys

def atoms(buf, start, end):
    pos = start
    while pos + 8 <= end:
        size, typ = struct.unpack('>I4s', buf[pos:pos + 8]); hdr = 8
        if size == 1:
            size = struct.unpack('>Q', buf[pos + 8:pos + 16])[0]; hdr = 16
        elif size == 0:
            size = end - pos
        yield typ, pos, size, hdr
        pos += size

CONTAINERS = {b'moov', b'trak', b'mdia', b'minf', b'stbl', b'edts', b'udta'}

def patch_offsets(moov, delta):
    out = bytearray(moov)
    def walk(start, end):
        for typ, pos, size, hdr in atoms(out, start, end):
            if typ in CONTAINERS:
                walk(pos + hdr, pos + size)
            elif typ == b'stco':
                n = struct.unpack('>I', out[pos + 12:pos + 16])[0]
                for i in range(n):
                    o = pos + 16 + 4 * i
                    out[o:o + 4] = struct.pack('>I', struct.unpack('>I', out[o:o + 4])[0] + delta)
            elif typ == b'co64':
                n = struct.unpack('>I', out[pos + 12:pos + 16])[0]
                for i in range(n):
                    o = pos + 16 + 8 * i
                    out[o:o + 8] = struct.pack('>Q', struct.unpack('>Q', out[o:o + 8])[0] + delta)
    walk(0, len(out))
    return bytes(out)

def faststart(path):
    data = open(path, 'rb').read()
    top = list(atoms(data, 0, len(data)))
    types = [t for t, *_ in top]
    if types.index(b'moov') < types.index(b'mdat'):
        print('already faststart', path); return
    ftyp = next(data[p:p + s] for t, p, s, h in top if t == b'ftyp')
    moov = next(data[p:p + s] for t, p, s, h in top if t == b'moov')
    rest = b''.join(data[p:p + s] for t, p, s, h in top if t not in (b'ftyp', b'moov'))
    open(path, 'wb').write(ftyp + patch_offsets(moov, len(moov)) + rest)
    print('faststart ok', path, [t.decode() for t, *_ in atoms(ftyp + moov + rest, 0, len(data))])

for p in sys.argv[1:]: faststart(p)
