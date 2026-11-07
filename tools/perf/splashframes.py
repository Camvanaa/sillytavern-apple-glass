#!/usr/bin/env python3
"""Decode splashrec.js screencast frames into contact sheets.

usage: splashframes.py RESULTS_DIR TAG OUT.jpg [FROM_MS TO_MS] [x0 y0 x1 y1]

 - RESULTS_DIR/splash-<TAG>.jsonl: lines of [{t, ts, data(base64 jpeg)}, ...] (sink output);
   t = ms since the run started (runner clock).
 - Every frame between FROM_MS and TO_MS (default: all), optionally cropped to the box,
   is laid out 8 per row with its timestamp, so a person can check frame by frame
   which logo the splash painted. (An automatic "old logo" pixel match was tried and
   dropped: the stock logo sits on a dark field, so dark empty frames scored as close.)
 - Prints the number of frames and their timestamps.
Pure PIL; run it from outside the results directory (python3 -P / -I).
"""
import base64, io, json, os, sys
from PIL import Image, ImageDraw


def load(path):
    frames = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                frames.extend((fr['t'], fr['data']) for fr in json.loads(line))
    frames.sort(key=lambda x: x[0])
    return frames


def main():
    root, tag, out = sys.argv[1:4]
    lo, hi = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (0, 10 ** 9)
    box = tuple(int(v) for v in sys.argv[6:10]) if len(sys.argv) > 9 else None
    frames = [(t, d) for t, d in load(os.path.join(root, f'splash-{tag}.jsonl')) if lo <= t <= hi]
    if not frames:
        print(json.dumps({'frames': 0}))
        return
    cols, cw = 8, 150
    first = Image.open(io.BytesIO(base64.b64decode(frames[0][1])))
    w, h = (box[2] - box[0], box[3] - box[1]) if box else first.size
    ch = int(cw * h / w)
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (cw + 4), rows * (ch + 14)), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for i, (t, data) in enumerate(frames):
        im = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGB')
        if box:
            im = im.crop(box)
        x, y = (i % cols) * (cw + 4), (i // cols) * (ch + 14)
        sheet.paste(im.resize((cw, ch)), (x, y + 12))
        draw.text((x + 2, y), str(t), fill=(0, 0, 0))
    sheet.save(out, quality=78)
    print(json.dumps({'frames': len(frames), 't': [t for t, _ in frames]}))


main()
