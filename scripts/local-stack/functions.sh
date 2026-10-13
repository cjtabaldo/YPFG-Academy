#!/usr/bin/env bash
# Runs the three Edge Functions locally with Deno (ports 8001-8003).
set -euo pipefail
STACK_DIR=${STACK_DIR:?}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
source <(node --input-type=module -e "const h=await import('$ROOT/tests/backend/helpers.mjs'); console.log('export ANON='+h.ANON_KEY+' SERVICE='+h.SERVICE_KEY)")
export SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=$ANON SUPABASE_SERVICE_ROLE_KEY=$SERVICE
export CRON_SECRET=local-cron-secret APP_URL=http://localhost:4173 RESEND_API_KEY=test-key RESEND_API_URL=http://127.0.0.1:8009/emails
i=1
for f in admin-users streak-saver unsubscribe; do
  PORT=800$i nohup "$STACK_DIR/deno" run --allow-net --allow-env --allow-read "$ROOT/scripts/local-stack/deno-runner.ts" "file://$ROOT/supabase/functions/$f/index.ts" > "$STACK_DIR/fn-$f.log" 2>&1 &
  echo $! > "$STACK_DIR/fn-$f.pid"; i=$((i+1))
done
# Mock email API that records what would have been sent.
nohup node -e "require('http').createServer((q,r)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{require('fs').appendFileSync('$STACK_DIR/sent-emails.jsonl',b+'\n');r.writeHead(200,{'content-type':'application/json'});r.end('{\"id\":\"x\"}')})}).listen(8009)" > /dev/null 2>&1 &
echo $! > "$STACK_DIR/fn-mail.pid"
sleep 4; echo "functions up"
