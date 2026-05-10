#!/usr/bin/env bash
set -euo pipefail

# apply_migrations.sh
# Usage: DATABASE_URL="postgres://..." ./apply_migrations.sh

if [ -z "${DATABASE_URL-}" ]; then
  echo "Error: DATABASE_URL environment variable is required."
  exit 2
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Applying 20260507000001_base_schema.sql..."
psql "$DATABASE_URL" -f "$DIR/supabase/migrations/20260507000001_base_schema.sql"

echo "Applying 20260507000002_extras_rls_indexes.sql..."
psql "$DATABASE_URL" -f "$DIR/supabase/migrations/20260507000002_extras_rls_indexes.sql"

echo "Applying 20260507000003_app_features.sql..."
psql "$DATABASE_URL" -f "$DIR/supabase/migrations/20260507000003_app_features.sql"

echo "Migrations applied successfully."
