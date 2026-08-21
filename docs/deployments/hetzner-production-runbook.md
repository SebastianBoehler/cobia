# Hetzner production runbook

This stack moves the Cobia API and independent Anvil replay boundary off
request-scoped Vercel infrastructure. It runs the web/API service, reference
solver, and Caddy TLS proxy on one VM while retaining the existing managed
PostgreSQL database.

## VM boundary

- Ubuntu 24.04, x86-64, at least 4 dedicated vCPU, 8 GB RAM, and 80 GB disk.
- Ports 22, 80, and 443 are the only public inbound ports.
- Anvil binds random loopback ports inside the web container; none are exposed.
- PostgreSQL remains external and must require TLS and IP-restricted access.
- Solver Codex authentication and job state live in named Docker volumes.

## First deployment

Install Docker Engine with the official Docker repository, enable the firewall,
then clone this repository under `/opt/cobia`. Do not copy secrets into the Git
checkout.

```bash
cd /opt/cobia/deploy/hetzner
cp .env.example .env
chmod 600 .env
```

Fill `.env` from the current production secret store. Generate new dedicated
VM values for `REFERENCE_SOLVER_PRIVATE_KEY`, `COBIA_VERIFIER_PRIVATE_KEY`,
`WALLET_AUTH_SECRET`, and `EXECUTION_SESSION_SECRET`; do not reuse developer
keys. The onchain executor verifier must be updated deliberately before rotating
the active verifier signing key.

Point the domain A/AAAA records to the VM only after the health checks below
pass against its IP. Caddy obtains and renews TLS automatically.

```bash
docker compose build
docker compose run --rm migrate
docker compose up -d web solver caddy
docker compose ps
docker compose logs --tail=100 web solver caddy
```

The `web` service uses `FORK_REPLAY_RUNTIME=local` and the pinned
`@foundry-rs/anvil` binary from the image. The production Vercel deployment
continues to default to `vercel` until traffic is switched.

## Cutover checks

Before changing DNS, resolve the domain to the VM from an operator machine and
verify:

```bash
curl --resolve getcobia.com:443:VM_IP https://getcobia.com/api/network/status
docker compose exec web node -e "fetch('http://127.0.0.1:3000/api/network/status').then(async r=>{console.log(r.status,await r.text())})"
docker compose logs --since=10m solver
```

Create a low-value intent after cutover. A successful proposal must produce an
accepted replay and appear under Current programs before wallet execution is
considered. Never validate the cutover by signing or broadcasting an execution.

## Updates and rollback

```bash
git pull --ff-only origin main
docker compose build
docker compose run --rm migrate
docker compose up -d --remove-orphans
docker compose ps
```

Tag the previous Git commit and container image before each update. Roll back
application containers to that tag only when its database schema is compatible;
database migrations are not automatically reversed.

## Operations

- Send container logs to a remote log sink before public launch.
- Alert on web health failures, solver registration loss, disk usage, and any
  `VERIFIER_FAILED` submission.
- Back up the managed database using provider point-in-time recovery and a
  daily encrypted logical dump stored outside the VM.
- Snapshot the `solver-state` volume daily; Codex auth should be recoverable
  from the provider rather than treated as the sole credential copy.
- Apply unattended security updates and reboot during a documented window.
