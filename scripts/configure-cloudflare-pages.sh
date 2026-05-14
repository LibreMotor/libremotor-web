#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-libremotor.com}"
PAGES_HOST="${PAGES_HOST:-libremotor.github.io}"
ENV_FILE="${ENV_FILE:-/home/sabino/code/sabino/labs/azure-improvements/.env}"
DRY_RUN="${DRY_RUN:-0}"

GITHUB_PAGES_A=(
  "185.199.108.153"
  "185.199.109.153"
  "185.199.110.153"
  "185.199.111.153"
)

GITHUB_PAGES_AAAA=(
  "2606:50c0:8000::153"
  "2606:50c0:8001::153"
  "2606:50c0:8002::153"
  "2606:50c0:8003::153"
)

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 1
  }
}

cloudflare() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="https://api.cloudflare.com/client/v4${path}"

  if [[ -n "$data" ]]; then
    curl -sS --fail-with-body --request "$method" \
      --header "Authorization: Bearer ${CLOUDFLARE_TOKEN}" \
      --header "Content-Type: application/json" \
      --data "$data" \
      "$url"
  else
    curl -sS --fail-with-body --request "$method" \
      --header "Authorization: Bearer ${CLOUDFLARE_TOKEN}" \
      --header "Content-Type: application/json" \
      "$url"
  fi
}

extract_token() {
  if [[ -n "${CLOUDFLARE_TOKEN:-}" ]]; then
    return
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "CLOUDFLARE_TOKEN is unset and ENV_FILE does not exist: $ENV_FILE" >&2
    exit 1
  fi

  CLOUDFLARE_TOKEN="$(
    awk -F= '
      /^[[:space:]]*CLOUDFLARE_TOKEN=/ {
        line=$0
        sub(/^[[:space:]]*CLOUDFLARE_TOKEN=/, "", line)
        print line
      }
    ' "$ENV_FILE" | tail -n 1
  )"

  if [[ -z "$CLOUDFLARE_TOKEN" ]]; then
    echo "CLOUDFLARE_TOKEN was not found in $ENV_FILE" >&2
    exit 1
  fi

  export CLOUDFLARE_TOKEN
}

record_ids() {
  local zone_id="$1"
  local type="$2"
  local name="$3"

  cloudflare GET "/zones/${zone_id}/dns_records?type=${type}&name=${name}" |
    jq -r '.result[].id'
}

delete_records() {
  local zone_id="$1"
  local type="$2"
  local name="$3"
  local id

  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "dry-run: delete ${type} ${name} (${id})"
    else
      echo "delete ${type} ${name}"
      cloudflare DELETE "/zones/${zone_id}/dns_records/${id}" >/dev/null
    fi
  done < <(record_ids "$zone_id" "$type" "$name")
}

create_record() {
  local zone_id="$1"
  local type="$2"
  local name="$3"
  local content="$4"
  local data

  data="$(
    jq -nc \
      --arg type "$type" \
      --arg name "$name" \
      --arg content "$content" \
      '{type:$type,name:$name,content:$content,ttl:1,proxied:false}'
  )"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "dry-run: create ${type} ${name} -> ${content}"
  else
    echo "create ${type} ${name} -> ${content}"
    cloudflare POST "/zones/${zone_id}/dns_records" "$data" >/dev/null
  fi
}

main() {
  need curl
  need jq

  extract_token

  echo "verifying Cloudflare token"
  cloudflare GET "/user/tokens/verify" | jq -e '.success == true' >/dev/null

  zone_id="$(
    cloudflare GET "/zones?name=${DOMAIN}" |
      jq -r '.result[0].id // empty'
  )"

  if [[ -z "$zone_id" ]]; then
    echo "Cloudflare zone not found for ${DOMAIN}" >&2
    exit 1
  fi

  echo "configuring GitHub Pages DNS for ${DOMAIN}"

  delete_records "$zone_id" CNAME "$DOMAIN"
  delete_records "$zone_id" A "$DOMAIN"
  delete_records "$zone_id" AAAA "$DOMAIN"
  for ip in "${GITHUB_PAGES_A[@]}"; do
    create_record "$zone_id" A "$DOMAIN" "$ip"
  done
  for ip in "${GITHUB_PAGES_AAAA[@]}"; do
    create_record "$zone_id" AAAA "$DOMAIN" "$ip"
  done

  delete_records "$zone_id" A "www.${DOMAIN}"
  delete_records "$zone_id" AAAA "www.${DOMAIN}"
  delete_records "$zone_id" CNAME "www.${DOMAIN}"
  create_record "$zone_id" CNAME "www.${DOMAIN}" "$PAGES_HOST"

  echo "done"
  echo "After DNS resolves, enable HTTPS in GitHub Pages:"
  echo "gh api --method PUT repos/LibreMotor/libremotor-web/pages -f cname=${DOMAIN} -F https_enforced=true"
}

main "$@"
