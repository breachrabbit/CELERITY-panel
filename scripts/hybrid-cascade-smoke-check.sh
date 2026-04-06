#!/usr/bin/env bash
set -u
set -o pipefail

# Smoke-check helper for hybrid cascade runtime on a Hysteria node.
# Verifies that Hysteria + Xray sidecar are running and overlay is present.

usage() {
  cat <<'EOF'
Usage:
  scripts/hybrid-cascade-smoke-check.sh --host <ip-or-host> [options]

Options:
  --host <host>                 Remote node host/IP (required)
  --user <user>                 SSH user (default: root)
  --port <port>                 SSH port (default: 22)
  --identity <path>             SSH private key path
  --sidecar-service <name>      Sidecar unit name (default: xray-cascade.service)
  --sidecar-config <path>       Sidecar config path (default: /usr/local/etc/xray-cascade/config.json)
  --hysteria-config <path>      Hysteria config path (default: /etc/hysteria/config.yaml)
  --socks-port <port>           Sidecar local SOCKS port (default: 11080)
  --help                        Show this help

Environment alternatives:
  SSH_HOST, SSH_USER, SSH_PORT, SSH_IDENTITY,
  SIDECAR_SERVICE, SIDECAR_CONFIG_PATH, HYSTERIA_CONFIG_PATH, SOCKS_PORT
EOF
}

SSH_HOST="${SSH_HOST:-}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-}"

SIDECAR_SERVICE="${SIDECAR_SERVICE:-xray-cascade.service}"
SIDECAR_CONFIG_PATH="${SIDECAR_CONFIG_PATH:-/usr/local/etc/xray-cascade/config.json}"
HYSTERIA_CONFIG_PATH="${HYSTERIA_CONFIG_PATH:-/etc/hysteria/config.yaml}"
SOCKS_PORT="${SOCKS_PORT:-11080}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) SSH_HOST="${2:-}"; shift 2 ;;
    --user) SSH_USER="${2:-}"; shift 2 ;;
    --port) SSH_PORT="${2:-}"; shift 2 ;;
    --identity) SSH_IDENTITY="${2:-}"; shift 2 ;;
    --sidecar-service) SIDECAR_SERVICE="${2:-}"; shift 2 ;;
    --sidecar-config) SIDECAR_CONFIG_PATH="${2:-}"; shift 2 ;;
    --hysteria-config) HYSTERIA_CONFIG_PATH="${2:-}"; shift 2 ;;
    --socks-port) SOCKS_PORT="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$SSH_HOST" ]]; then
  echo "Error: --host is required" >&2
  usage
  exit 2
fi

if ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]] || [[ "$SSH_PORT" -lt 1 || "$SSH_PORT" -gt 65535 ]]; then
  echo "Error: invalid SSH port: $SSH_PORT" >&2
  exit 2
fi

if ! [[ "$SOCKS_PORT" =~ ^[0-9]+$ ]] || [[ "$SOCKS_PORT" -lt 1 || "$SOCKS_PORT" -gt 65535 ]]; then
  echo "Error: invalid SOCKS port: $SOCKS_PORT" >&2
  exit 2
fi

SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -p "$SSH_PORT"
)
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
fi

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "[PASS] $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "[FAIL] $1"
}

run_remote() {
  local cmd="$1"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$cmd"
}

remote_eval() {
  local cmd="$1"
  run_remote "$cmd" 2>/dev/null
}

echo "== Hybrid Cascade Smoke Check =="
echo "Host: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
echo "Sidecar service: ${SIDECAR_SERVICE}"
echo "Sidecar config: ${SIDECAR_CONFIG_PATH}"
echo "Hysteria config: ${HYSTERIA_CONFIG_PATH}"
echo "SOCKS port: ${SOCKS_PORT}"
echo

if remote_eval "echo ok" | grep -q '^ok$'; then
  pass "SSH connectivity"
else
  fail "SSH connectivity"
  echo
  echo "Cannot proceed without SSH access."
  exit 1
fi

check_service_active() {
  local service="$1"
  local out
  out="$(remote_eval "systemctl is-active ${service@Q} || true")"
  if [[ "$out" == "active" ]]; then
    pass "service active: $service"
  else
    fail "service active: $service (actual: ${out:-unknown})"
  fi
}

check_file_exists() {
  local path="$1"
  if remote_eval "test -f ${path@Q}"; then
    pass "file exists: $path"
  else
    fail "file exists: $path"
  fi
}

check_grep_contains() {
  local pattern="$1"
  local path="$2"
  if remote_eval "grep -n ${pattern@Q} ${path@Q} >/dev/null"; then
    pass "pattern '${pattern}' found in $path"
  else
    fail "pattern '${pattern}' found in $path"
  fi
}

check_numeric_gt_zero() {
  local cmd="$1"
  local label="$2"
  local out
  out="$(remote_eval "$cmd" || true)"
  out="$(echo "$out" | tr -d '[:space:]')"
  if [[ "$out" =~ ^[0-9]+$ ]] && [[ "$out" -gt 0 ]]; then
    pass "$label (value: $out)"
  else
    fail "$label (value: ${out:-n/a})"
  fi
}

check_service_active "hysteria-server"
check_service_active "$SIDECAR_SERVICE"
check_file_exists "$SIDECAR_CONFIG_PATH"
check_file_exists "$HYSTERIA_CONFIG_PATH"
check_grep_contains "__cascade_sidecar__" "$HYSTERIA_CONFIG_PATH"
check_numeric_gt_zero "ss -ltnH '( sport = :${SOCKS_PORT} )' | wc -l" "sidecar listens on SOCKS port ${SOCKS_PORT}"

if remote_eval "command -v xray >/dev/null"; then
  pass "xray binary present"
else
  fail "xray binary present"
fi

echo
echo "Summary: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
