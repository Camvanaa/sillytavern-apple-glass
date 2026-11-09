#!/usr/bin/env bash
# tools/ag2/p1b-all.sh — every P1b acceptance part + P1a's shell checks + the §4.6 baseline
# under AG2 (theme must be published + active: sync-css.sh start-test … --activate "Apple Glass 2").
# Output: /tmp/opencode/p1b/<part>.json (+ .err). Screenshots: real/P1b/.
set -u
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
OUT=/tmp/opencode/p1b; mkdir -p "$OUT"
run() { local name=$1; shift; timeout 600 node tools/ag2/run.mjs "$@" >"$OUT/$name.json" 2>"$OUT/$name.err"; echo "$name exit $?"; }
for p in ${P1B_PARTS:-shots gen stream model offline plus multiline styles hover themes script jump}; do
  run "p1b-$p" tools/ag2/p1b.mjs --phase P1b --part "$p"
done
[ -n "${P1B_1280:-1}" ] && run p1b-shots-1280 tools/ag2/p1b.mjs --phase P1b --part shots --w 1280 --h 900
for p in ${P1A_PARTS:-func themes classic}; do
  run "p1a-$p" tools/ag2/p1a.mjs --phase P1b --part "$p"
done
for p in ${BASE_PARTS:-desk styles reduced phone cold compat}; do
  run "base-$p" tools/ag2/baseline.mjs --phase P1b --part "$p" --ag2
done
echo ALLDONE
