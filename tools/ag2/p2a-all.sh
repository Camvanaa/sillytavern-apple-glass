#!/usr/bin/env bash
# tools/ag2/p2a-all.sh — P2a acceptance parts (+ P1b/P1a functional regressions) and the §4.6
# baseline under AG2. Theme must be published + active (sync-css.sh start-test … --activate "Apple Glass 2").
# Output: /tmp/opencode/p2a/<part>.json (+ .err). Screenshots: real/P2a/.
# Select with P2A_PARTS / P1B_PARTS / P1A_PARTS / BASE_PARTS (a single space skips a group).
set -u
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
OUT=/tmp/opencode/p2a; mkdir -p "$OUT"
run() { local name=$1; shift; timeout 600 node tools/ag2/run.mjs "$@" >"$OUT/$name.json" 2>"$OUT/$name.err"; echo "$name exit $?"; }
for p in ${P2A_PARTS:-shots func esc look themes}; do
  run "p2a-$p" tools/ag2/p2a.mjs --phase P2a --part "$p"
done
[ "${P2A_1280-1}" = 1 ] && run p2a-shots-1280 tools/ag2/p2a.mjs --phase P2a --part shots --w 1280 --h 900
for p in ${P1B_PARTS:-gen model offline plus styles themes jump}; do
  run "p1b-$p" tools/ag2/p1b.mjs --phase P2a --part "$p"
done
for p in ${P1A_PARTS:-func themes classic}; do
  run "p1a-$p" tools/ag2/p1a.mjs --phase P2a --part "$p"
done
for p in ${BASE_PARTS:-desk styles reduced phone cold compat}; do
  run "base-$p" tools/ag2/baseline.mjs --phase P2a --part "$p" --ag2
done
echo ALLDONE
