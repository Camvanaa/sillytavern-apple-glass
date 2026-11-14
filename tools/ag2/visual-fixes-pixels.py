#!/usr/bin/env python3
"""Compare only the same iframe-host crops used for MF04, not entire-page pixels."""
import json
from pathlib import Path
from PIL import Image, ImageChops

base = Path('/opt/server-agent/workspace/st-testdata/redesign')
old = base / 'iframe-regression'
root = base / 'visual-fixes'
records = json.loads((old / 'pixel-comparison.json').read_text())
out = []
for record in records:
    view, scene, crop = record['view'], record['scene'], record['crop']
    previous = old / f'{view}-old-{scene}.png'
    current = root / 'regression' / f'{view}-fixed-{scene}.png'
    if not current.exists():
        current = root / 'regression-shots' / current.name
    a, b = Image.open(previous).convert('RGB').crop(crop), Image.open(current).convert('RGB').crop(crop)
    bounds = ImageChops.difference(a, b).getbbox()
    out.append({'view': view, 'scene': scene, 'crop': crop, 'old': str(previous), 'current': str(current),
                'pixelEqual': bounds is None, 'differenceBounds': bounds})
(root / 'embedded-pixel-comparison.json').write_text(json.dumps(out, indent=2) + '\n')
print(f"{sum(r['pixelEqual'] for r in out)}/{len(out)} equal crops")
raise SystemExit(0 if all(r['pixelEqual'] for r in out) else 1)
