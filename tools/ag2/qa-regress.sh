#!/usr/bin/env bash
# One browser at a time; keep legacy facts as well as process exit status for review.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
OUT=${1:-/tmp/opencode/qa-fixes/regression}
mkdir -p "$OUT"
failed=0
run() {
    local name=$1 suite=$2; shift 2
    while [ "$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)" -ge 2 ]; do sleep 10; done
    timeout 600 nice -n 5 node tools/ag2/run.mjs "tools/ag2/$suite.mjs" --phase QAFixes "$@" >"$OUT/$name.json" 2>"$OUT/$name.err"
    local rc=$?
    echo "$name exit $rc" | tee -a "$OUT/exits.log"
    [ "$rc" = 0 ] || failed=1
    if grep -q FIXTURE-CHANGED "$OUT/$name.err"; then exit 1; fi
}
run r1-desktop r1-flash --part desk
run r1-phone r1-flash --part phone --phone
run r3a-c-desktop r3a-c
run r3a-c-phone r3a-c --phone
run r3a-func-desktop r3a --part func
run r3a-func-phone r3a --part func --phone
run p4-keys p4 --part keys
run p4-esc p4 --part esc
run p5-flow p5 --part flow --phone
run p5-pages p5 --part pages --phone
run p5-edge p5 --part edge --phone
run r2a-desktop r2a --part sweep --ios --tag qa
run r2a-phone r2a --part sweep --ios --tag qa --phone
python3 tools/ag2/qa-verdict.py "$OUT" || failed=1
exit "$failed"
