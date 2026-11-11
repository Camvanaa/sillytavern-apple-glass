#!/usr/bin/env bash
# tools/ag2/r2b-all.sh <tag> <outdir> — R2b checks, ONE browser at a time.
#   r: insp1440 inspph popups1440 popupsph toastph  (published theme unless EXTRA=--mem)
set -u
cd /opt/server-agent/workspace/sillytavern-ag2
export PATH=/opt/server-agent/home/.local/bin:$PATH
TAG=$1; O=$2; shift 2; mkdir -p "$O"
run() { local name=$1; shift; local part=$1; shift; timeout 300 nice -n 5 node tools/ag2/run.mjs tools/ag2/r2b.mjs --phase R2b --part "$part" --tag "$TAG" "$@" ${EXTRA:-} >"$O/$TAG-$name.json" 2>"$O/$TAG-$name.err"; echo "$name exit $?"; }
for r in "${@:-insp1440 inspph popups1440 popupsph toastph}"; do
  while [ "$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)" -ge 2 ]; do sleep 10; done
  case $r in
    insp1440)   run insp-1440  insp   --w 1440 --h 900 ;;
    inspph)     run insp-ph    insp   --phone ;;
    popups1440) run popups-1440 popups --w 1440 --h 900 ;;
    popupsph)   run popups-ph   popups --phone ;;
    toastph)    run toast-ph    toast   --phone ;;
    toast1440)  run toast-1440  toast   --w 1440 --h 900 ;;
    *) echo "skip $r" ;;
  esac
  sleep 15
done
echo ALLDONE >>"$O/$TAG.log"
