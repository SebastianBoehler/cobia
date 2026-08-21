# Hetzner production runbook

The Next.js application, including its Route Handlers, remains on Vercel. This
stack runs only PostgreSQL, the reference solver, and a narrow authenticated
Anvil replay service on one VM. `api.getcobia.com` is the replay-service boundary;
it is not a second deployment of the web application.

## Deployed boundary

- One x86-64 Ubuntu CX23. It is sufficient while replay concurrency remains one.
- Ports 22, 80, 443, and 15432 are public. Port 15432 accepts PostgreSQL with TLS
  and SCRAM authentication; the Vercel URL uses `sslmode=verify-full`.
- Anvil binds random loopback ports inside the replay container; none are exposed.
- PostgreSQL data remains on the VM. There is no legacy managed database to migrate.
- Solver Codex authentication and job state live in named Docker volumes.
- Vercel runs the complete Next.js application and every Route Handler. No
  Next.js image or process belongs in this Compose project.

## First deployment

Install Docker Engine with the official Docker repository, enable the firewall,
then clone this repository under `/opt/cobia`. Do not copy secrets into the Git
checkout.

```bash
cd /opt/cobia/deploy/hetzner
cp .env.example .env
chmod 600 .env
```

Fill `.env` with a strong PostgreSQL password, a dedicated replay bearer secret,
the solver key, RPC URLs, and its model-provider key. Keep Vercel-only application
secrets out of this file.

Point `api.getcobia.com` at the VM and allow ports 80 and 443 before starting
Caddy so it can obtain the certificate. PostgreSQL reuses that certificate for
host-name-verified Vercel connections. Start the services in dependency order:

```bash
docker compose build
docker compose up -d replay caddy
curl --retry 12 --retry-delay 5 --fail https://api.getcobia.com/healthz
docker compose up -d db cert-sync
docker compose run --rm migrate
docker compose run --rm --user root --entrypoint sh solver -c 'chown -R 1000:1000 /var/lib/cobia-solver; chown 1000:1000 /auth/codex; find /auth/codex -mindepth 1 -maxdepth 1 ! -name config.toml -exec chown -R 1000:1000 {} +'
docker compose up -d solver
docker compose ps
docker compose logs --tail=100 db replay solver caddy
```

Configure the Vercel project with `REPLAY_SERVICE_ORIGIN=https://api.getcobia.com`
and the matching `REPLAY_SERVICE_SECRET`. The service uses the pinned
`@foundry-rs/anvil` binary and accepts one replay at a time on the CX23.
Set `DATABASE_URL` to the VPS database using `api.getcobia.com:15432` and
`sslmode=verify-full`; never point Vercel at the Docker-internal `db` hostname.
The migration command holds a PostgreSQL advisory lock, so concurrent operators
cannot apply the schema twice. Vercel builds never run migrations.

## Local Compose rehearsal

The override keeps every service local: PostgreSQL binds only to
`127.0.0.1:5432`, Caddy listens on `127.0.0.1:8080`, and the solver calls the
Next.js development server through `host.docker.internal`. Create an ignored
local Compose environment, fill every blank with local-only values, and never
copy production secrets into it.

```bash
cp .env.example .env.local
chmod 600 .env.local
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml build
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml up -d db replay caddy
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml run --rm migrate
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml run --rm --user root --entrypoint sh solver -c 'chown -R 1000:1000 /var/lib/cobia-solver; chown 1000:1000 /auth/codex; find /auth/codex -mindepth 1 -maxdepth 1 ! -name config.toml -exec chown -R 1000:1000 {} +'
docker compose --env-file .env.local -f compose.yaml -f compose.local.yaml up -d solver
```

The external `cobia-reference-codex-runtime` volume must already contain the
solver's Codex authentication. The Next.js development server still runs with
`pnpm dev` on the host; it is intentionally not part of Compose.

## Application checks

Verify the service boundary from an operator machine:

```bash
curl --fail https://api.getcobia.com/healthz
curl --fail https://getcobia.com/api/network/status
docker compose exec replay node -e "fetch('http://127.0.0.1:3001/healthz').then(async r=>{console.log(r.status,await r.text())})"
docker compose logs --since=10m solver
```

Create a low-value intent after cutover. A successful proposal must produce an
accepted replay and appear under Current programs before wallet execution is
considered. Never validate the cutover by signing or broadcasting an execution.

## Updates and rollback

```bash
git pull --ff-only origin main
docker compose build
docker compose up -d db cert-sync
docker compose run --rm migrate
docker compose up -d --remove-orphans replay solver caddy
docker compose ps
```

Tag the previous Git commit and container image before each update. Roll back
application containers to that tag only when its database schema is compatible;
database migrations are not automatically reversed.

## Current small-scale operations

- Check `docker compose ps`, disk usage, and recent logs after updates. Compose
  restarts unhealthy solver and replay processes within their resource limits.
- Alert on replay health failures, solver registration loss, and repeated
  `VERIFIER_FAILED` submissions when basic monitoring is available.
- Apply unattended security updates and reboot during a documented window.

## Before material user value or higher scale

- Send container logs and health alerts to an external service.
- Add encrypted off-VM PostgreSQL dumps, solver-state snapshots, and a tested
  restore procedure. Backups are deliberately a scale-up gate, not a hackathon
  launch dependency.
- Move PostgreSQL behind a connection pooler or to a managed service before
  increasing Vercel function concurrency or replay parallelism.
