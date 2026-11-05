#!/usr/bin/env bash
# Sync apple-theme.css -> user.css, settings.json custom_css, two theme JSONs.
# Usage: sync-css.sh [start-test|start-prod|none]
set -euo pipefail
cd /opt/server-agent/workspace/sillytavern
MODE="${1:-start-test}"
sudo docker stop sillytavern st-test >/dev/null 2>&1 || true
python3 - <<'EOF'
import json, hashlib, re
src = open('apple-theme.css').read()
nocom = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
assert nocom.count('{') == nocom.count('}'), ('brace mismatch', nocom.count('{'), nocom.count('}'))
open('data/_css/user.css', 'w').write(src)
h = lambda t: hashlib.sha256(t.encode()).hexdigest()[:12]
p = 'data/default-user/settings.json'
d = json.load(open(p)); d['power_user']['custom_css'] = src
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=4)
for t in ['data/default-user/themes/Apple Glass Dark.json', 'data/default-user/themes/Moonlit Echoes - by Rivelle.json']:
    d = json.load(open(t)); d['custom_css'] = src
    json.dump(d, open(t, 'w'), ensure_ascii=False, indent=4)
hs = {h(src), h(open('data/_css/user.css').read()),
      h(json.load(open(p))['power_user']['custom_css']),
      h(json.load(open('data/default-user/themes/Apple Glass Dark.json'))['custom_css']),
      h(json.load(open('data/default-user/themes/Moonlit Echoes - by Rivelle.json'))['custom_css'])}
assert len(hs) == 1, hs
print('synced sha', hs.pop(), 'len', len(src), 'braces', nocom.count('{'))
EOF
case "$MODE" in
  start-test) sudo docker start st-test >/dev/null; for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123/ 2>/dev/null | grep -q 200 && break; sleep 1; done; echo "st-test up";;
  start-prod) sudo docker start sillytavern >/dev/null; echo "prod started";;
  *) echo "containers left stopped";;
esac
