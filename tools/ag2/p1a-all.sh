#!/usr/bin/env bash
# tools/ag2/p1a-all.sh — run every P1a acceptance part + the §4.6 baseline under AG2.
# Output: /tmp/opencode/p1a/<part>.json (+ .err). Screenshots: real/P1a/.
set -u
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
OUT=/tmp/opencode/p1a; mkdir -p "$OUT"
for p in ${P1A_PARTS:-shots func themes classic pins boot}; do
  node tools/ag2/run.mjs tools/ag2/p1a.mjs --phase P1a --part "$p" >"$OUT/$p.json" 2>"$OUT/$p.err"; echo "p1a $p exit $?"
done
for p in ${BASE_PARTS:-desk styles reduced phone cold compat}; do
  node tools/ag2/run.mjs tools/ag2/baseline.mjs --phase P1a --part "$p" --ag2 >"$OUT/base-$p.json" 2>"$OUT/base-$p.err"; echo "base $p exit $?"
done
echo ALLDONE
