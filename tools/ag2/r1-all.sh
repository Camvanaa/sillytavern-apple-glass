#!/usr/bin/env bash
# tools/ag2/r1-all.sh <outdir> [extra r1-flash flags] — desktop then phone probe, ONE browser at
# a time (the test host has 2 cores; parallel runs overload it and distort the frame sampling).
#   r1-all.sh out/post                 default animation duration
#   r1-all.sh out/post-red --st-reduced
# PARTS="desk" or PARTS="phone" runs one part only.
set -u
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
O=$1; shift; mkdir -p "$O"
for p in ${PARTS:-desk phone}; do
  [ "$p" = phone ] && ph=--phone || ph=
  timeout 900 nice -n 5 node tools/ag2/run.mjs tools/ag2/r1-flash.mjs --phase R1 --part "$p" $ph "$@" >"$O/$p.json" 2>"$O/$p.err"; echo "$p exit $?"
  sleep 20
done
python3 tools/ag2/r1-sum.py $(for p in ${PARTS:-desk phone}; do echo "$O/$p.json"; done)
