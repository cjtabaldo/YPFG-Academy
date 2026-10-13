#!/usr/bin/env bash
STACK_DIR=${STACK_DIR:?}
for p in auth postgrest proxy mail fn-admin-users fn-streak-saver fn-unsubscribe fn-mail; do [ -f "$STACK_DIR/$p.pid" ] && kill "$(cat "$STACK_DIR/$p.pid")" 2>/dev/null; rm -f "$STACK_DIR/$p.pid"; done
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D ${PGDATA:-/var/tmp/ypfg-pgdata} stop -m fast" >/dev/null 2>&1 || true
[ "${1:-}" = "--wipe" ] && rm -rf "${PGDATA:-/var/tmp/ypfg-pgdata}"
echo "Local stack down."
