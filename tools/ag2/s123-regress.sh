#!/usr/bin/env bash
# One browser process at a time; artifacts remain outside the repository.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=/opt/server-agent/workspace/st-testdata/redesign/s123-polish
mkdir -p "$OUT/logs"
run() {
    local name=$1 suite=$2
    shift 2
    node tools/ag2/run.mjs "tools/ag2/$suite.mjs" --phase "$name" --shots "$OUT/screenshots" "$@" > "$OUT/logs/$name.json"
}
run p3-chat p3 --part chat
# p5 names the phone chat/AN acceptance walk "pages" (there is no "chat" part).
run p5-pages p5 --phone --part pages
run r2a-desktop r2a --part sweep
run r2a-phone r2a --part sweep --phone
run r2a-func-desktop r2a --part func
run r2a-func-phone r2a --part func --phone
run embedded-desktop embedded-scheme --part fixed
run embedded-phone embedded-scheme --part fixed --phone
python3 - "$OUT" <<'PY'
import json, pathlib, sys, datetime
p = pathlib.Path(sys.argv[1])
load = lambda name: json.loads((p / 'logs' / (name + '.json')).read_text())
assert load('p3-chat')['ok']
phone = load('p5-pages')
assert phone['an']['vis'] and phone['an']['sw'] <= phone['an']['cw']
assert all(phone['anScan'][k] == 0 for k in ('ovf', 'dbl', 'unhid', 'nest', 'btn'))
for name in ('r2a-desktop', 'r2a-phone'):
    assert all(load(name)['totals'][k] == 0 for k in ('clip', 'over', 'native', 'scan')), name
for name in ('r2a-func-desktop', 'r2a-func-phone', 'embedded-desktop', 'embedded-phone'):
    assert load(name)['ok'], name
status = {'ok': True, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'build': '20261114VF03', 'suites': 8}
(p / 'final-status.json').write_text(json.dumps(status, indent=2))
with (p / 'REPORT.md').open('a') as f:
    f.write('\n## 最终后台回归完成\n\n' + status['completedAt'] + '：8 项最终回归全部通过。两端 r2a 的 clip/over/native/scan 均为 0；p3、p5 AN、两端功能与透明 iframe 断言通过。此结果取代上方“尚待后台结束”状态。\n')
print('S123 final regressions: PASS')
PY
