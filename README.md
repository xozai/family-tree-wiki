# Family Tree Wiki

A private family history wiki with a searchable member directory, relationship graph, GEDCOM import, and photo uploads.

**Stack:** React + Vite (frontend) · Express + Prisma + PostgreSQL (backend) · Nginx (reverse proxy) · Docker Compose

---

## Development

### Prerequisites

- Docker & Docker Compose
- Node.js 20+

### Running locally

```bash
# 1. Copy and configure environment
cp .env.example backend/.env

# 2. Start postgres + backend (hot-reload)
docker compose -f docker-compose.dev.yml up -d

# 3. Start the frontend on the host
cd frontend && npm install && npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API calls to `http://localhost:3001`.

Default seed credentials (created automatically on first run):

| Email | Password |
|---|---|
| `admin@familytree.local` | `admin123` |

---

## Deployment

### Prerequisites

- Docker & Docker Compose on the target server
- Ports 80 (or `NGINX_PORT`) open in firewall

### First-time setup

```bash
# 1. Clone the repo on the server
git clone <repo-url> family-tree-wiki
cd family-tree-wiki

# 2. Create the production environment file
cp .env.production.example .env.production
# Edit .env.production — set strong JWT secrets, DB password, and CORS_ORIGIN

# 3. Build and start all services
docker compose -f docker-compose.prod.yml up -d --build
```

On first start the backend container will:
1. Wait for Postgres to be healthy
2. Run `prisma migrate deploy` to apply all schema migrations
3. Seed an admin user if the database is empty
4. Start the Express server

The app will be available at `http://<server-ip>` (or the domain pointed at it).

### Enabling HTTPS (Let's Encrypt)

After the app is running on HTTP and your domain is pointed at the server:

```bash
# 1. Issue the certificate (one-time)
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d your-domain.com \
  --email you@example.com \
  --agree-tos --no-eff-email

# 2. Edit nginx/nginx.conf on the server:
#    a. Replace `your-domain.com` in the HTTPS server block with your actual domain
#    b. Uncomment the entire HTTPS server block
#    c. In the HTTP server block, replace all proxy location blocks with:
#         location / { return 301 https://$host$request_uri; }

# 3. Reload nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

# 4. Update CORS_ORIGIN in .env.production to https://your-domain.com
#    then restart the backend:
docker compose -f docker-compose.prod.yml up -d backend
```

Certificates auto-renew every 12 hours via the certbot container.

### Auto-deploy on git push (GitHub Actions)

Add these secrets to your GitHub repo (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `SERVER_HOST` | Your server's IP address |
| `SERVER_USER` | `root` (or your deploy user) |
| `SERVER_SSH_KEY` | Contents of `~/.ssh/id_ed25519` (private key) |

Every push to `main` will SSH into the server, pull, rebuild, and run a health check automatically.

### Updating to a new version

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations are applied automatically on startup.

### Stopping and removing containers

```bash
# Stop (data volumes are preserved)
docker compose -f docker-compose.prod.yml down

# Stop and remove all data (irreversible)
docker compose -f docker-compose.prod.yml down -v
```

---

## Backup and restore

### Backup the database

```bash
# Creates backups/familytree-YYYY-MM-DD_HHMMSS.sql.gz
# Automatically deletes backups older than 30 days
./scripts/backup-db.sh
```

Set a cron job for automatic daily backups:

```cron
0 3 * * * /path/to/family-tree-wiki/scripts/backup-db.sh >> /var/log/familytree-backup.log 2>&1
```

### Restore from a backup

```bash
# WARNING: drops and recreates the database — all current data is lost
./scripts/restore-db.sh backups/familytree-2024-01-15_030000.sql.gz
```

### Backup uploaded photos

Uploaded files are stored in the `uploads_data` Docker volume. To back it up:

```bash
docker run --rm \
  -v family-tree-wiki_uploads_data:/data:ro \
  -v "$(pwd)/backups":/backup \
  alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

---

## Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Backend only
docker compose -f docker-compose.prod.yml logs -f backend

# Nginx access/error logs
docker compose -f docker-compose.prod.yml logs -f nginx
```

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `POSTGRES_USER` | yes | Database username |
| `POSTGRES_PASSWORD` | yes | Database password |
| `POSTGRES_DB` | yes | Database name |
| `JWT_ACCESS_SECRET` | yes | Access token secret (≥ 32 chars) |
| `JWT_REFRESH_SECRET` | yes | Refresh token secret (≥ 32 chars) |
| `NODE_ENV` | yes | `development` or `production` |
| `PORT` | no | Backend port (default: `3001`) |
| `UPLOADS_DIR` | no | Upload directory (default: `./uploads`) |
| `CORS_ORIGIN` | no | Allowed CORS origin |
| `VITE_API_URL` | no | API base URL used at frontend build time |
| `NGINX_PORT` | no | Host port for nginx (default: `80`) |

See `.env.example` (development) and `.env.production.example` (production) for annotated templates.

---

## Project structure

```
family-tree-wiki/
├── backend/              Express + Prisma API
│   ├── prisma/           Schema and migrations
│   ├── src/              TypeScript source
│   └── uploads/          User-uploaded files (dev only)
├── frontend/             React + Vite SPA
│   └── src/
├── nginx/
│   ├── nginx.conf        Reverse proxy config (prod)
│   └── frontend.conf     SPA nginx config (inside frontend container)
├── scripts/
│   ├── migrate-and-start.sh   Container startup: wait → migrate → seed → run
│   ├── backup-db.sh           Gzip pg_dump with 30-day retention
│   └── restore-db.sh          Drop + restore from a .sql.gz backup
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.prod.yml
├── docker-compose.dev.yml
├── .env.example               Development template
└── .env.production.example    Production template
```
