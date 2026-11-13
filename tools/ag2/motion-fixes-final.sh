#!/usr/bin/env bash
# Final, immutable-source serial pass. Keep the earlier integration failures separately.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
ROOT=/opt/server-agent/workspace/st-testdata/redesign/motion-fixes
OUT="$ROOT/final"
mkdir -p "$OUT"
failed=0
run() {
    local name=$1 suite=$2; shift 2
    timeout 600 node tools/ag2/run.mjs "tools/ag2/$suite.mjs" --phase motion-fixes --shots /opt/server-agent/workspace/st-testdata/redesign "$@" >"$OUT/$name.json" 2>"$OUT/$name.err"
    local rc=$?
    echo "$name exit $rc" | tee -a "$OUT/exits.log"
    [ "$rc" = 0 ] || failed=1
    if grep -q FIXTURE-CHANGED "$OUT/$name.err"; then exit 1; fi
}
for mode in normal st os; do
    run "intent-desktop-$mode" motion-fixes --part "$mode"
    run "intent-phone-$mode" motion-fixes --part "$mode" --phone
    run "controls-desktop-$mode" motion-fixes-controls --part "$mode" --tag final
    run "controls-phone-$mode" motion-fixes-controls --part "$mode" --phone --tag final
    run "life-desktop-$mode" motion-fixes-life --part "$mode"
    run "life-phone-$mode" motion-fixes-life --part "$mode" --phone
done
run life-media-only motion-fixes-life --part media-only --phone
run fallback motion-fixes-fallback --part fallback
TMPDIR=/tmp/opencode timeout 600 xvfb-run -a -e /tmp/opencode/motion-xvfb.log -s '-screen 0 1600x1000x24' node tools/ag2/run.mjs tools/ag2/motion-fixes-fallback.mjs --headed --classic-scrollbars --phase motion-fixes --shots /opt/server-agent/workspace/st-testdata/redesign >"$OUT/headed.json" 2>"$OUT/headed.err"
rc=$?; echo "headed exit $rc" | tee -a "$OUT/exits.log"; [ "$rc" = 0 ] || failed=1
run qa-desktop qa-fixes --tag final
run qa-phone qa-fixes --phone --tag final
run r1-desktop r1-flash --part desk --frames --tag final
run r1-phone r1-flash --part phone --phone --frames --tag final
run r3a-c-desktop r3a-c
run r3a-c-phone r3a-c --phone
run r3a-func-desktop r3a --part func
run r3a-func-phone r3a --part func --phone
run p4-keys p4 --part keys
run p4-esc p4 --part esc
run p5-pages p5 --part pages --phone
run p5-edge p5 --part edge --phone
run r2a-desktop r2a --part sweep --ios --tag final
run r2a-phone r2a --part sweep --ios --tag final --phone
python3 tools/ag2/qa-verdict.py "$OUT" || failed=1
exit "$failed"
