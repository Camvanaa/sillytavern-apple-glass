#!/usr/bin/env bash
# Publish the Apple Glass UI themes and splash.css into a SillyTavern data dir.
#  - themes/Apple Glass Dark.json custom_css = apple-theme.css   (classic theme)
#  - themes/Apple Glass 2.json    custom_css = apple-glass-2.css (new shell theme; the JSON is
#                                  "Apple Glass Dark.json" with only name + custom_css changed)
#  - settings.json power_user.custom_css     = CSS of the ACTIVE theme (the copy ST loads on boot)
#  - data/_css/user.css                      = splash.css (start-up splash ONLY, not the theme)
# Why user.css carries the splash: ST shows its splash before getSettings() injects the theme's
# custom CSS; css/user.css is <link>ed in <head> and is the only stylesheet active on frame one.
#
# Usage: sync-css.sh [start-test|start-prod|none] [DATA_DIR] [--activate "Apple Glass 2"]
#   start-test  stop st-test, publish, start st-test     (sillytavern is never touched)
#   none        stop st-test, publish, leave it stopped  (sillytavern is never touched)
#   start-prod  stop sillytavern, publish, start it      (st-test is never touched)
#   --activate NAME  make NAME the active theme (power_user.theme + custom_css). Without it the
#                    active theme is kept and only its custom_css is refreshed.
# Each mode stops ONLY its own container: ST keeps settings in memory and may write them back,
# so the target must be down while its files change; the other instance is left alone.
set -euo pipefail
cd "$(dirname "$0")"

ACTIVATE=""
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --activate) ACTIVATE="${2:?--activate needs a theme name}"; shift 2;;
    --activate=*) ACTIVATE="${1#--activate=}"; shift;;
    *) POS+=("$1"); shift;;
  esac
done
MODE="${POS[0]:-start-test}"
DATA="${POS[1]:-data}"
case "$MODE" in
  start-test|none) TARGET=st-test;;
  start-prod) TARGET=sillytavern;;
  *) echo "unknown mode: $MODE" >&2; exit 2;;
esac
case "$ACTIVATE" in
  ""|"Apple Glass Dark"|"Apple Glass 2") ;;
  *) echo "--activate: unknown theme '$ACTIVATE'" >&2; exit 2;;
esac
[ -f "$DATA/default-user/settings.json" ] || { echo "no settings.json under $DATA" >&2; exit 2; }

# Guard: writing the data dir of a RUNNING container that we do not stop would race with it.
# Refuse to touch production data unless the mode is start-prod (which stops sillytavern first).
REAL_DATA="$(realpath "$DATA")"
PROD_DATA="$(sudo docker inspect sillytavern --format '{{range .Mounts}}{{if eq .Destination "/home/node/app/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
PROD_DATA="${PROD_DATA:-/opt/server-agent/workspace/sillytavern/data}"
if [ "$TARGET" != sillytavern ] && [ "$REAL_DATA" = "$(realpath -m "$PROD_DATA")" ]; then
  echo "refusing: $DATA is the production data dir; use start-prod" >&2; exit 3
fi

sudo docker stop "$TARGET" >/dev/null 2>&1 || true
DATA="$DATA" ACTIVATE="$ACTIVATE" python3 - <<'EOF'
import json, hashlib, re, os
D = os.environ['DATA']
ACT = os.environ['ACTIVATE']
h = lambda t: hashlib.sha256(t.encode()).hexdigest()[:12]
def braces(name, text):
    nocom = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    assert nocom.count('{') == nocom.count('}'), (name, 'brace mismatch', nocom.count('{'), nocom.count('}'))
    return nocom.count('{')
CSS = {'Apple Glass Dark': open('apple-theme.css').read(), 'Apple Glass 2': open('apple-glass-2.css').read()}
splash = open('splash.css').read()
nb = {n: braces(n, c) for n, c in CSS.items()}
ns = braces('splash.css', splash)
# splash.css must stay a small, splash-only sheet (never the whole theme by mistake)
assert len(splash.encode()) < 16384 and '#preloader' in splash and '--ap-blue' not in splash, 'splash.css looks wrong'
# the new theme must be scoped: every rule hangs under body.ag2 (checked loosely: it must use it)
assert 'body.ag2' in CSS['Apple Glass 2'], 'apple-glass-2.css is not scoped to body.ag2'
TD = f'{D}/default-user/themes'
path = lambda n: f'{TD}/{n}.json'
# Apple Glass Dark: refresh custom_css in place (the file is the template for AG2)
t = json.load(open(path('Apple Glass Dark')))
t['custom_css'] = CSS['Apple Glass Dark']
json.dump(t, open(path('Apple Glass Dark'), 'w'), ensure_ascii=False, indent=4)
# Apple Glass 2: the AG Dark JSON with only name + custom_css changed
t2 = dict(t, name='Apple Glass 2', custom_css=CSS['Apple Glass 2'])
json.dump(t2, open(path('Apple Glass 2'), 'w'), ensure_ascii=False, indent=4)
p = f'{D}/default-user/settings.json'
s = json.load(open(p))
pu = s['power_user']
if ACT:
    pu['theme'] = ACT
active = pu.get('theme')
if active in CSS:
    pu['custom_css'] = CSS[active]
if ACT or active in CSS:
    json.dump(s, open(p, 'w'), ensure_ascii=False, indent=4)
os.makedirs(f'{D}/_css', exist_ok=True)
with open(f'{D}/_css/user.css', 'w') as f:
    f.write(splash)
# verify what is on disk now
for n, c in CSS.items():
    j = json.load(open(path(n)))
    assert j['name'] == n and h(j['custom_css']) == h(c), (n, 'theme sha mismatch')
    keys = set(j) ^ set(t)
    assert not keys, (n, 'theme keys differ from template', keys)
s = json.load(open(p))
active = s['power_user'].get('theme')
if active in CSS:
    assert h(s['power_user']['custom_css']) == h(CSS[active]), ('settings custom_css sha mismatch', active)
user = open(f'{D}/_css/user.css').read()
assert h(user) == h(splash), ('user.css sha mismatch', h(user), h(splash))
for n, c in CSS.items():
    print(f'theme "{n}" sha', h(c), 'len', len(c), 'braces', nb[n])
print('active theme:', active, '(custom_css synced)' if active in CSS else '(not an Apple Glass theme, custom_css untouched)', 'data', D)
print('user.css sha', h(user), 'bytes', len(user.encode()), 'braces', ns, '(= splash.css)')
EOF
wait_http() { for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true); [ "$c" = "$2" ] && return 0; sleep 1; done; return 1; }
case "$MODE" in
  start-test) sudo docker start st-test >/dev/null; wait_http http://127.0.0.1:8123/ 200 && echo "st-test up" || { echo "st-test did not come up" >&2; exit 4; };;
  start-prod) sudo docker start sillytavern >/dev/null; wait_http http://127.0.0.1:8000/ 401 && echo "prod up (401)" || { echo "prod did not answer 401" >&2; exit 4; };;
  none) echo "st-test left stopped";;
esac
