#!/usr/bin/env python3
"""Pixel diff for Apple Glass audits (stdlib only: zlib PNG decoder, no Pillow).

usage: pixdiff.py A.png B.png [x y w h]
Prints: identical? changed-pixel % (any channel differs by > 2), mean abs delta
(0-255, over RGB), max delta, and the bounding box of changed pixels.
Supports the 8-bit non-interlaced RGB / RGBA PNGs Chrome writes.
"""
import struct
import sys
import zlib


def read_png(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, w = 8, [], None
    while pos < len(data):
        ln, typ = struct.unpack('>I4s', data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b'IHDR':
            w, h, depth, ctype, _, _, inter = struct.unpack('>IIBBBBB', chunk)
            assert depth == 8 and inter == 0 and ctype in (2, 6), (depth, ctype, inter)
            bpp = 3 if ctype == 2 else 4
        elif typ == b'IDAT':
            idat.append(chunk)
        elif typ == b'IEND':
            break
    raw = zlib.decompress(b''.join(idat))
    stride = w * bpp
    rows, prev = [], bytearray(stride)
    i = 0
    for _ in range(h):
        ft = raw[i]
        line = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        if ft == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif ft == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif ft == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 255
        elif ft == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line))
        prev = line
    return w, h, bpp, rows


def diff(a_path, b_path, box=None):
    wa, ha, ba, ra = read_png(a_path)
    wb, hb, bb, rb = read_png(b_path)
    if (wa, ha) != (wb, hb):
        return {'shapeMismatch': [(wa, ha), (wb, hb)]}
    x0, y0, bw, bh = box if box else (0, 0, wa, ha)
    changed = total = 0
    dsum = 0
    maxd = 0
    bx0 = by0 = 10 ** 9
    bx1 = by1 = -1
    for y in range(y0, min(y0 + bh, ha)):
        la, lb = ra[y], rb[y]
        for x in range(x0, min(x0 + bw, wa)):
            pa, pb = x * ba, x * bb
            d0 = abs(la[pa] - lb[pb])
            d1 = abs(la[pa + 1] - lb[pb + 1])
            d2 = abs(la[pa + 2] - lb[pb + 2])
            m = max(d0, d1, d2)
            dsum += d0 + d1 + d2
            total += 1
            if m > maxd:
                maxd = m
            if m > 2:
                changed += 1
                bx0, by0, bx1, by1 = min(bx0, x), min(by0, y), max(bx1, x), max(by1, y)
    res = {
        'identical': maxd == 0,
        'changedPct': round(changed / total * 100, 3),
        'meanDelta': round(dsum / total / 3, 3),
        'maxDelta': maxd,
    }
    if changed:
        res['bbox'] = [bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1]
    return res


if __name__ == '__main__':
    box = tuple(int(v) for v in sys.argv[3:7]) if len(sys.argv) >= 7 else None
    print(diff(sys.argv[1], sys.argv[2], box))
