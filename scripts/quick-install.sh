#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_VERSION="1.0.0"
REPO_RAW_BASE="${REPO_RAW_BASE:-https://raw.githubusercontent.com/ClickDevTech/hysteria-panel/main}"

DOMAIN=""
ACME_EMAIL=""
INSTALL_DIR=""
COMPOSE_FILE="docker-compose.hub.yml"
SKIP_START=0
SKIP_DOCKER_INSTALL=0

log() {
    printf '[quick-install] %s\n' "$*"
}

warn() {
    printf '[quick-install] WARN: %s\n' "$*" >&2
}

fail() {
    printf '[quick-install] ERROR: %s\n' "$*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Quick installer for C³ CELERITY panel.

Usage:
  quick-install.sh --domain panel.example.com [options]

Options:
  --domain <domain>           Panel domain (required)
  --email <email>             Let's Encrypt email (default: admin@<domain>)
  --install-dir <path>        Install directory when compose files are absent in current dir
                              (default: ./hysteria-panel)
  --compose-file <file>       Compose file (default: docker-compose.hub.yml)
  --skip-start                Only prepare files and .env, do not start containers
  --skip-docker-install       Do not auto-install Docker if missing
  --help                      Show this help

Examples:
  bash quick-install.sh --domain panel.example.com
  bash quick-install.sh --domain panel.example.com --email ops@example.com
EOF
}

need_cmd() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || fail "Required command not found: $cmd"
}

as_root() {
    if [[ "$(id -u)" -eq 0 ]]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        fail "Need root privileges for: $* (install sudo or run as root)"
    fi
}

random_hex() {
    local bytes="$1"
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex "$bytes"
        return
    fi
    if [[ -r /dev/urandom ]]; then
        LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c "$((bytes * 2))"
        return
    fi
    fail "Unable to generate random values (openssl and /dev/urandom unavailable)"
}

is_valid_domain() {
    local value="$1"
    [[ "$value" =~ ^[A-Za-z0-9.-]+$ ]] && [[ "$value" == *.* ]] && [[ "$value" != .* ]] && [[ "$value" != *..* ]]
}

download_file_if_missing() {
    local rel_path="$1"
    local target="$2"
    if [[ -f "$target" ]]; then
        return
    fi
    log "Downloading $rel_path"
    curl -fsSL "${REPO_RAW_BASE}/${rel_path}" -o "$target"
}

ensure_project_files() {
    local project_dir="$1"
    mkdir -p "$project_dir"
    cd "$project_dir"

    if [[ -f "./docker.env.example" && -f "./${COMPOSE_FILE}" ]]; then
        log "Using local project files in: $project_dir"
    else
        need_cmd curl
        log "Project files are missing in current directory, fetching from GitHub"
        download_file_if_missing "docker.env.example" "docker.env.example"
        download_file_if_missing "${COMPOSE_FILE}" "${COMPOSE_FILE}"
        mkdir -p greenlock.d
        download_file_if_missing "greenlock.d/config.json" "greenlock.d/config.json"
    fi

    mkdir -p logs backups greenlock.d
}

upsert_env() {
    local key="$1"
    local value="$2"
    local file="$3"
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" '
        BEGIN { replaced = 0 }
        $0 ~ ("^" k "=") { print k "=" v; replaced = 1; next }
        { print }
        END { if (!replaced) print k "=" v }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
}

read_env_value() {
    local key="$1"
    local file="$2"
    local line
    line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
    printf '%s' "${line#*=}"
}

ensure_env_file() {
    local env_file=".env"
    local now
    now="$(date +%Y%m%d-%H%M%S)"

    if [[ ! -f "$env_file" ]]; then
        cp docker.env.example "$env_file"
        log "Created .env from docker.env.example"
    else
        cp "$env_file" ".env.backup-${now}"
        log "Backup created: .env.backup-${now}"
    fi

    local inferred_email
    if [[ -n "$ACME_EMAIL" ]]; then
        inferred_email="$ACME_EMAIL"
    else
        local email_domain="${DOMAIN#*.}"
        if [[ "$email_domain" == "$DOMAIN" ]]; then
            inferred_email="admin@${DOMAIN}"
        else
            inferred_email="admin@${email_domain}"
        fi
    fi

    upsert_env "PANEL_DOMAIN" "$DOMAIN" "$env_file"
    upsert_env "DOKPLOY_PANEL_HOST" "$DOMAIN" "$env_file"
    upsert_env "DOKPLOY_TRAEFIK_SERVICE_PORT" "3000" "$env_file"
    upsert_env "FEATURE_CASCADE_HYBRID" "true" "$env_file"

    local cur_email
    cur_email="$(read_env_value "ACME_EMAIL" "$env_file")"
    if [[ -z "$cur_email" || "$cur_email" == "admin@example.com" ]]; then
        upsert_env "ACME_EMAIL" "$inferred_email" "$env_file"
    fi

    local cur_encryption_key
    cur_encryption_key="$(read_env_value "ENCRYPTION_KEY" "$env_file")"
    if [[ -z "$cur_encryption_key" || "${#cur_encryption_key}" -lt 32 ]]; then
        upsert_env "ENCRYPTION_KEY" "$(random_hex 16)" "$env_file"
    fi

    local cur_session_secret
    cur_session_secret="$(read_env_value "SESSION_SECRET" "$env_file")"
    if [[ -z "$cur_session_secret" || "${#cur_session_secret}" -lt 32 ]]; then
        upsert_env "SESSION_SECRET" "$(random_hex 32)" "$env_file"
    fi

    local cur_mongo_password
    cur_mongo_password="$(read_env_value "MONGO_PASSWORD" "$env_file")"
    if [[ -z "$cur_mongo_password" ]]; then
        upsert_env "MONGO_PASSWORD" "$(random_hex 16)" "$env_file"
    fi

    local cur_mongo_user
    cur_mongo_user="$(read_env_value "MONGO_USER" "$env_file")"
    if [[ -z "$cur_mongo_user" ]]; then
        upsert_env "MONGO_USER" "hysteria" "$env_file"
    fi

    log ".env is ready"
}

ensure_docker() {
    if command -v docker >/dev/null 2>&1; then
        return
    fi

    if [[ "$SKIP_DOCKER_INSTALL" -eq 1 ]]; then
        fail "Docker is not installed (and --skip-docker-install is set)"
    fi

    need_cmd curl
    log "Docker not found, installing via get.docker.com"
    as_root sh -c "curl -fsSL https://get.docker.com | sh"

    if command -v systemctl >/dev/null 2>&1; then
        as_root systemctl enable --now docker || true
    fi
}

ensure_compose() {
    if docker compose version >/dev/null 2>&1; then
        return 0
    fi
    if command -v docker-compose >/dev/null 2>&1; then
        return 0
    fi
    fail "Docker Compose is not available (need 'docker compose' plugin or docker-compose binary)"
}

run_compose() {
    if docker compose version >/dev/null 2>&1; then
        if docker compose "$@"; then
            return 0
        fi
        if [[ "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
            sudo docker compose "$@"
            return 0
        fi
        fail "Failed to run: docker compose $*"
    fi

    if command -v docker-compose >/dev/null 2>&1; then
        if docker-compose "$@"; then
            return 0
        fi
        if [[ "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
            sudo docker-compose "$@"
            return 0
        fi
        fail "Failed to run: docker-compose $*"
    fi

    fail "Docker Compose is unavailable"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --domain)
                DOMAIN="${2:-}"
                shift 2
                ;;
            --email)
                ACME_EMAIL="${2:-}"
                shift 2
                ;;
            --install-dir)
                INSTALL_DIR="${2:-}"
                shift 2
                ;;
            --compose-file)
                COMPOSE_FILE="${2:-}"
                shift 2
                ;;
            --skip-start)
                SKIP_START=1
                shift
                ;;
            --skip-docker-install)
                SKIP_DOCKER_INSTALL=1
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                fail "Unknown argument: $1 (use --help)"
                ;;
        esac
    done
}

main() {
    parse_args "$@"

    if [[ -z "$DOMAIN" ]]; then
        fail "--domain is required (example: --domain panel.example.com)"
    fi

    if ! is_valid_domain "$DOMAIN"; then
        fail "Invalid domain format: $DOMAIN"
    fi

    local start_dir
    start_dir="$(pwd)"

    local target_dir
    if [[ -f "${start_dir}/docker.env.example" && -f "${start_dir}/${COMPOSE_FILE}" ]]; then
        target_dir="$start_dir"
    elif [[ -n "$INSTALL_DIR" ]]; then
        target_dir="$INSTALL_DIR"
    else
        target_dir="${start_dir}/hysteria-panel"
    fi

    log "Installer v${SCRIPT_VERSION}"
    log "Domain: ${DOMAIN}"
    log "Install dir: ${target_dir}"
    log "Compose file: ${COMPOSE_FILE}"

    ensure_project_files "$target_dir"
    ensure_env_file

    if [[ "$SKIP_START" -eq 1 ]]; then
        log "Skip start requested. Prepared files only."
        log "Next step: cd ${target_dir} && docker compose -f ${COMPOSE_FILE} up -d"
        exit 0
    fi

    ensure_docker
    ensure_compose

    log "Pulling images"
    run_compose -f "$COMPOSE_FILE" pull
    log "Starting services"
    run_compose -f "$COMPOSE_FILE" up -d

    log "Container status"
    run_compose -f "$COMPOSE_FILE" ps

    log "Done. Open: https://${DOMAIN}/panel"
}

main "$@"
