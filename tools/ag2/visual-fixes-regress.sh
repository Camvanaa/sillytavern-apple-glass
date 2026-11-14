#!/usr/bin/env bash
# One browser at a time. Preserve raw JSON even where a legacy suite exits zero on failure.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
ROOT=/opt/server-agent/workspace/st-testdata/redesign/visual-fixes
export AG2_EVIDENCE_ROOT="$ROOT/controls"
OUT="$ROOT/${1:-regression}"
PHASE="visual-fixes/${1:-regression}-shots"
mkdir -p "$OUT"
failed=0
run() {
 local name=$1 suite=$2; shift 2
 timeout 600 node tools/ag2/run.mjs "tools/ag2/$suite.mjs" --phase "$PHASE" --shots /opt/server-agent/workspace/st-testdata/redesign "$@" >"$OUT/$name.json" 2>"$OUT/$name.err"
 local rc=$?
 echo "$name exit $rc" | tee -a "$OUT/exits.log"
 [ "$rc" = 0 ] || failed=1
 if grep -q FIXTURE-CHANGED "$OUT/$name.err"; then exit 1; fi
}
if [ "${1:-regression}" = full ]; then
 for p in shots func esc look themes; do run "p2a-$p" p2a --part "$p"; done
 run p2a-shots-1280 p2a --part shots --w 1280 --h 900
 for p in gen model offline plus styles themes jump; do run "p1b-$p" p1b --part "$p"; done
 for p in func themes classic; do run "p1a-$p" p1a --part "$p"; done
 for p in desk styles reduced phone cold compat; do run "base-$p" baseline --part "$p" --ag2; done
else
 run r3a-c-desktop r3a-c
 run r3a-c-phone r3a-c --phone
 run r3a-func-desktop r3a --part func
 run r3a-func-phone r3a --part func --phone
 run r1-desktop r1-flash --part desk --frames --tag VF01
 run r1-phone r1-flash --part phone --phone --frames --tag VF01
 run qa-desktop qa-fixes --tag VF01
 run qa-phone qa-fixes --phone --tag VF01
 run r2a-desktop r2a --part sweep --ios --tag VF01
 run r2a-phone r2a --part sweep --ios --tag VF01 --phone
 run controls-desktop motion-fixes-controls --part normal --tag VF01
 run controls-phone motion-fixes-controls --part normal --tag VF01 --phone
 run embedded-desktop embedded-scheme --part fixed
 run embedded-phone embedded-scheme --part fixed --phone
 run p5-pages p5 --part pages --phone
fi
python3 tools/ag2/qa-verdict.py "$OUT" || failed=1
exit "$failed"
