#!/usr/bin/env bash
# Publish apple-theme.css as the "Apple Glass Dark" UI theme.
#  - themes/Apple Glass Dark.json  custom_css  = source   (the UI theme itself)
#  - settings.json power_user.custom_css       = source   (active-theme copy ST loads on boot)
#  - data/_css/user.css                        = empty    (no separate user.css any more)
# Usage: sync-css.sh [start-test|start-prod|none] [DATA_DIR]
set -euo pipefail
cd /opt/server-agent/workspace/sillytavern
MODE="${1:-start-test}"
DATA="${2:-data}"
sudo docker stop sillytavern st-test >/dev/null 2>&1 || true
DATA="$DATA" python3 - <<'EOF'
import json, hashlib, re, os
D = os.environ['DATA']
src = open('apple-theme.css').read()
nocom = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
assert nocom.count('{') == nocom.count('}'), ('brace mismatch', nocom.count('{'), nocom.count('}'))
h = lambda t: hashlib.sha256(t.encode()).hexdigest()[:12]
theme = f'{D}/default-user/themes/Apple Glass Dark.json'
t = json.load(open(theme)); t['custom_css'] = src
json.dump(t, open(theme, 'w'), ensure_ascii=False, indent=4)
p = f'{D}/default-user/settings.json'
s = json.load(open(p))
if s['power_user'].get('theme') == 'Apple Glass Dark':
    s['power_user']['custom_css'] = src
    json.dump(s, open(p, 'w'), ensure_ascii=False, indent=4)
os.makedirs(f'{D}/_css', exist_ok=True)
open(f'{D}/_css/user.css', 'w').write('/* Intentionally empty: styling ships with the "Apple Glass Dark" UI theme. */\n')
got = {h(src), h(json.load(open(theme))['custom_css'])}
if json.load(open(p))['power_user'].get('theme') == 'Apple Glass Dark':
    got.add(h(json.load(open(p))['power_user']['custom_css']))
assert len(got) == 1, got
print('theme sha', got.pop(), 'len', len(src), 'braces', nocom.count('{'), 'data', D)
EOF
case "$MODE" in
  start-test) sudo docker start st-test >/dev/null; for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123/ 2>/dev/null | grep -q 200 && break; sleep 1; done; echo "st-test up";;
  start-prod) sudo docker start sillytavern >/dev/null; echo "prod started";;
  *) echo "containers left stopped";;
esac
