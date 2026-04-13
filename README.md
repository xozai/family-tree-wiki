# Family Tree Wiki

A self-hosted private genealogy web app for families. Manage a searchable member directory, upload photos, import/export GEDCOM files, and track relationships — all on your own server.

![App screenshot](docs/screenshot.png)

---

## Features

- **Member directory** — searchable profiles with biography, dates, places, occupation, tags, and privacy controls
- **Relationships** — parent/child/spouse/sibling links with a visual family tree
- **Photo uploads** — attach photos to members; automatic 300×300 thumbnails generated server-side
- **GEDCOM import** — upload a `.ged` file (GEDCOM 5.5/5.5.1), preview before committing, structured error/warning reporting
- **GEDCOM export** — download the full tree as a standards-compliant `.ged` file
- **Profile revision history** — every edit is versioned with a content snapshot
- **Role-based access** — ADMIN / EDITOR / VIEWER with route-level enforcement
- **Invite-only registration** — new users require a time-limited invite token; accounts need admin approval
- **Password reset** — email-based reset flow with 1-hour expiring tokens
- **Email notifications** — admin alerts on registration, approval/rejection emails to users, invite emails to recipients
- **JWT authentication** — 15-minute access tokens with 7-day rotating refresh tokens; all sessions revoked on password change
- **Mobile-responsive** — works on phones and tablets

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Zustand |
| Backend | Node.js, Express, Prisma ORM, TypeScript |
| Database | PostgreSQL 15 |
| File processing | sharp (thumbnail generation), multer (uploads) |
| Infrastructure | Docker Compose, Nginx (reverse proxy), Let's Encrypt (TLS) |
| CI/CD | GitHub Actions (SSH deploy on push to `main`) |

---

## Quick Start (Local Development)

### Prerequisites

- Docker and Docker Compose
- Node.js 20+

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/family-tree-wiki.git
cd family-tree-wiki

# 2. Copy the dev environment file
cp .env.example backend/.env
# Edit backend/.env if needed — defaults work for local dev

# 3. Start PostgreSQL and the backend (with hot reload)
docker compose up -d

# 4. Install frontend dependencies and start the dev server
cd frontend && npm install && npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001/api`
- API health: `http://localhost:3001/api/health`

### Seed the first admin account

```bash
docker compose exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('your-password-here', 12);
  await prisma.user.create({
    data: {
      id: uuidv4(),
      username: 'admin',
      email: 'admin@familytree.local',
      passwordHash: hash,
      fullName: 'Site Administrator',
      relationshipToFamily: 'Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      updatedAt: new Date(),
    }
  });
  console.log('Admin created');
  await prisma.\$disconnect();
}
main();
"
```

---

## Production Deployment

The recommended host is a **Hetzner CX22** (~$6/mo, 2 vCPU / 4 GB RAM). The full step-by-step guide is in the deployment instructions; the summary is below.

### 1. Provision the server

Create a Hetzner CX22 running Ubuntu 24.04. Open ports 22, 80, 443. Point your domain's DNS A record at the server IP.

### 2. Install Docker and clone the repo

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/YOUR_USERNAME/family-tree-wiki.git /root/family-tree-wiki
cd /root/family-tree-wiki
```

### 3. Create the production environment file

```bash
nano .env.production
# Fill in all required variables — see Environment Variables section below
```

### 4. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 5. Run database migrations

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

### 6. Seed the admin account

Use the same `node -e` seed command from the local dev section, substituting `docker compose -f docker-compose.prod.yml exec backend`.

### 7. Enable HTTPS

```bash
# Issue the certificate (domain must already resolve to this server)
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d yourdomain.com \
  --email you@email.com \
  --agree-tos --no-eff-email

# Edit nginx/nginx.conf: redirect HTTP to HTTPS, uncomment the HTTPS server block
# Then reload:
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

Certbot auto-renews every 12 hours.

### 8. Enable auto-deploy (GitHub Actions)

Add three secrets to your GitHub repo under **Settings → Secrets → Actions**:

| Secret | Value |
|---|---|
| `SERVER_HOST` | Server IP address |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | Contents of your deploy private key |

Every push to `main` will SSH into the server, pull, rebuild, and health-check automatically.

---

## Environment Variables

### Backend (`.env` / `.env.production`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string — auto-set in Docker Compose from `POSTGRES_*` vars |
| `POSTGRES_USER` | Yes | Database username |
| `POSTGRES_PASSWORD` | Yes | Database password — use a long random value in production |
| `POSTGRES_DB` | Yes | Database name |
| `JWT_ACCESS_SECRET` | Yes | Secret for signing access tokens — must be ≥32 characters |
| `JWT_REFRESH_SECRET` | Yes | Secret for signing refresh tokens — must be ≥32 characters, different from access secret |
| `NODE_ENV` | Yes | `development` or `production` |
| `APP_URL` | Yes (prod) | Full public URL e.g. `https://yourdomain.com` — used in reset/invite email links |
| `CORS_ORIGIN` | Yes (prod) | Allowed CORS origin e.g. `https://yourdomain.com` |
| `PORT` | No | Backend port (default: `3001`) |
| `UPLOADS_DIR` | No | Upload directory path (default: `./uploads`) |
| `SMTP_HOST` | No | SMTP server hostname — if unset, emails are logged to console |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password — use an App Password for Gmail |
| `SMTP_FROM` | No | From address e.g. `"Family Tree Wiki <noreply@yourdomain.com>"` |

### Frontend (build-time)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | API base URL (default: `http://localhost:3001/api`) |

### Nginx

| Variable | Required | Description |
|---|---|---|
| `NGINX_PORT` | No | Host port for HTTP (default: `80`) |

---

## Roles

| Role | Permissions |
|---|---|
| **ADMIN** | Full access — manage users, approve/reject registrations, create invites, edit all members, view site stats |
| **EDITOR** | Create and edit family members, upload and delete photos, import GEDCOM files |
| **VIEWER** | Read-only access to public member profiles, family tree, and photo gallery |

New registrations are assigned VIEWER role and require admin approval before they can log in.

---

## GEDCOM Support

**Import** — upload any GEDCOM 5.5 or 5.5.1 file (`.ged`). The import runs in two steps:
1. **Preview** — parses the file and shows individual/family counts, date range, and sample names without writing to the database
2. **Confirm** — saves all individuals and relationships; duplicates (matched by name + birth year) are skipped and reported as warnings; save failures are reported as structured errors with GEDCOM IDs

**Export** — downloads the full tree as a valid GEDCOM 5.5.1 file with `INDI` and `FAM` records. Admins see all members; non-admins see only public members.

---

## Backup and Restore

### Backup the database

```bash
docker exec family-tree-postgres pg_dump -U familytree familytree \
  | gzip > backup_$(date +%Y%m%d).sql.gz
```

Set up a daily cron job on the server:

```cron
0 2 * * * docker exec family-tree-postgres pg_dump -U familytree familytree | gzip > /root/backups/db_$(date +\%Y\%m\%d).sql.gz
0 3 * * * find /root/backups -name "*.sql.gz" -mtime +30 -delete
```

### Restore from a backup

```bash
# WARNING: overwrites all current data
gunzip -c backup_20260411.sql.gz \
  | docker exec -i family-tree-postgres psql -U familytree familytree
```

### Backup uploaded photos

```bash
docker run --rm \
  -v family-tree-wiki_uploads_data:/data:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

---

## Project Structure

```
family-tree-wiki/
├── backend/
│   ├── prisma/               Schema and migrations
│   └── src/
│       ├── controllers/      Route handlers
│       ├── lib/              Prisma client, JWT helpers, email
│       ├── middleware/       Auth, error handler
│       ├── routes/           Express routers
│       └── services/         GEDCOM parser
├── frontend/
│   └── src/
│       ├── components/       Shared UI components
│       ├── pages/            Route-level page components
│       ├── stores/           Zustand auth store
│       └── lib/              Axios instance
├── nginx/
│   ├── nginx.conf            Production reverse proxy config
│   └── frontend.conf         SPA fallback config (inside frontend container)
├── scripts/                  DB backup/restore helpers
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml        Local development
├── docker-compose.prod.yml   Production stack
└── .env.example
```

---

## License

GNU Affero General Public License v3.0 — see [LICENSE](LICENSE).

Free to self-host and modify. If you run a modified version as a network service, you must make your source changes available under the same license.
