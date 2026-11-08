#!/usr/bin/env bash
# tools/ag2/bump-build.sh — refresh the AG2 shell cache-buster before a commit.
# Rewrites BUILD in shell/index.js, SHELL_BUILD in index.js and every `?v=<build>` import
# under shell/ to one new value (default: UTC timestamp yyyymmddHHMM).
set -euo pipefail
cd "$(dirname "$0")/../../extensions/SillyTavern-AppleGlassStyles"
NEW="${1:-$(date -u +%Y%m%d%H%M)}"
sed -i -E "s/\?v=[0-9A-Za-z]+'/?v=${NEW}'/g" shell/*.js
sed -i -E "s/^export const BUILD = '[^']*';/export const BUILD = '${NEW}';/" shell/index.js
sed -i -E "s/^const SHELL_BUILD = '[^']*';/const SHELL_BUILD = '${NEW}';/" index.js
echo "AG2 shell build ${NEW}"
grep -ho "?v=[0-9A-Za-z]*'" shell/*.js | sort | uniq -c
