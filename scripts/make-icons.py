#!/usr/bin/env python3
"""Write the app icons in public/ — a white tick on the accent blue.

Run from the repo root: python3 scripts/make-icons.py

Hand-rolled PNG writing keeps this free of an image dependency; the icons
are committed, so this only runs when the mark or the colour changes.
"""
import zlib, struct, math

ACCENT = (0x1f, 0x6f, 0xeb)
WHITE = (255, 255, 255)
SS = 3  # supersample factor per axis

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

# Checkmark as two round-capped segments, in unit coordinates. Kept inside the
# middle 60% so a maskable circle crop never clips it.
STROKE = 0.075
MARK = [(0.32, 0.52, 0.44, 0.64), (0.44, 0.64, 0.70, 0.36)]

def render(size):
    px = bytearray()
    for y in range(size):
        px.append(0)  # PNG filter type: none
        for x in range(size):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    u = (x + (sx + 0.5) / SS) / size
                    v = (y + (sy + 0.5) / SS) / size
                    if any(seg_dist(u, v, *s) <= STROKE for s in MARK):
                        hits += 1
            a = hits / (SS * SS)
            px.extend(round(ACCENT[i] + (WHITE[i] - ACCENT[i]) * a) for i in range(3))
    return bytes(px)

def png(size, path):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    out = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(render(size), 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(out)
    print(path, size, len(out), 'bytes')

for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    png(size, 'public/' + name)
