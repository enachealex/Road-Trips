# Setup

How Roadbook is wired up, and how to change it. The server side is also recorded in the
homelab notes (`/srv/apps/README.md` on the server, §4 "Roadbook").

```
Browser ── https://roadtrip.thejumpvault.com ──────► GitHub Pages (the website, built by Actions)
   │
   └──── https://roadtrip-api.thejumpvault.com ───► Cloudflare tunnel "roadbook" ──► Kong 127.0.0.1:8000
                                                     (only Roadbook's functions        (self-hosted Supabase
                                                      and /realtime/v1/ pass)            on the homelab server)
```

## 1. Database (done 2026-10-14)

Roadbook's tables live in their own `roadbook` schema in the Supabase `postgres` database, which
the public API roles cannot see. The seven functions at the bottom of
[supabase/schema.sql](../supabase/schema.sql) are the only way in.

To apply schema changes (the file is safe to run again), from this folder in Git Bash:

```bash
scp -i ~/.ssh/id_ed25519 supabase/schema.sql huckleberry@100.112.51.64:/tmp/roadbook-schema.sql
```

```bash
ssh -i ~/.ssh/id_ed25519 huckleberry@100.112.51.64 "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < /tmp/roadbook-schema.sql"
```

The schema ends with `notify pgrst, 'reload schema'`. Without it, the API answers new
functions with `PGRST202` until Supabase restarts.

## 2. Public API address (done 2026-10-14)

Supabase on the server has no general public access. Roadbook has its own Cloudflare tunnel,
`roadbook`, run by pm2 as `roadbook-tunnel`, with this config in
`~/.cloudflared/roadbook.yml`:

```yaml
ingress:
  - hostname: roadtrip-api.thejumpvault.com
    path: ^/rest/v1/rpc/(create_trip|get_trip|update_trip|delete_trip|upsert_event|delete_event|restore_event)$
    service: http://127.0.0.1:8000
  - hostname: roadtrip-api.thejumpvault.com
    path: ^/realtime/v1/
    service: http://127.0.0.1:8000
  - service: http_status:404
```

The public key is built into the website, and through the full Supabase API that key can also
reach other apps' tables. That's why the tunnel passes only these paths. **When a later stage
adds a database function, add its name to this regex too**, then `pm2 restart roadbook-tunnel`.

## 3. GitHub

- **Pages:** source "GitHub Actions", custom domain `roadtrip.thejumpvault.com` (Cloudflare DNS
  points the subdomain at GitHub Pages).
- **Actions variables** (Settings → Secrets and variables → Actions → Variables):
  - `SUPABASE_URL` = `https://roadtrip-api.thejumpvault.com`
  - `SUPABASE_PUBLISHABLE_KEY` = the `ANON_KEY` from `/srv/apps/supabase/.env` on the server.
    To set it without the key appearing on screen, run this from Git Bash:

    ```bash
    ssh -i ~/.ssh/id_ed25519 huckleberry@100.112.51.64 "grep -E '^ANON_KEY=' /srv/apps/supabase/.env | cut -d= -f2-" | tr -d '"\r\n' | gh variable set SUPABASE_PUBLISHABLE_KEY --repo enachealex/Road-Trips
    ```

  Never use `SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`. Without these variables the site still
  deploys, but in demo mode.
- Every push to `main` runs [deploy.yml](../.github/workflows/deploy.yml): typecheck, lint,
  tests, build, publish. Run it by hand from the Actions tab after changing a variable.

If GitHub can't issue its HTTPS certificate while the Cloudflare record is proxied (orange
cloud), that's fine: Cloudflare serves HTTPS to visitors. Keep Cloudflare's SSL/TLS mode on
**Full** (not Full (strict), which rejects GitHub's certificate for a custom domain).

## Local development

```bash
cp .env.example .env.local   # fill in the two values above
npx expo start --clear       # --clear picks up changed values
```

Without `.env.local` the app runs in demo mode with trips kept in the browser.
