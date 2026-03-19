#!/bin/sh
# Startup script for the backend Docker container.
# Waits for Postgres, runs migrations, seeds if empty, then starts the server.
set -e

# ── Parse connection info from DATABASE_URL ───────────────────────────────────
# Expected format: postgresql://user:pass@host:port/dbname
DB_HOSTPORT=$(echo "$DATABASE_URL" | cut -d@ -f2 | cut -d/ -f1)
DB_HOST=$(echo "$DB_HOSTPORT" | cut -d: -f1)
DB_PORT=$(echo "$DB_HOSTPORT" | cut -d: -f2)
DB_PORT="${DB_PORT:-5432}"
DB_USER=$(echo "$DATABASE_URL" | cut -d@ -f1 | sed 's|.*//||' | cut -d: -f1)
DB_NAME=$(echo "$DATABASE_URL" | cut -d/ -f4 | cut -d? -f1)

# ── Wait for PostgreSQL to be ready ──────────────────────────────────────────
echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
RETRIES=30
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -q; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -eq 0 ]; then
    echo "ERROR: PostgreSQL did not become ready in time. Exiting."
    exit 1
  fi
  echo "  Not ready yet (${RETRIES} retries left)..."
  sleep 2
done
echo "PostgreSQL is ready."

# ── Run database migrations ───────────────────────────────────────────────────
echo "Running Prisma migrations..."
node ./node_modules/prisma/build/index.js migrate deploy
echo "Migrations applied."

# ── Seed initial data if User table is empty ─────────────────────────────────
USER_COUNT=$(psql "$DATABASE_URL" -t -c 'SELECT COUNT(*) FROM "User";' 2>/dev/null | tr -d ' \n' || echo "0")
if [ "$USER_COUNT" = "0" ]; then
  echo "Empty database detected — seeding initial admin user..."
  cat > /tmp/_seed.js << 'SEEDEOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  const hash = await bcrypt.hash('Admin1234567!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@familytree.local' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@familytree.local',
      passwordHash: hash,
      fullName: 'Site Administrator',
      relationshipToFamily: 'Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  await prisma.$disconnect();
  console.log('Seed complete. Login: admin@familytree.local / Admin1234567!');
}

seed().catch(function(e) { console.error(e); process.exit(1); });
SEEDEOF
  node /tmp/_seed.js
  rm -f /tmp/_seed.js
else
  echo "Database has ${USER_COUNT} user(s) — skipping seed."
fi

# ── Start the Express server ──────────────────────────────────────────────────
echo "Starting server..."
exec node dist/index.js
