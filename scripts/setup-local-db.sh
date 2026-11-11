#!/usr/bin/env bash
# Cria banco local de desenvolvimento com dois papéis:
#  - atamarket_owner: proprietário do esquema (migrações)
#  - atamarket_app:   usado pela aplicação, SEM BYPASSRLS (RLS efetivo)
set -euo pipefail
OWNER_PW="${OWNER_PW:-owner_dev_pw}"
APP_PW="${APP_PW:-app_dev_pw}"
DB="${DB_NAME:-atamarket}"
psql_su() { if [ "$(id -u)" = "0" ]; then su postgres -c "psql -v ON_ERROR_STOP=1 $*"; else sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"; fi; }
psql_su -c "\"DO \\\$\\\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='atamarket_owner') THEN CREATE ROLE atamarket_owner LOGIN PASSWORD '$OWNER_PW'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_runtime') THEN CREATE ROLE app_runtime NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='atamarket_app') THEN CREATE ROLE atamarket_app LOGIN PASSWORD '$APP_PW' IN ROLE app_runtime; END IF;
END \\\$\\\$;\""
psql_su -tc "\"SELECT 1 FROM pg_database WHERE datname='$DB'\"" | grep -q 1 || psql_su -c "\"CREATE DATABASE $DB OWNER atamarket_owner\""
psql_su -d "$DB" -c "\"CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm; GRANT app_runtime TO atamarket_owner WITH ADMIN OPTION;\""
echo "DATABASE_ADMIN_URL=postgres://atamarket_owner:$OWNER_PW@localhost:5432/$DB"
echo "DATABASE_URL=postgres://atamarket_app:$APP_PW@localhost:5432/$DB"
