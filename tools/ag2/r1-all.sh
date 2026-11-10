#!/usr/bin/env bash
# tools/ag2/r1-all.sh <outdir> [extra r1-flash flags] — desktop + phone probe in parallel.
#   r1-all.sh out/post                 default animation duration
#   r1-all.sh out/post-red --st-reduced
set -u
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
O=$1; shift; mkdir -p "$O"
(timeout 1200 node tools/ag2/run.mjs tools/ag2/r1-flash.mjs --phase R1 --part desk "$@" >"$O/desk.json" 2>"$O/desk.err"; echo "desk exit $?") &
(timeout 1200 node tools/ag2/run.mjs tools/ag2/r1-flash.mjs --phase R1 --part phone --phone "$@" >"$O/phone.json" 2>"$O/phone.err"; echo "phone exit $?") &
wait
python3 tools/ag2/r1-sum.py "$O/desk.json" "$O/phone.json"
