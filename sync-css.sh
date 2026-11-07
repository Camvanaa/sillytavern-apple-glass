#!/usr/bin/env bash
# Publish apple-theme.css as the "Apple Glass Dark" UI theme, and splash.css as user.css.
#  - themes/Apple Glass Dark.json  custom_css  = apple-theme.css (the UI theme itself)
#  - settings.json power_user.custom_css       = apple-theme.css (active-theme copy ST loads on boot)
#  - data/_css/user.css                        = splash.css      (start-up splash ONLY, not the theme)
# Why user.css carries the splash: ST shows its splash before getSettings() injects the theme's
# custom CSS; css/user.css is <link>ed in <head> and is the only stylesheet active on frame one.
# Usage: sync-css.sh [start-test|start-prod|none] [DATA_DIR]
set -euo pipefail
cd /opt/server-agent/workspace/sillytavern
MODE="${1:-start-test}"
DATA="${2:-data}"
sudo docker stop sillytavern st-test >/dev/null 2>&1 || true
DATA="$DATA" python3 - <<'EOF'
import json, hashlib, re, os
D = os.environ['DATA']
h = lambda t: hashlib.sha256(t.encode()).hexdigest()[:12]
def braces(name, text):
    nocom = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    assert nocom.count('{') == nocom.count('}'), (name, 'brace mismatch', nocom.count('{'), nocom.count('}'))
    return nocom.count('{')
src = open('apple-theme.css').read()
splash = open('splash.css').read()
nb = braces('apple-theme.css', src)
ns = braces('splash.css', splash)
# splash.css must stay a small, splash-only sheet (never the whole theme by mistake)
assert len(splash.encode()) < 16384 and '#preloader' in splash and '--ap-blue' not in splash, 'splash.css looks wrong'
theme = f'{D}/default-user/themes/Apple Glass Dark.json'
t = json.load(open(theme)); t['custom_css'] = src
json.dump(t, open(theme, 'w'), ensure_ascii=False, indent=4)
p = f'{D}/default-user/settings.json'
s = json.load(open(p))
if s['power_user'].get('theme') == 'Apple Glass Dark':
    s['power_user']['custom_css'] = src
    json.dump(s, open(p, 'w'), ensure_ascii=False, indent=4)
os.makedirs(f'{D}/_css', exist_ok=True)
with open(f'{D}/_css/user.css', 'w') as f:
    f.write(splash)
got = {h(src), h(json.load(open(theme))['custom_css'])}
if json.load(open(p))['power_user'].get('theme') == 'Apple Glass Dark':
    got.add(h(json.load(open(p))['power_user']['custom_css']))
assert len(got) == 1, got
user = open(f'{D}/_css/user.css').read()
assert h(user) == h(splash), ('user.css sha mismatch', h(user), h(splash))
print('theme sha', got.pop(), 'len', len(src), 'braces', nb, 'data', D)
print('user.css sha', h(user), 'bytes', len(user.encode()), 'braces', ns, '(= splash.css)')
EOF
case "$MODE" in
  start-test) sudo docker start st-test >/dev/null; for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123/ 2>/dev/null | grep -q 200 && break; sleep 1; done; echo "st-test up";;
  start-prod) sudo docker start sillytavern >/dev/null; echo "prod started";;
  *) echo "containers left stopped";;
esac
