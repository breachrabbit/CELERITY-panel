#!/usr/bin/env bash
set -u
set -o pipefail

# Smoke-check helper for clean node validation.
# Supports xray, hysteria, and hybrid cascade profiles.

usage() {
  cat <<'EOF'
Usage:
  scripts/hybrid-cascade-smoke-check.sh --host <ip-or-host> [options]

Options:
  --host <host>                 Remote node host/IP (required)
  --user <user>                 SSH user (default: root)
  --port <port>                 SSH port (default: 22)
  --identity <path>             SSH private key path
  --profile <name>              Profile: xray, hysteria, hybrid (default: hybrid)
  --sidecar-service <name>      Sidecar unit name (default: xray-cascade.service)
  --sidecar-config <path>       Sidecar config path (default: /usr/local/etc/xray-cascade/config.json)
  --hysteria-config <path>      Hysteria config path (default: /etc/hysteria/config.yaml)
  --xray-service <name>         Xray unit name (default depends on profile)
  --xray-config <path>          Xray config path (default depends on profile)
  --socks-port <port>           Sidecar local SOCKS port (default: 11080)
  --help                        Show this help

Environment alternatives:
  SSH_HOST, SSH_USER, SSH_PORT, SSH_IDENTITY,
  PROFILE, SIDECAR_SERVICE, SIDECAR_CONFIG_PATH, HYSTERIA_CONFIG_PATH,
  XRAY_SERVICE, XRAY_CONFIG_PATH, SOCKS_PORT
EOF
}

SSH_HOST="${SSH_HOST:-}"
SSH_USER="${SSH_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
SSH_IDENTITY="${SSH_IDENTITY:-}"
PROFILE="${PROFILE:-hybrid}"

SIDECAR_SERVICE="${SIDECAR_SERVICE:-xray-cascade.service}"
SIDECAR_CONFIG_PATH="${SIDECAR_CONFIG_PATH:-/usr/local/etc/xray-cascade/config.json}"
HYSTERIA_CONFIG_PATH="${HYSTERIA_CONFIG_PATH:-/etc/hysteria/config.yaml}"
XRAY_SERVICE="${XRAY_SERVICE:-}"
XRAY_CONFIG_PATH="${XRAY_CONFIG_PATH:-}"
SOCKS_PORT="${SOCKS_PORT:-11080}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) SSH_HOST="${2:-}"; shift 2 ;;
    --user) SSH_USER="${2:-}"; shift 2 ;;
    --port) SSH_PORT="${2:-}"; shift 2 ;;
    --identity) SSH_IDENTITY="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --sidecar-service) SIDECAR_SERVICE="${2:-}"; shift 2 ;;
    --sidecar-config) SIDECAR_CONFIG_PATH="${2:-}"; shift 2 ;;
    --hysteria-config) HYSTERIA_CONFIG_PATH="${2:-}"; shift 2 ;;
    --xray-service) XRAY_SERVICE="${2:-}"; shift 2 ;;
    --xray-config) XRAY_CONFIG_PATH="${2:-}"; shift 2 ;;
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

case "$PROFILE" in
  xray|hysteria|hybrid) ;;
  *)
    echo "Error: invalid profile: $PROFILE (expected xray, hysteria, or hybrid)" >&2
    exit 2
    ;;
esac

if [[ -z "$XRAY_SERVICE" ]]; then
  case "$PROFILE" in
    xray) XRAY_SERVICE="xray.service" ;;
    hybrid) XRAY_SERVICE="xray-cascade.service" ;;
  esac
fi

if [[ -z "$XRAY_CONFIG_PATH" ]]; then
  case "$PROFILE" in
    xray) XRAY_CONFIG_PATH="/usr/local/etc/xray/config.json" ;;
    hybrid) XRAY_CONFIG_PATH="/usr/local/etc/xray-cascade/config.json" ;;
  esac
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
REMOTE_OUTPUT=""
REMOTE_RC=0

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

quote_arg() {
  printf '%q' "$1"
}

remote_capture() {
  local cmd="$1"
  REMOTE_OUTPUT="$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$cmd" 2>&1)"
  REMOTE_RC=$?
}

service_status_snapshot() {
  local service="$1"
  remote_capture "systemctl show $(quote_arg "$service") -p ActiveState -p SubState -p Result -p ExecMainStatus --no-pager 2>/dev/null || true"
  echo "${REMOTE_OUTPUT:-<no status available>}"
}

service_journal_tail() {
  local service="$1"
  remote_capture "journalctl -u $(quote_arg "$service") -n 20 --no-pager 2>/dev/null || true"
  echo "${REMOTE_OUTPUT:-<no journal available>}"
}

wait_for_service_active() {
  local service="$1"
  local label="$2"
  local attempt status snapshot
  for attempt in 1 2 3 4 5 6; do
    status="$(remote_eval "systemctl is-active $(quote_arg "$service") || true")"
    if [[ "$status" == "active" ]]; then
      pass "$label: active"
      return 0
    fi
    if [[ "$status" != "activating" && "$status" != "inactive" && "$status" != "reloading" && "$status" != "deactivating" ]]; then
      break
    fi
    sleep 2
  done

  snapshot="$(service_status_snapshot "$service")"
  fail "$label: status=${status:-unknown}"
  echo "  systemctl show:"
  echo "$snapshot" | sed 's/^/    /'
  echo "  journal tail:"
  service_journal_tail "$service" | sed 's/^/    /'
  return 1
}

echo "== Node Smoke Check =="
echo "Host: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
echo "Profile: ${PROFILE}"
echo "Sidecar service: ${SIDECAR_SERVICE}"
echo "Sidecar config: ${SIDECAR_CONFIG_PATH}"
echo "Hysteria config: ${HYSTERIA_CONFIG_PATH}"
if [[ -n "$XRAY_SERVICE" ]]; then
  echo "Xray service: ${XRAY_SERVICE}"
fi
if [[ -n "$XRAY_CONFIG_PATH" ]]; then
  echo "Xray config: ${XRAY_CONFIG_PATH}"
fi
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

check_file_exists() {
  local path="$1"
  if remote_eval "test -s $(quote_arg "$path")"; then
    pass "file exists: $path"
  else
    fail "file exists: $path"
  fi
}

check_grep_contains() {
  local pattern="$1"
  local path="$2"
  if remote_eval "grep -nF -- $(quote_arg "$pattern") $(quote_arg "$path") >/dev/null"; then
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

run_profile_checks() {
  case "$PROFILE" in
    xray)
      wait_for_service_active "${XRAY_SERVICE:-xray.service}" "xray service"
      check_file_exists "${XRAY_CONFIG_PATH:-/usr/local/etc/xray/config.json}"
      if remote_eval "command -v xray >/dev/null"; then
        pass "xray binary present"
      else
        fail "xray binary present"
      fi
      ;;
    hysteria)
      wait_for_service_active "hysteria-server" "hysteria-server service"
      check_file_exists "$HYSTERIA_CONFIG_PATH"
      ;;
    hybrid)
      wait_for_service_active "hysteria-server" "hysteria-server service"
      wait_for_service_active "${XRAY_SERVICE:-xray-cascade.service}" "sidecar service"
      check_file_exists "$SIDECAR_CONFIG_PATH"
      check_file_exists "$HYSTERIA_CONFIG_PATH"
      check_grep_contains "__cascade_sidecar__" "$HYSTERIA_CONFIG_PATH"
      check_numeric_gt_zero "ss -H -ltn '( sport = :${SOCKS_PORT} )' 2>/dev/null | wc -l" "sidecar listens on SOCKS port ${SOCKS_PORT}"
      if remote_eval "command -v xray >/dev/null"; then
        pass "xray binary present"
      else
        fail "xray binary present"
      fi
      ;;
  esac
}

run_profile_checks

echo
echo "Summary: profile=${PROFILE} PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
exit 0
