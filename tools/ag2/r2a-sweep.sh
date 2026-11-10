#!/usr/bin/env bash
# tools/ag2/r2a-sweep.sh <tag> <outdir> [runs...]  runs: ph 1440 1280 phx 1440x 1280x   (sequential, one browser at a time)
set -u
cd /opt/server-agent/workspace/sillytavern-ag2
export PATH=/opt/server-agent/home/.local/bin:$PATH
TAG=$1; O=$2; shift 2; mkdir -p "$O"
for r in "$@"; do
  case $r in
    ph)    a="--phone" ;;
    1440)  a="--w 1440 --h 900" ;;
    1280)  a="--w 1280 --h 800" ;;
    phx)   a="--phone --expand" ;;
    1440x) a="--w 1440 --h 900 --expand" ;;
    1280x) a="--w 1280 --h 800 --expand" ;;
  esac
  while [ "$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)" -ge 2 ]; do sleep 10; done
  timeout 560 nice -n 5 node tools/ag2/run.mjs tools/ag2/r2a.mjs --phase R2a --part sweep --tag "$TAG" $a ${EXTRA:-} >"$O/$TAG-$r.json" 2>"$O/$TAG-$r.err"; echo "$r exit $?" >>"$O/$TAG.log"
  sleep 15
done
echo ALLDONE >>"$O/$TAG.log"
