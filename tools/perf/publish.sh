#!/usr/bin/env bash
# Publish measurement scripts + CSS/extension candidates to the local :8799 server.
set -e
cd /opt/server-agent/workspace/sillytavern
cp tools/perf-lib.js tools/scan.js tools/btnscan.js tools/perf/*.js /tmp/opencode/
