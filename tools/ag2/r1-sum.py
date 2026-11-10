#!/usr/bin/env python3
"""r1-sum.py [-v] <r1-flash json>... — one line per operation with a bad frame (-v: every operation)."""
import json, sys
v = '-v' in sys.argv
for f in [a for a in sys.argv[1:] if a != '-v']:
    print('==', f)
    try:
        d = json.load(open(f))
    except Exception as e:
        print('  no json:', e); continue
    t = d['total']
    print('  dur', d.get('dur'), 'ops', t.get('ops'), 'frames', t.get('frames'), 'out', t['out'], 'native', t['native'],
          'blur', t['blur'], 'overlap', t.get('overlap'), d.get('verdict'), d.get('error') or '')
    for k, o in d['ops'].items():
        bad = o['out'] or o['native'] or o['blur']
        if v or bad:
            print(f"  {k:26s} fr={o['frames']:4d} gap={o['maxGap']:4d} out={o['out']:3d} nat={o['native']:3d} blur={o['blur']:3d} ov={o['overlap']:3d} insp={o['insp']:3d} | {o['after']}{'  <<<' if bad else ''}")
    for k in ('func', 'errors', 'themeBack', 'afterDragPage', 'afterDragList', 'afterDragShort', 'afterFast'):
        if k in d: print('  ', k, json.dumps(d[k], ensure_ascii=False))
