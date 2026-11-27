#!/bin/bash
# Real-browser end-to-end tests. Needs: npm install, pip install playwright pillow numpy, playwright install chromium.
#   npm run e2e
set -e
cd "$(dirname "$0")/.."
export E2E_OUT="${E2E_OUT:-/tmp/eduq-e2e}"; mkdir -p "$E2E_OUT"
npx vite build > "$E2E_OUT/build.log" 2>&1 || { tail -20 "$E2E_OUT/build.log"; exit 1; }
npx vite-node e2e/prepare.mjs
npx vite preview --port 4173 --host 127.0.0.1 > "$E2E_OUT/preview.log" 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:4173/ && break; sleep 0.5; done
RC=0
for t in scan_flow booklet_flow; do echo "== $t"; python3 e2e/$t.py || RC=1; done
exit $RC
