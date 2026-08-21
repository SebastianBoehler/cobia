#!/bin/sh
set -eu

certificate_dir=""
for attempt in $(seq 1 120); do
  certificate_dir=$(find /caddy/caddy/certificates -type d -path "*/${COBIA_API_DOMAIN}" -print -quit 2>/dev/null || true)
  [ -n "$certificate_dir" ] && break
  sleep 1
done
[ -n "$certificate_dir" ] || { echo "Caddy certificate was not found" >&2; exit 1; }

copy_certificates() {
  certificate="$certificate_dir/${COBIA_API_DOMAIN}.crt"
  key="$certificate_dir/${COBIA_API_DOMAIN}.key"
  [ -s "$certificate" ] && [ -s "$key" ] || return 1
  install -o 70 -g 70 -m 0644 "$certificate" /tls/server.crt.next
  install -o 70 -g 70 -m 0600 "$key" /tls/server.key.next
  mv /tls/server.crt.next /tls/server.crt
  mv /tls/server.key.next /tls/server.key
}

copy_certificates
[ "${1:-}" = "init" ] && exit 0

while sleep 3600; do
  certificate="$certificate_dir/${COBIA_API_DOMAIN}.crt"
  key="$certificate_dir/${COBIA_API_DOMAIN}.key"
  if ! cmp -s "$certificate" /tls/server.crt || ! cmp -s "$key" /tls/server.key; then
    copy_certificates
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U cobia -d cobia \
      -c "select pg_reload_conf()" >/dev/null
  fi
done
