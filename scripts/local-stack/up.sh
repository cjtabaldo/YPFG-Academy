#!/usr/bin/env bash
# Local stand-in for Supabase used for automated testing: Postgres 16 + the
# Supabase Auth server (GoTrue) + PostgREST + a small proxy that exposes them
# at http://localhost:54321/auth/v1 and /rest/v1 like Supabase does.
# Usage: STACK_DIR=/path/with/binaries scripts/local-stack/up.sh
set -euo pipefail
STACK_DIR=${STACK_DIR:?set STACK_DIR to the folder holding postgrest and auth/}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
PGDATA=${PGDATA:-/var/tmp/ypfg-pgdata}
PGPORT=54322
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
export PGHOST=127.0.0.1 PGPORT

if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA" && chown postgres "$PGDATA"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -U postgres --auth=trust >/dev/null"
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l $PGDATA/../ypfg-pg.log start -w" >/dev/null

psql -U postgres -v ON_ERROR_STOP=1 -q <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role authenticator login noinherit password 'postgres';
    grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin login createrole noinherit password 'postgres';
    create role supabase_admin login superuser password 'postgres';
    create role dashboard_user nologin;
  end if;
end \$\$;
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on schema public to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path = auth;
SQL

STACK_DIR=$STACK_DIR nohup node "$HERE/mail.mjs" > "$STACK_DIR/mail.log" 2>&1 &
echo $! > "$STACK_DIR/mail.pid"

cd "$STACK_DIR/auth"
API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
GOTRUE_DB_DRIVER=postgres GOTRUE_DB_NAMESPACE=auth \
DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PGPORT/postgres?sslmode=disable" \
GOTRUE_SITE_URL=http://localhost:5173 GOTRUE_URI_ALLOW_LIST="http://localhost:5173/**,http://localhost:4173/**" \
GOTRUE_DISABLE_SIGNUP=true GOTRUE_JWT_SECRET=$JWT_SECRET GOTRUE_JWT_EXP=3600 \
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_JWT_AUD=authenticated \
GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true \
GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=admin@example.com GOTRUE_SMTP_SENDER_NAME="YPFG Academy" \
GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
nohup ./auth > "$STACK_DIR/auth.log" 2>&1 &
echo $! > "$STACK_DIR/auth.pid"

for i in $(seq 1 40); do
  curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.5
done

cd "$ROOT"
for f in supabase/migrations/*.sql; do psql -U postgres -v ON_ERROR_STOP=1 -q -f "$f"; done
[ -f supabase/seed.sql ] && psql -U postgres -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:$PGPORT/postgres" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET=$JWT_SECRET \
PGRST_SERVER_PORT=3000 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_CHANNEL_ENABLED=true \
nohup "$STACK_DIR/postgrest" > "$STACK_DIR/postgrest.log" 2>&1 &
echo $! > "$STACK_DIR/postgrest.pid"

nohup node "$HERE/proxy.mjs" > "$STACK_DIR/proxy.log" 2>&1 &
echo $! > "$STACK_DIR/proxy.pid"
sleep 1
echo "Local stack up: http://localhost:54321 (db port $PGPORT)"
