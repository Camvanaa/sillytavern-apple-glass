#!/usr/bin/env bash
# Run seeded model-based UI exploration sequentially.
#   tools/ag2/batch-explore.sh OUT [cases] [steps] [seed] [desktop|phone|all]
# One browser at a time is deliberate: the QA host has two cores.
set -u
cd "$(dirname "$0")/../.."
export PATH=/opt/server-agent/home/.local/bin:$PATH
OUT=${1:-/tmp/opencode/ag2-batch}; CASES=${2:-8}; STEPS=${3:-120}; SEED=${4:-240513}; PROFILE=${5:-all}
mkdir -p "$OUT"
run_profile() {
  local name=$1 flags=$2
  for ((i=0; i<CASES; i++)); do
    local s=$((SEED + i * 7919 + ${3:-0}))
    while [ "$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)" -ge 2 ]; do sleep 10; done
    timeout 900 nice -n 5 node tools/ag2/run.mjs tools/ag2/batch-explore.mjs --phase BatchExplore --steps "$STEPS" --seed "$s" --out "$OUT" $flags \
      >"$OUT/${name}-${s}.result.json" 2>"$OUT/${name}-${s}.err"
    echo "$name $s exit $?"
    sleep 15
  done
}
case "$PROFILE" in
  desktop) run_profile desktop "" 0 ;;
  phone) run_profile phone "--phone" 1000003 ;;
  reduced) run_profile desktop-reduced "--reduced" 2000003 ;;
  all) run_profile desktop "" 0; run_profile phone "--phone" 1000003; run_profile desktop-reduced "--reduced" 2000003; run_profile phone-reduced "--phone --reduced" 3000007 ;;
  *) echo "profile must be desktop|phone|reduced|all" >&2; exit 2 ;;
esac
python3 tools/ag2/batch-summary.py "$OUT"
