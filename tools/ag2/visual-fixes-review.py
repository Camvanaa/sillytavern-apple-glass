#!/usr/bin/env python3
"""Review frozen VF01 evidence, keeping development failures separate and explicit."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/opt/server-agent/workspace/st-testdata/redesign/visual-fixes')
failures = []
facts = {}

def require(value, label):
    if not value:
        failures.append(label)

def read(name):
    try:
        return json.loads((ROOT / name).read_text())
    except Exception as error:
        failures.append(f'{name}: {error}')
        return {}

for folder, count in [('regression-reviewed', 15), ('full-reviewed', 22)]:
    p = ROOT / folder
    if not p.exists():
        failures.append(f'{folder}: not yet reviewed')
        continue
    result = subprocess.run(['python3', 'tools/ag2/qa-verdict.py', str(p)], capture_output=True, text=True)
    verdict = read(f'{folder}/verdict.json')
    facts[folder] = verdict
    require(result.returncode == 0 and verdict.get('ok') is True, folder)
    require(verdict.get('files') == count, folder + ' expected files')

special = ['messages-desktop-v4.json', 'messages-phone-final.json', 'controls-desktop-v4.json',
           'controls-phone-final.json', 'layout-desktop-v4.json', 'layout-phone-v5.json',
           'dock-v2.json', 'select-life-desktop.json', 'select-life-phone.json', 'fallback.json']
for name in special:
    record = read(name)
    require(record.get('ok') is True, name)
    facts[name] = {'ok': record.get('ok'), 'checks': len(record.get('checks', []))}

for view in ['desktop', 'phone']:
    r = read(f'regression-reviewed/r3a-func-{view}.json')
    require(len(r.get('checks', {})) == 19 and all(r.get('checks', {}).values()), f'R3a func {view}')

pixels = read('embedded-pixel-comparison.json')
require(isinstance(pixels, list) and len(pixels) == 16 and all(p.get('pixelEqual') for p in pixels), 'embedded pixels')

data = pathlib.Path('/opt/server-agent/workspace/st-testdata/ag2-data/default-user')
current = {str(p.relative_to(data)): hashlib.sha256(p.read_bytes()).hexdigest()
           for sub in ['chats', 'group chats'] for p in (data / sub).rglob('*.jsonl')}
require(current == read('fixture-before.json'), 'fixture SHA256')
require(len(current) == 9, 'fixture count')
require(not any('FIXTURE-CHANGED' in p.read_text(errors='replace') for p in ROOT.rglob('*.err')), 'runner fixture guard')
facts['fixture'] = {'count': len(current), 'equal': current == read('fixture-before.json')}

out = {'ok': not failures, 'failures': failures, 'facts': facts}
(ROOT / 'final-verdict.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(out, ensure_ascii=False, indent=2))
raise SystemExit(0 if out['ok'] else 1)
