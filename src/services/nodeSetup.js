/**
 * Hysteria node auto-setup service via SSH
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const logger = require('../utils/logger');
const config = require('../../config');
const cryptoService = require('./cryptoService');
const Settings = require('../models/settingsModel');
const configGenerator = require('./configGenerator');
const CASCADE_SIDECAR_OUTBOUND = '__cascade_sidecar__';

function getPanelHost() {
    return String(config.PANEL_DOMAIN || config.BASE_URL || '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .trim();
}

async function resolvePanelEndpoint() {
    const host = getPanelHost();

    if (!host) {
        return { host: '', ip: '', source: 'empty-host' };
    }

    if (net.isIP(host)) {
        return { host, ip: host, source: 'direct-ip' };
    }

    const panelIpFromEnv = String(process.env.PANEL_IP || '').trim();
    if (panelIpFromEnv && net.isIP(panelIpFromEnv)) {
        return { host, ip: panelIpFromEnv, source: 'env:PANEL_IP' };
    }

    try {
        const resolved = await dns.lookup(host, { family: 4 });
        if (resolved?.address) {
            return { host, ip: resolved.address, source: `dns:${host}` };
        }
    } catch (_) {
        // handled by fallback below
    }

    return { host, ip: '', source: `dns-failed:${host}` };
}

/**
 * Check if a node is on the same VPS as the panel.
 * Uses multiple heuristics: domain match, localhost detection, and real IP match
 * against the panel domain / PANEL_IP environment.
 * @param {Object} node - Node object with ip and domain fields
 * @returns {Promise<boolean>} true if node appears to be on the same server as the panel
 */
async function isSameVpsAsPanel(node) {
    const panelDomain = config.PANEL_DOMAIN;
    const nodeIp = String(node?.ip || '').toLowerCase().trim();

    // 1. Domain match - most reliable indicator
    if (node?.domain && node.domain === panelDomain) {
        logger.debug(`[NodeSetup] Same VPS detected: domain match (${node.domain})`);
        return true;
    }

    // 2. Localhost / loopback detection
    if (nodeIp === 'localhost' || nodeIp === '127.0.0.1' || nodeIp === '::1') {
        logger.debug(`[NodeSetup] Same VPS detected: localhost IP (${nodeIp})`);
        return true;
    }

    // 3. Compare against resolved panel endpoint IP
    const panelEndpoint = await resolvePanelEndpoint();
    if (panelEndpoint.ip && net.isIP(nodeIp) && panelEndpoint.ip === nodeIp) {
        logger.debug(`[NodeSetup] Same VPS detected: IP match (${nodeIp}) via ${panelEndpoint.source}`);
        return true;
    }

    return false;
}

const SAME_HOST_NODE_FALLBACK_PORTS = [8443, 9443, 10443, 11443, 12443, 15443, 16443];

async function pickSameHostNodePort(requestedPort) {
    const normalizedPort = parseInt(requestedPort, 10) || 443;
    if (normalizedPort !== 80 && normalizedPort !== 443) {
        return normalizedPort;
    }

    const fallback = SAME_HOST_NODE_FALLBACK_PORTS.find(port => port !== normalizedPort);
    return fallback || 8443;
}

function getHysteriaSameHostTcpConflicts(node) {
    const conflicts = [];
    const masq = node?.masquerade || {};

    const parsePort = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return 0;
        const match = raw.match(/:(\d+)\s*$/);
        if (match) return parseInt(match[1], 10) || 0;
        const direct = parseInt(raw, 10);
        return Number.isInteger(direct) ? direct : 0;
    };

    const httpPort = parsePort(masq.listenHTTP);
    const httpsPort = parsePort(masq.listenHTTPS);

    if (httpPort === 80) {
        conflicts.push('masquerade.listenHTTP=80');
    }
    if (httpsPort === 443) {
        conflicts.push('masquerade.listenHTTPS=443');
    }

    return conflicts;
}

/**
 * Read panel's SSL certificates from Greenlock or Caddy directory
 * @param {string} domain - Panel domain
 * @returns {Object|null} { cert, key } or null if not found
 */
function getPanelCertificates(domain) {
    try {
        let cert, key;
        
        // Try Caddy certificates first (when USE_CADDY=true)
        // Caddy stores certs in /caddy_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/{domain}/
        const caddyDir = path.join('/caddy_data/caddy/certificates/acme-v02.api.letsencrypt.org-directory', domain);
        const caddyCertPath = path.join(caddyDir, `${domain}.crt`);
        const caddyKeyPath = path.join(caddyDir, `${domain}.key`);
        
        if (fs.existsSync(caddyCertPath) && fs.existsSync(caddyKeyPath)) {
            cert = fs.readFileSync(caddyCertPath, 'utf8');
            key = fs.readFileSync(caddyKeyPath, 'utf8');
            logger.info(`[NodeSetup] Found Caddy certificates for ${domain}`);
            return { cert, key };
        }
        
        // Try Greenlock certificates (when USE_CADDY is not set)
        // Greenlock stores certs in greenlock.d/live/{domain}/
        const greenlockDir = path.join(__dirname, '../../greenlock.d/live', domain);
        const certPath = path.join(greenlockDir, 'cert.pem');
        const keyPath = path.join(greenlockDir, 'privkey.pem');
        const fullchainPath = path.join(greenlockDir, 'fullchain.pem');
        
        if (fs.existsSync(certPath)) {
            cert = fs.readFileSync(certPath, 'utf8');
        } else if (fs.existsSync(fullchainPath)) {
            cert = fs.readFileSync(fullchainPath, 'utf8');
        }
        
        if (fs.existsSync(keyPath)) {
            key = fs.readFileSync(keyPath, 'utf8');
        }
        
        if (cert && key) {
            logger.info(`[NodeSetup] Found Greenlock certificates for ${domain}`);
            return { cert, key };
        }
        
        logger.warn(`[NodeSetup] Panel certificates not found (checked Caddy: ${caddyDir}, Greenlock: ${greenlockDir})`);
        return null;
        
    } catch (error) {
        logger.error(`[NodeSetup] Error reading panel certificates: ${error.message}`);
        return null;
    }
}

const HYSTERIA_PINNED_VERSION = String(config.HYSTERIA_VERSION || '').trim();

const HYSTERIA_INSTALL_SCRIPT = `#!/bin/bash
set -e

echo "=== [1/5] Installing Hysteria runtime ==="
echo "Checking system..."
echo "OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || uname -a)"
echo "Arch: $(uname -m)"

install_pkg() {
    PKG="$1"

    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -y && apt-get install -y "$PKG"
        return $?
    fi
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y "$PKG"
        return $?
    fi
    if command -v yum >/dev/null 2>&1; then
        yum install -y "$PKG"
        return $?
    fi
    if command -v apk >/dev/null 2>&1; then
        apk add --no-cache "$PKG"
        return $?
    fi

    echo "ERROR: No supported package manager found to install $PKG"
    return 1
}

if [ -z "\${TERM:-}" ]; then
    export TERM=dumb
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "curl not found, installing..."
    install_pkg curl
fi

if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl not found, installing..."
    install_pkg openssl || true
fi

if ! command -v update-ca-certificates >/dev/null 2>&1 && ! [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    echo "ca-certificates may be missing, trying to install..."
    install_pkg ca-certificates || true
fi

if command -v hysteria >/dev/null 2>&1; then
    echo "Done: Hysteria already installed ($(hysteria version 2>/dev/null | head -1 || echo 'version unknown'))"
else
    HYSTERIA_VERSION="\${HYSTERIA_VERSION:-${HYSTERIA_PINNED_VERSION || 'latest'}}"
    INSTALL_OK=0
    INSTALLER_URLS="
https://get.hy2.sh/
https://raw.githubusercontent.com/apernet/hysteria/master/install_server.sh
https://github.com/apernet/hysteria/raw/master/install_server.sh
"

    for ATTEMPT in 1 2 3; do
        echo "Attempt $ATTEMPT/3: downloading Hysteria installer..."
        for INSTALLER_URL in $INSTALLER_URLS; do
            echo "Installer URL: $INSTALLER_URL"
            rm -f /tmp/hysteria-install.sh
            if ! curl -fL --retry 8 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 300 \
                "$INSTALLER_URL" -o /tmp/hysteria-install.sh; then
                echo "WARN: Failed to download installer from $INSTALLER_URL"
                continue
            fi
            if [ ! -s /tmp/hysteria-install.sh ]; then
                echo "WARN: Installer is empty ($INSTALLER_URL)"
                rm -f /tmp/hysteria-install.sh
                continue
            fi

            SCRIPT_SIZE=$(wc -c < /tmp/hysteria-install.sh | tr -d ' ')
            if [ "\${SCRIPT_SIZE:-0}" -lt 5000 ] || ! grep -qi "hysteria" /tmp/hysteria-install.sh; then
                echo "WARN: Installer content looks invalid (size=\${SCRIPT_SIZE:-0})"
                rm -f /tmp/hysteria-install.sh
                continue
            fi

            chmod +x /tmp/hysteria-install.sh
            echo "Attempt $ATTEMPT/3: running installer..."
            INSTALL_EXIT=0
            if [ "$HYSTERIA_VERSION" = "latest" ]; then
                bash /tmp/hysteria-install.sh 2>&1 || INSTALL_EXIT=$?
            else
                HYSTERIA_VERSION="$HYSTERIA_VERSION" bash /tmp/hysteria-install.sh 2>&1 || INSTALL_EXIT=$?
            fi
            rm -f /tmp/hysteria-install.sh

            if [ $INSTALL_EXIT -eq 0 ] && command -v hysteria >/dev/null 2>&1; then
                INSTALL_OK=1
                break 2
            fi
            echo "WARN: Installer run failed from $INSTALLER_URL (exit: $INSTALL_EXIT)"
        done

        if [ "$ATTEMPT" -lt 3 ]; then
            sleep $((ATTEMPT * 3))
        fi
    done

    if [ "$INSTALL_OK" -ne 1 ]; then
        echo "Official installer failed, trying binary fallback..."
        ARCH=$(uname -m)
        case "$ARCH" in
            x86_64|amd64) HY_BIN="hysteria-linux-amd64" ;;
            aarch64|arm64) HY_BIN="hysteria-linux-arm64" ;;
            *)
                echo "ERROR: Unsupported architecture for Hysteria fallback: $ARCH"
                exit 1
                ;;
        esac

        if [ "$HYSTERIA_VERSION" = "latest" ]; then
            TAG_JSON=$(curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 60 \
                "https://api.github.com/repos/apernet/hysteria/releases/latest" || true)
            RESOLVED_TAG=$(echo "$TAG_JSON" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\\1/p' | head -n 1)
            if [ -n "$RESOLVED_TAG" ]; then
                HYSTERIA_VERSION="$RESOLVED_TAG"
                echo "Resolved latest Hysteria version: $HYSTERIA_VERSION"
            fi
        fi

        if [ -z "$HYSTERIA_VERSION" ] || [ "$HYSTERIA_VERSION" = "latest" ]; then
            echo "ERROR: Could not resolve Hysteria release tag for fallback"
            exit 1
        fi

        TMP_DIR=$(mktemp -d)
        BIN_PATH="$TMP_DIR/hysteria"
        DOWNLOADED=0
        for HY_URL in \
            "https://github.com/apernet/hysteria/releases/download/$HYSTERIA_VERSION/$HY_BIN" \
            "https://ghproxy.com/https://github.com/apernet/hysteria/releases/download/$HYSTERIA_VERSION/$HY_BIN" \
            "https://mirror.ghproxy.com/https://github.com/apernet/hysteria/releases/download/$HYSTERIA_VERSION/$HY_BIN" \
            "https://ghproxy.net/https://github.com/apernet/hysteria/releases/download/$HYSTERIA_VERSION/$HY_BIN"; do
            echo "Fallback download URL: $HY_URL"
            rm -f "$BIN_PATH"
            if curl -fL --retry 10 --retry-all-errors --retry-delay 3 --connect-timeout 20 --max-time 900 \
                --speed-time 30 --speed-limit 32768 "$HY_URL" -o "$BIN_PATH"; then
                BIN_SIZE=$(wc -c < "$BIN_PATH" | tr -d ' ')
                if [ "\${BIN_SIZE:-0}" -lt 5000000 ]; then
                    echo "WARN: Downloaded binary looks too small (\${BIN_SIZE:-0} bytes), trying next mirror"
                    continue
                fi
                if command -v file >/dev/null 2>&1 && ! file "$BIN_PATH" 2>/dev/null | grep -q "ELF"; then
                    echo "WARN: Downloaded file is not an ELF binary, trying next mirror"
                    continue
                fi
                chmod +x "$BIN_PATH"
                install -m 0755 "$BIN_PATH" /usr/local/bin/hysteria
                DOWNLOADED=1
                break
            fi
        done

        rm -rf "$TMP_DIR"
        if [ "$DOWNLOADED" -ne 1 ]; then
            echo "ERROR: Fallback download failed from all mirrors"
            exit 1
        fi
    fi

    if ! command -v hysteria >/dev/null 2>&1; then
        echo "ERROR: Hysteria binary not found after installation"
        exit 1
    fi

    echo "Done: Hysteria installed ($(hysteria version 2>/dev/null | head -1 || echo 'version unknown'))"
fi

mkdir -p /etc/hysteria /var/lib/hysteria
chmod 755 /etc/hysteria /var/lib/hysteria
echo "Done: Hysteria directories ready"

if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl cat hysteria-server >/dev/null 2>&1 && ! systemctl cat hysteria >/dev/null 2>&1; then
        echo "Creating fallback hysteria-server.service unit..."
        cat > /etc/systemd/system/hysteria-server.service <<'EOFHYUNIT'
[Unit]
Description=Hysteria Server Service
After=network.target nss-lookup.target

[Service]
Type=simple
ExecStart=/usr/local/bin/hysteria server -c /etc/hysteria/config.yaml
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOFHYUNIT
        systemctl daemon-reload
    fi
fi

echo "Hysteria version:"
hysteria version
`;

const SINGBOX_INSTALL_SCRIPT = `#!/bin/bash
set -e

echo "=== [1/4] Installing sing-box ==="
if ! command -v sing-box >/dev/null 2>&1; then
  curl -fsSL https://sing-box.app/install.sh | sh
else
  echo "Done: sing-box already installed"
fi

if ! command -v sing-box >/dev/null 2>&1; then
  echo "ERROR: sing-box binary not found after installation"
  exit 1
fi

mkdir -p /etc/sing-box /var/lib/sing-box
echo "Done: /etc/sing-box and /var/lib/sing-box ready"

echo "=== [2/4] sing-box version ==="
sing-box version

echo "=== [3/4] systemd unit ==="
systemctl daemon-reload
systemctl enable sing-box >/dev/null 2>&1 || true
echo "Done: sing-box service prepared"
`;

function getPortHoppingScript(portRange, mainPort) {
    if (!portRange || !portRange.includes('-')) return '';
    
    const [start, end] = portRange.split('-').map(p => parseInt(p.trim()));
    
    return `
echo "=== [4/5] Setting up port hopping ${start}-${end} -> ${mainPort} ==="

# Clear old rules
iptables -t nat -D PREROUTING -p udp --dport ${start}:${end} -j REDIRECT --to-port ${mainPort} 2>/dev/null || true
ip6tables -t nat -D PREROUTING -p udp --dport ${start}:${end} -j REDIRECT --to-port ${mainPort} 2>/dev/null || true

# Clear legacy interface-specific rules
for iface in eth0 eth1 ens3 ens5 enp0s3 eno1; do
    iptables -t nat -D PREROUTING -i $iface -p udp --dport ${start}:${end} -j REDIRECT --to-port ${mainPort} 2>/dev/null || true
    ip6tables -t nat -D PREROUTING -i $iface -p udp --dport ${start}:${end} -j REDIRECT --to-port ${mainPort} 2>/dev/null || true
done

# Add new rules (no interface binding)
iptables -t nat -A PREROUTING -p udp --dport ${start}:${end} -j REDIRECT --to-port ${mainPort}
ip6tables -t nat -A PREROUTING -p udp --dport ${start}:${end} -j REDIRECT --to-port ${mainPort}
echo "Done: iptables NAT rules added"

# Open ports in firewall (ufw)
if command -v ufw &> /dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow ${start}:${end}/udp 2>/dev/null || true
    echo "Done: UFW rules added"
fi

# Save rules
if command -v netfilter-persistent &> /dev/null; then
    timeout 15s netfilter-persistent save 2>/dev/null || true
    echo "Done: Rules saved with netfilter-persistent"
elif command -v iptables-save &> /dev/null; then
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true
    echo "Done: Rules saved with iptables-save"
fi

echo "Done: Port hopping configured: ${start}-${end} -> ${mainPort}"
`;
}

const SELF_SIGNED_CERT_SCRIPT = `
echo "=== [2/5] Generating self-signed certificate ==="

if ! command -v openssl &> /dev/null; then
    echo "Installing openssl..."
    apt-get update && apt-get install -y openssl
fi

echo "Checking existing certificates..."
ls -la /etc/hysteria/*.pem 2>/dev/null || echo "No existing cert files"

CERT_VALID=0
if [ -f /etc/hysteria/cert.pem ] && [ -s /etc/hysteria/cert.pem ] && [ -f /etc/hysteria/key.pem ] && [ -s /etc/hysteria/key.pem ]; then
    if openssl x509 -in /etc/hysteria/cert.pem -noout 2>/dev/null; then
        echo "Done: Valid certificate already exists"
        CERT_VALID=1
        openssl x509 -in /etc/hysteria/cert.pem -noout -subject -dates
    else
        echo "Warning: Certificate file exists but is invalid, regenerating..."
    fi
fi

if [ "$CERT_VALID" = "0" ]; then
    echo "Generating new certificate..."
    
    rm -f /etc/hysteria/cert.pem /etc/hysteria/key.pem /tmp/ecparam.pem
    mkdir -p /etc/hysteria
    
    echo "Step 1: Generating EC parameters..."
    openssl ecparam -name prime256v1 -out /tmp/ecparam.pem
    if [ ! -f /tmp/ecparam.pem ]; then
        echo "Error: Failed to create EC parameters"
        exit 1
    fi
    echo "Done: EC parameters created"
    
    echo "Step 2: Generating certificate..."
    openssl req -x509 -nodes -newkey ec:/tmp/ecparam.pem \\
        -keyout /etc/hysteria/key.pem \\
        -out /etc/hysteria/cert.pem \\
        -subj "/CN=bing.com" \\
        -days 36500 2>&1
    
    if [ ! -f /etc/hysteria/cert.pem ] || [ ! -s /etc/hysteria/cert.pem ]; then
        echo "Error: Certificate file not created or empty!"
        echo "Trying alternative method with RSA..."
        
        openssl req -x509 -nodes -newkey rsa:2048 \\
            -keyout /etc/hysteria/key.pem \\
            -out /etc/hysteria/cert.pem \\
            -subj "/CN=bing.com" \\
            -days 36500 2>&1
    fi
    
    if [ ! -f /etc/hysteria/key.pem ] || [ ! -s /etc/hysteria/key.pem ]; then
        echo "Error: Key file not created or empty!"
        exit 1
    fi
    
    # Set correct ownership for hysteria user (if exists)
    if id "hysteria" &>/dev/null; then
        chown hysteria:hysteria /etc/hysteria/key.pem /etc/hysteria/cert.pem
        echo "Done: Ownership set to hysteria:hysteria"
    fi
    chmod 600 /etc/hysteria/key.pem
    chmod 644 /etc/hysteria/cert.pem
    rm -f /tmp/ecparam.pem
    
    echo "Step 3: Verifying certificate..."
    if openssl x509 -in /etc/hysteria/cert.pem -noout 2>/dev/null; then
        echo "Done: Certificate generated successfully!"
        openssl x509 -in /etc/hysteria/cert.pem -noout -subject -dates
        ls -la /etc/hysteria/*.pem
    else
        echo "Error: Certificate verification failed!"
        cat /etc/hysteria/cert.pem
        exit 1
    fi
fi
`;

function connectSSH(node) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        
        const connConfig = {
            host: node.ip,
            port: node.ssh?.port || 22,
            username: node.ssh?.username || 'root',
            readyTimeout: 30000,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3,
        };

        const rawPrivateKey = node.ssh?.privateKey || '';
        const rawPassword = node.ssh?.password || '';
        let authConfigured = false;

        if (rawPrivateKey) {
            const decryptedKey = cryptoService.decryptPrivateKey(rawPrivateKey);
            if (decryptedKey && decryptedKey.includes('-----BEGIN')) {
                connConfig.privateKey = decryptedKey;
                authConfigured = true;
            } else if (cryptoService.isEncryptedPayload(rawPrivateKey) && rawPassword) {
                // Key cannot be decrypted with current ENCRYPTION_KEY; fallback to password if present.
                logger.warn(`[NodeSetup] SSH private key for node ${node.name} looks encrypted with another key, falling back to password auth`);
            } else if (cryptoService.isEncryptedPayload(rawPrivateKey)) {
                return reject(new Error('SSH private key cannot be decrypted with current ENCRYPTION_KEY. Re-save SSH credentials in node settings.'));
            } else {
                connConfig.privateKey = rawPrivateKey;
                authConfigured = true;
            }
        }

        if (rawPassword) {
            const decryptedPassword = cryptoService.decryptSafe(rawPassword);
            if (cryptoService.isEncryptedPayload(rawPassword) && decryptedPassword === rawPassword) {
                if (!authConfigured) {
                    return reject(new Error('SSH password cannot be decrypted with current ENCRYPTION_KEY. Re-save SSH credentials in node settings.'));
                }
                logger.warn(`[NodeSetup] SSH password for node ${node.name} looks encrypted with another key; continuing with other auth methods`);
            } else {
                connConfig.password = decryptedPassword;
                connConfig.tryKeyboard = true;
                authConfigured = true;
            }
        }

        if (!authConfigured) {
            return reject(new Error('SSH credentials not provided'));
        }
        
        conn.on('ready', () => resolve(conn));
        conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
            if (!connConfig.password) return finish([]);
            const answers = (prompts || []).map(() => connConfig.password);
            finish(answers);
        });
        conn.on('error', (err) => reject(err));
        conn.connect(connConfig);
    });
}

function execSSH(conn, command, timeoutMsOrOptions = 0, maybeOptions = {}) {
    const options = (timeoutMsOrOptions && typeof timeoutMsOrOptions === 'object')
        ? timeoutMsOrOptions
        : { ...(maybeOptions || {}), timeoutMs: timeoutMsOrOptions };
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 0;
    const onStdoutLine = typeof options.onStdoutLine === 'function' ? options.onStdoutLine : null;
    const onStderrLine = typeof options.onStderrLine === 'function' ? options.onStderrLine : null;

    return new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
            if (err) return reject(err);
            
            let stdout = '';
            let stderr = '';
            let stdoutBuf = '';
            let stderrBuf = '';
            let done = false;
            let timer = null;

            const normalizeChunk = (chunk) => String(chunk || '').replace(/\r/g, '\n');

            const emitBufferedLines = (kind, chunk) => {
                const cb = kind === 'stderr' ? onStderrLine : onStdoutLine;
                if (!cb) return;
                if (!chunk) return;
                if (kind === 'stderr') {
                    stderrBuf += chunk;
                    const parts = stderrBuf.split('\n');
                    stderrBuf = parts.pop() || '';
                    for (const line of parts) {
                        const text = String(line || '').trimEnd();
                        if (!text) continue;
                        try { cb(text); } catch (_) {}
                    }
                } else {
                    stdoutBuf += chunk;
                    const parts = stdoutBuf.split('\n');
                    stdoutBuf = parts.pop() || '';
                    for (const line of parts) {
                        const text = String(line || '').trimEnd();
                        if (!text) continue;
                        try { cb(text); } catch (_) {}
                    }
                }
            };

            const flushBufferedLine = (kind) => {
                const cb = kind === 'stderr' ? onStderrLine : onStdoutLine;
                if (!cb) return;
                const pending = kind === 'stderr' ? stderrBuf : stdoutBuf;
                const text = String(pending || '').trimEnd();
                if (!text) return;
                try { cb(text); } catch (_) {}
                if (kind === 'stderr') stderrBuf = '';
                else stdoutBuf = '';
            };

            const finish = (result) => {
                if (done) return;
                done = true;
                if (timer) clearTimeout(timer);
                flushBufferedLine('stdout');
                flushBufferedLine('stderr');
                resolve(result);
            };

            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    try { stream.close(); } catch (_) {}
                    finish({
                        success: false,
                        output: `${stdout}${stderr ? '\n[STDERR]:\n' + stderr : ''}\n[TIMEOUT]: command exceeded ${timeoutMs}ms`,
                        code: 124,
                        error: `Timeout after ${timeoutMs}ms`,
                    });
                }, timeoutMs);
            }
            
            stream.on('close', (code) => {
                const output = stdout + (stderr ? '\n[STDERR]:\n' + stderr : '');
                
                if (code === 0) {
                    finish({ success: true, output, code, stdout, stderr });
                } else {
                    finish({ success: false, output, code, error: `Exit code: ${code}`, stdout, stderr });
                }
            });
            
            stream.on('data', (data) => {
                const chunk = normalizeChunk(data);
                stdout += chunk;
                emitBufferedLines('stdout', chunk);
            });
            stream.stderr.on('data', (data) => {
                const chunk = normalizeChunk(data);
                stderr += chunk;
                emitBufferedLines('stderr', chunk);
            });
            stream.on('error', (streamErr) => {
                finish({
                    success: false,
                    output: stdout + (stderr ? '\n[STDERR]:\n' + stderr : ''),
                    code: 255,
                    error: streamErr?.message || 'Stream error',
                    stdout,
                    stderr,
                });
            });
        });
    });
}

function uploadFile(conn, content, remotePath) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
            if (err) return reject(err);
            
            const writeStream = sftp.createWriteStream(remotePath);
            writeStream.on('close', () => resolve());
            writeStream.on('error', (err) => reject(err));
            writeStream.write(content);
            writeStream.end();
        });
    });
}

function trimExecOutput(result, max = 700) {
    const output = String(result?.output || '').trim();
    if (!output) return '';
    return output.length > max ? `${output.slice(0, max)}...` : output;
}

function enforceInlineAclForHybrid(nodeConfig, contextLabel = 'Hybrid cascade') {
    const acl = { ...(nodeConfig?.acl || {}) };
    const aclType = String(acl.type || 'inline').toLowerCase();
    if (aclType === 'file') {
        throw new Error(`${contextLabel} requires ACL type "inline". Current ACL type is "file"; switch node ACL to inline rules or disable hybrid sidecar.`);
    }
    nodeConfig.acl = { ...acl, enabled: true, type: 'inline' };
}

function buildHybridHysteriaConfigNode(node, socksPort) {
    const nodeForConfig = { ...(node?.toObject ? node.toObject() : node) };
    const outbounds = Array.isArray(nodeForConfig.outbounds) ? nodeForConfig.outbounds : [];
    const aclRules = Array.isArray(nodeForConfig.aclRules) ? nodeForConfig.aclRules : [];

    nodeForConfig.outbounds = [
        {
            name: CASCADE_SIDECAR_OUTBOUND,
            type: 'socks5',
            addr: `127.0.0.1:${socksPort}`,
        },
        ...outbounds.filter(ob => ob && ob.name !== CASCADE_SIDECAR_OUTBOUND),
    ];
    enforceInlineAclForHybrid(nodeForConfig, `Hybrid cascade on node ${nodeForConfig.name || 'unknown'}`);
    nodeForConfig.aclRules = [
        `${CASCADE_SIDECAR_OUTBOUND}(all)`,
        ...aclRules.filter(rule => !String(rule || '').startsWith(`${CASCADE_SIDECAR_OUTBOUND}(`)),
    ];

    return nodeForConfig;
}

async function getServiceState(conn, serviceNames) {
    const names = (Array.isArray(serviceNames) ? serviceNames : [serviceNames])
        .map(name => String(name || '').trim())
        .filter(Boolean);
    if (names.length === 0) return 'unknown';

    const states = [];
    for (const serviceName of names) {
        const result = await execSSH(
            conn,
            `(systemctl is-active ${shellQuote(serviceName)} 2>/dev/null || true) | head -n 1`
        );
        const state = String(result.output || '').trim().split('\n')[0].trim();
        if (state) states.push(state);
        if (state === 'active') return 'active';
    }

    return states.find(state => state && state !== 'unknown') || states[0] || 'unknown';
}

async function collectServiceDiagnostics(conn, serviceNames, journalLines = 20) {
    const names = (Array.isArray(serviceNames) ? serviceNames : [serviceNames])
        .map(name => String(name || '').trim())
        .filter(Boolean);
    if (names.length === 0) return '';

    const statusParts = [];
    const journalParts = [];

    for (const serviceName of names) {
        const statusResult = await execSSH(
            conn,
            `systemctl status ${shellQuote(serviceName)} --no-pager -l 2>/dev/null || true`
        );
        const statusText = trimExecOutput(statusResult, 900);
        if (statusText) statusParts.push(`[status ${serviceName}] ${statusText}`);
    }

    const journalCmd = names.map(name => `-u ${shellQuote(name)}`).join(' ');
    const journalResult = await execSSH(
        conn,
        `journalctl ${journalCmd} -n ${journalLines} --no-pager 2>/dev/null || true`
    );
    const journalText = trimExecOutput(journalResult, 900);
    if (journalText) journalParts.push(`[journal] ${journalText}`);

    return [...statusParts, ...journalParts].join(' | ');
}

async function waitForServiceActive(conn, serviceNames, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20000;
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 1500;
    const label = options.label || (Array.isArray(serviceNames) ? serviceNames.join(', ') : serviceNames);
    const deadline = Date.now() + timeoutMs;
    let lastState = 'unknown';

    while (Date.now() <= deadline) {
        lastState = await getServiceState(conn, serviceNames);
        if (lastState === 'active') return { state: lastState };
        if (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    const diagnostics = await collectServiceDiagnostics(conn, serviceNames, options.journalLines || 20);
    throw new Error(
        `${label} is not active after restart (state: ${lastState || 'unknown'})${diagnostics ? `. Diagnostics: ${diagnostics}` : ''}`
    );
}

async function assertRemoteFileExists(conn, remotePath, label) {
    const check = await execSSH(conn, `[ -s ${shellQuote(remotePath)} ] && echo ok || echo missing`);
    if (!String(check.output || '').includes('ok')) {
        throw new Error(`${label || remotePath} is missing on remote host (${remotePath})`);
    }
}

async function waitForListeningPort(conn, port, options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 1000;
    const deadline = Date.now() + timeoutMs;
    const portNum = Number(port);

    while (Date.now() <= deadline) {
        const result = await execSSH(
            conn,
            `ss -ltn 2>/dev/null | awk '{print $4}' | grep -F ':${portNum}' >/dev/null && echo listening || echo waiting`
        );
        if (String(result.output || '').includes('listening')) {
            return true;
        }
        if (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    throw new Error(`Port ${portNum} is not listening after service start`);
}

async function waitForListeningSocket(conn, port, options = {}) {
    const protocol = String(options.protocol || 'tcp').toLowerCase() === 'udp' ? 'udp' : 'tcp';
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 1000;
    const deadline = Date.now() + timeoutMs;
    const portNum = Number(port);

    const buildCheck = () => {
        if (protocol === 'udp') {
            return `
if command -v ss >/dev/null 2>&1; then
    ss -lun 2>/dev/null | awk '{print $5}' | grep -F ':${portNum}' >/dev/null && echo listening || echo waiting
elif command -v netstat >/dev/null 2>&1; then
    netstat -lun 2>/dev/null | awk '{print $4}' | grep -F ':${portNum}' >/dev/null && echo listening || echo waiting
else
    echo unknown
fi
            `;
        }
        return `
if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -F ':${portNum}' >/dev/null && echo listening || echo waiting
elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -F ':${portNum}' >/dev/null && echo listening || echo waiting
else
    echo unknown
fi
        `;
    };

    while (Date.now() <= deadline) {
        const result = await execSSH(conn, buildCheck());
        const state = String(result.output || '').trim().split('\n').pop();
        if (state === 'listening' || state === 'unknown') {
            return true;
        }
        if (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    throw new Error(`${protocol.toUpperCase()} port ${portNum} is not listening after service start`);
}

async function pickAvailableTcpPort(conn, preferredPort, candidates = []) {
    const ports = [preferredPort, ...candidates]
        .map(port => Number(port))
        .filter(port => Number.isInteger(port) && port > 0 && port <= 65535);
    const uniquePorts = [...new Set(ports)];
    if (uniquePorts.length === 0) return null;

    const result = await execSSH(conn, `
is_port_used() {
    PORT="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$PORT$" && return 0
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$PORT$" && return 0
    fi
    return 1
}
for PORT in ${uniquePorts.join(' ')}; do
    if ! is_port_used "$PORT"; then
        echo "$PORT"
        exit 0
    fi
done
exit 1
    `, 15000);

    const port = Number(String(result.output || '').trim().split('\n').pop());
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

async function isTcpPortOwnedByXray(conn, port) {
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) return false;
    const result = await execSSH(conn, `
if command -v ss >/dev/null 2>&1; then
    ss -ltnpH 2>/dev/null | awk '$4 ~ /[:.]${portNum}$/ {print}' | grep -qi xray && echo yes || echo no
else
    echo no
fi
    `, 10000);
    return String(result.output || '').trim().split('\n').pop() === 'yes';
}

function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeSetupError(error) {
    const message = String(error?.message || error || 'Unknown error');
    if (message.includes('All configured authentication methods failed')) {
        return `${message}. SSH auth failed: verify username/password/private key. If credentials were saved before ENCRYPTION_KEY changed, re-save SSH credentials in node settings.`;
    }
    if (message.includes('Timed out while waiting for handshake')) {
        return `${message}. SSH handshake timeout: check SSH daemon, IP/port reachability, and firewall rules.`;
    }
    return message;
}

function hasNonEmptyToken(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function generateCascadeSidecarServiceUnit(configPath) {
    return `[Unit]
Description=Xray Cascade Sidecar
After=network.target nss-lookup.target hysteria-server.service

[Service]
User=nobody
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE
NoNewPrivileges=true
Type=simple
ExecStart=/usr/local/bin/xray run -config ${configPath}
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
`;
}

async function resolvePanelFirewallIp() {
    const host = String(config.PANEL_DOMAIN || config.BASE_URL || '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .trim();

    if (!host) {
        return { ip: '0.0.0.0/0', source: 'empty-host' };
    }

    if (net.isIP(host)) {
        return { ip: host, source: 'direct-ip' };
    }

    try {
        const resolved = await dns.lookup(host, { family: 4 });
        if (resolved?.address) {
            return { ip: resolved.address, source: `dns:${host}` };
        }
    } catch (_) {
        // handled by fallback below
    }

    return { ip: '0.0.0.0/0', source: `dns-failed:${host}` };
}

async function setupHysteriaNode(node, options = {}) {
    const { installHysteria = true, setupPortHopping = true, restartService = true } = options;
    const onLogLine = typeof options.onLogLine === 'function' ? options.onLogLine : null;

    const logs = [];
    const pushLiveLine = (line, source = 'stdout') => {
        if (!onLogLine || !line) return;
        const text = String(line).trimEnd();
        if (!text) return;
        onLogLine(source === 'stderr' ? `[STDERR] ${text}` : text);
    };
    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        logs.push(line);
        pushLiveLine(line);
        logger.info(`[NodeSetup] ${msg}`);
    };

    log(`Starting setup for ${node.name} (${node.ip})`);

    const settings = await Settings.get();
    const authInsecure = settings?.nodeAuth?.insecure ?? true;
    const authUrl = `${config.BASE_URL}/api/auth`;
    log(`Auth URL: ${authUrl} (insecure: ${authInsecure})`);

    let conn;
    let useTlsFiles = false;
    try {
        log('Connecting via SSH...');
        conn = await connectSSH(node);
        log('SSH connected');

        const execRemote = (command, timeoutMs = 0) => execSSH(conn, command, {
            timeoutMs,
            onStdoutLine: (line) => pushLiveLine(line, 'stdout'),
            onStderrLine: (line) => pushLiveLine(line, 'stderr'),
        });

        if (installHysteria) {
            log('Installing Hysteria runtime...');
            const installResult = await execRemote(HYSTERIA_INSTALL_SCRIPT);
            if (!onLogLine && installResult.output) logs.push(installResult.output);
            if (!installResult.success) {
                throw new Error(`Hysteria installation failed (exit code ${installResult.code}): ${installResult.error}`);
            }
            await assertRemoteFileExists(conn, '/usr/local/bin/hysteria', 'Hysteria binary');
            log('Hysteria runtime installed');
        }

        const isSameVpsSetup = await isSameVpsAsPanel(node);
        if (isSameVpsSetup) {
            log(`Same-VPS setup detected (node IP: ${node.ip}, panel domain: ${config.PANEL_DOMAIN})`);
            log('Note: Hysteria main listener uses UDP/QUIC, so it can coexist with panel TCP services.');

            const sameHostTcpConflicts = getHysteriaSameHostTcpConflicts(node);
            if (sameHostTcpConflicts.length > 0) {
                const msg = `Port conflict detected for same-host Hysteria setup: ${sameHostTcpConflicts.join(', ')}. ` +
                    'The panel already uses TCP 80/443 on this server. Remove these masquerade listeners or move them to different ports.';
                log(`ERROR: ${msg}`);
                return { success: false, error: msg, logs, useTlsFiles: false };
            }

            log('Attempting to copy panel certificates to node...');
            const panelCerts = getPanelCertificates(config.PANEL_DOMAIN);
            if (panelCerts) {
                await uploadFile(conn, panelCerts.cert, '/etc/hysteria/cert.pem');
                await uploadFile(conn, panelCerts.key, '/etc/hysteria/key.pem');
                const permsResult = await execRemote(`
chmod 644 /etc/hysteria/cert.pem
chmod 600 /etc/hysteria/key.pem
if id "hysteria" &>/dev/null; then
    chown hysteria:hysteria /etc/hysteria/cert.pem /etc/hysteria/key.pem
fi
echo "Done: Panel certificates copied to node"
ls -la /etc/hysteria/*.pem
                `);
                if (!onLogLine && permsResult.output) logs.push(permsResult.output);
                log('Panel certificates copied successfully');
                useTlsFiles = true;
            } else {
                log('Warning: could not read panel certificates, falling back to self-signed');
                const certResult = await execRemote(SELF_SIGNED_CERT_SCRIPT);
                if (!onLogLine && certResult.output) logs.push(certResult.output);
                if (!certResult.success) {
                    throw new Error(`Certificate generation failed: ${certResult.error || `exit ${certResult.code}`}`);
                }
                useTlsFiles = true;
            }
        } else if (!node.domain) {
            log('No domain specified, generating self-signed certificate...');
            const certResult = await execRemote(SELF_SIGNED_CERT_SCRIPT);
            if (!onLogLine && certResult.output) logs.push(certResult.output);
            if (!certResult.success) {
                throw new Error(`Certificate generation failed: ${certResult.error || `exit ${certResult.code}`}`);
            }
            log('Certificate ready (self-signed)');
            useTlsFiles = true;
        } else {
            log(`Domain detected (${node.domain}), ACME mode will be used`);
            log('Opening port 80 for ACME HTTP-01 challenge...');
            const acmeSetup = await execRemote(`
echo "=== Setting up for ACME ==="
mkdir -p /etc/hysteria/acme
chmod 700 /etc/hysteria/acme
chmod 755 /etc/hysteria
echo "Done: ACME directory created with correct permissions"
ls -la /etc/hysteria/
if command -v iptables &> /dev/null; then
    iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p udp --dport 80 -j ACCEPT 2>/dev/null || true
    echo "Done: Port 80 opened in iptables"
fi
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 80/udp 2>/dev/null || true
    echo "Done: Port 80 opened in ufw"
fi
if ss -tlnp | grep -q ':80 '; then
    echo "⚠️  Warning: Port 80 is already in use:"
    ss -tlnp | grep ':80 '
else
    echo "Done: Port 80 is free"
fi
echo "Done: ACME preparation complete"
echo "Note: Make sure DNS for ${node.domain} points to this server's IP!"
            `);
            if (!onLogLine && acmeSetup.output) logs.push(acmeSetup.output);
            if (!acmeSetup.success) {
                throw new Error(`ACME preparation failed: ${acmeSetup.error || `exit ${acmeSetup.code}`}`);
            }
            log('ACME preparation done');
        }

        const hybridSidecarEnabled = config.FEATURE_CASCADE_HYBRID && (node?.cascadeSidecar?.enabled !== false);
        const rawSidecar = hybridSidecarEnabled ? (node?.cascadeSidecar || {}) : {};
        const socksPort = Number(rawSidecar.socksPort) > 0 ? Number(rawSidecar.socksPort) : 11080;
        const rawServiceName = String(rawSidecar.serviceName || 'xray-cascade').trim() || 'xray-cascade';
        const serviceName = rawServiceName.endsWith('.service')
            ? (rawServiceName.slice(0, -8) || 'xray-cascade')
            : rawServiceName;
        const serviceUnitName = `${serviceName}.service`;
        const sidecarConfigPath = (typeof rawSidecar.configPath === 'string' && rawSidecar.configPath.trim().startsWith('/'))
            ? rawSidecar.configPath.trim()
            : '/usr/local/etc/xray-cascade/config.json';
        const nodeForConfig = hybridSidecarEnabled
            ? buildHybridHysteriaConfigNode(node, socksPort)
            : node;

        log('Uploading config...');
        const hysteriaConfig = configGenerator.generateNodeConfig(nodeForConfig, authUrl, { authInsecure, useTlsFiles });
        if (hybridSidecarEnabled && !hysteriaConfig.includes(CASCADE_SIDECAR_OUTBOUND)) {
            throw new Error(`Hybrid cascade overlay marker ${CASCADE_SIDECAR_OUTBOUND} is missing from generated Hysteria config`);
        }
        await uploadFile(conn, hysteriaConfig, '/etc/hysteria/config.yaml');
        if (hybridSidecarEnabled) {
            const overlayCheck = await execRemote(`grep -F ${shellQuote(CASCADE_SIDECAR_OUTBOUND)} /etc/hysteria/config.yaml >/dev/null && echo ok || echo missing`);
            if (!String(overlayCheck.output || '').includes('ok')) {
                throw new Error(`Hybrid cascade overlay marker ${CASCADE_SIDECAR_OUTBOUND} is missing from /etc/hysteria/config.yaml after upload`);
            }
        }
        log('Config uploaded to /etc/hysteria/config.yaml');
        logs.push('--- Config content ---');
        logs.push(hysteriaConfig);
        logs.push('--- End config ---');

        if (hybridSidecarEnabled) {
            log(`Preparing hybrid sidecar runtime (${serviceUnitName}, socks:${socksPort})...`);
            try {
                const xrayInstallResult = await execRemote(XRAY_INSTALL_SCRIPT);
                if (!onLogLine && xrayInstallResult.output) logs.push(xrayInstallResult.output);
                if (!xrayInstallResult.success) {
                    throw new Error(`Xray install failed (${xrayInstallResult.error || `exit ${xrayInstallResult.code}`})`);
                }
                await assertRemoteFileExists(conn, '/usr/local/bin/xray', 'Xray binary');

                const sidecarConfig = configGenerator.generateXrayCascadeSidecarConfig(socksPort);
                const sidecarDir = path.dirname(sidecarConfigPath);
                await execRemote(`mkdir -p ${shellQuote(sidecarDir)}`);
                await uploadFile(conn, sidecarConfig, sidecarConfigPath);
                await uploadFile(conn, generateCascadeSidecarServiceUnit(sidecarConfigPath), `/etc/systemd/system/${serviceUnitName}`);
                await assertRemoteFileExists(conn, sidecarConfigPath, 'Hybrid sidecar config');

                const sidecarStart = await execRemote(`
systemctl daemon-reload
systemctl enable ${shellQuote(serviceUnitName)}
systemctl restart ${shellQuote(serviceUnitName)}
                `);
                if (!onLogLine && sidecarStart.output) logs.push(sidecarStart.output);
                if (!sidecarStart.success) {
                    throw new Error(`${serviceUnitName} restart failed: ${sidecarStart.error || `exit ${sidecarStart.code}`}`);
                }
                await waitForServiceActive(conn, [serviceUnitName], { label: serviceUnitName, timeoutMs: 25000, journalLines: 20 });
                await waitForListeningPort(conn, socksPort, { timeoutMs: 15000 });
                log(`Hybrid sidecar ready: ${serviceUnitName}`);
            } catch (sidecarErr) {
                throw new Error(`Hybrid sidecar setup failed: ${sidecarErr.message}`);
            }
        }

        if (setupPortHopping && node.portRange) {
            log(`Setting up port hopping (${node.portRange})...`);
            const portHoppingScript = getPortHoppingScript(node.portRange, node.port || 443);
            if (portHoppingScript) {
                const hopResult = await execRemote(portHoppingScript, 180000);
                if (!onLogLine && hopResult.output) logs.push(hopResult.output);
                if (!hopResult.success) {
                    log(`Port hopping setup warning: ${hopResult.error}`);
                } else {
                    log('Port hopping configured');
                }
            }
        }

        const statsPort = node.statsPort || 9999;
        const mainPort = node.port || 443;
        log(`Opening firewall ports (${mainPort}, ${statsPort})...`);
        const firewallResult = await execRemote(`
echo "=== [5/6] Opening firewall ports ==="
if command -v iptables &> /dev/null; then
    iptables -I INPUT -p tcp --dport ${mainPort} -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p udp --dport ${mainPort} -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p tcp --dport ${statsPort} -j ACCEPT 2>/dev/null || true
    echo "Done: Ports ${mainPort}, ${statsPort} opened in iptables"
fi
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    ufw allow ${mainPort}/tcp 2>/dev/null || true
    ufw allow ${mainPort}/udp 2>/dev/null || true
    ufw allow ${statsPort}/tcp 2>/dev/null || true
    echo "Done: Ports ${mainPort}, ${statsPort} opened in ufw"
fi
echo "Done: Firewall configured"
        `);
        if (!onLogLine && firewallResult.output) logs.push(firewallResult.output);
        if (!firewallResult.success) {
            throw new Error(`Firewall configuration failed: ${firewallResult.error || `exit ${firewallResult.code}`}`);
        }
        log('Firewall ports opened');

        if (restartService) {
            log('Restarting Hysteria service...');
            const restartResult = await execRemote(`
echo "=== [6/6] Restarting Hysteria service ==="
systemctl daemon-reload
systemctl enable hysteria-server 2>/dev/null || systemctl enable hysteria 2>/dev/null || true
systemctl restart hysteria-server 2>/dev/null || systemctl restart hysteria 2>/dev/null
sleep 3
echo "Service status:"
systemctl status hysteria-server --no-pager -l 2>/dev/null || systemctl status hysteria --no-pager -l 2>/dev/null || true
echo ""
echo "Journal logs (last 20 lines):"
journalctl -u hysteria-server -u hysteria -n 20 --no-pager || true
            `);
            if (!onLogLine && restartResult.output) logs.push(restartResult.output);
            if (!restartResult.success) {
                throw new Error(`Hysteria service restart failed: ${restartResult.error || `exit ${restartResult.code}`}`);
            }
            await waitForServiceActive(conn, ['hysteria-server', 'hysteria'], {
                label: 'Hysteria service',
                timeoutMs: 25000,
                journalLines: 20,
            });
            await waitForListeningSocket(conn, mainPort, { protocol: 'udp', timeoutMs: 15000 });
            log('Hysteria service restarted');
        }

        log('Hysteria setup completed successfully!');
        return { success: true, logs, useTlsFiles };
    } catch (error) {
        const normalizedError = normalizeSetupError(error);
        log(`Error: ${normalizedError}`);
        return { success: false, error: normalizedError, logs, useTlsFiles: false };
    } finally {
        if (conn) {
            conn.end();
        }
    }
}

async function setupNode(node, options = {}) {
    return setupHysteriaNode(node, options);
}

async function checkNodeStatus(node) {
    try {
        const conn = await connectSSH(node);
        
        try {
            const result = await execSSH(conn, `
H1=$(systemctl is-active hysteria-server 2>/dev/null || true)
H2=$(systemctl is-active hysteria 2>/dev/null || true)
if [ "$H1" = "active" ] || [ "$H2" = "active" ]; then
    echo active
elif [ -n "$H1" ] && [ "$H1" != "unknown" ]; then
    echo "$H1"
elif [ -n "$H2" ]; then
    echo "$H2"
else
    echo unknown
fi
            `);
            return result.output.trim() === 'active' ? 'online' : 'offline';
        } finally {
            conn.end();
        }
    } catch (error) {
        return 'error';
    }
}

async function getNodeLogs(node, lines = 50) {
    try {
        const conn = await connectSSH(node);
        
        try {
            const result = await execSSH(conn, `journalctl -u hysteria-server -u hysteria -n ${lines} --no-pager`);
            return { success: true, logs: result.output };
        } finally {
            conn.end();
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== XRAY SETUP ====================

const XRAY_INSTALL_SCRIPT = `#!/bin/bash

echo "=== [1/4] Installing Xray-core ==="
echo "Checking system..."
echo "OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'"' -f2 || uname -a)"
echo "Arch: $(uname -m)"

install_pkg() {
    PKG="$1"

    if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -y && apt-get install -y "$PKG"
        return $?
    fi

    if command -v dnf >/dev/null 2>&1; then
        dnf install -y "$PKG"
        return $?
    fi

    if command -v yum >/dev/null 2>&1; then
        yum install -y "$PKG"
        return $?
    fi

    if command -v apk >/dev/null 2>&1; then
        apk add --no-cache "$PKG"
        return $?
    fi

    echo "ERROR: No supported package manager found to install $PKG"
    return 1
}

# Xray installer may call tput; ensure TERM exists in non-interactive SSH sessions
if [ -z "\${TERM:-}" ]; then
    export TERM=dumb
fi

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "curl not found, installing..."
    install_pkg curl
fi

# Ensure CA certificates exist for HTTPS downloads
if ! command -v update-ca-certificates &> /dev/null && ! [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    echo "ca-certificates may be missing, trying to install..."
    install_pkg ca-certificates || true
fi

if ! command -v xray &> /dev/null; then
    echo "Xray not found. Installing via official script..."
    INSTALL_OK=0
    INSTALLER_URLS="
https://raw.githubusercontent.com/XTLS/Xray-install/main/install-release.sh
https://github.com/XTLS/Xray-install/raw/main/install-release.sh
"

    for ATTEMPT in 1 2 3; do
        echo "Attempt $ATTEMPT/3: downloading Xray installer..."

        for INSTALLER_URL in $INSTALLER_URLS; do
            echo "Installer URL: $INSTALLER_URL"
            rm -f /tmp/xray-install.sh
            if ! curl -fL --retry 8 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 300 \
                "$INSTALLER_URL" -o /tmp/xray-install.sh; then
                echo "WARN: Failed to download installer from $INSTALLER_URL"
                continue
            fi

            if [ ! -s /tmp/xray-install.sh ]; then
                echo "WARN: Installer is empty ($INSTALLER_URL)"
                rm -f /tmp/xray-install.sh
                continue
            fi

            SCRIPT_SIZE=$(wc -c < /tmp/xray-install.sh | tr -d ' ')
            if [ "\${SCRIPT_SIZE:-0}" -lt 10000 ] || ! grep -qi "xray" /tmp/xray-install.sh; then
                echo "WARN: Installer content looks invalid (size=\${SCRIPT_SIZE:-0})"
                echo "First lines:"
                head -n 5 /tmp/xray-install.sh || true
                rm -f /tmp/xray-install.sh
                continue
            fi

            chmod +x /tmp/xray-install.sh
            echo "Attempt $ATTEMPT/3: running installer..."
            INSTALL_EXIT=0
            bash /tmp/xray-install.sh install 2>&1 || INSTALL_EXIT=$?
            rm -f /tmp/xray-install.sh

            if [ $INSTALL_EXIT -eq 0 ] && command -v xray &> /dev/null; then
                INSTALL_OK=1
                break 2
            fi

            echo "WARN: Installer run failed from $INSTALLER_URL (exit: $INSTALL_EXIT)"
        done

        if [ "$ATTEMPT" -lt 3 ]; then
            sleep $((ATTEMPT * 3))
        fi
    done

    if [ "$INSTALL_OK" -ne 1 ]; then
        echo "Official installer failed, trying mirror fallback..."
        ARCH=$(uname -m)
        XRAY_VERSION="v26.3.27"

        if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then
            XRAY_PKG="Xray-linux-64.zip"
        elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            XRAY_PKG="Xray-linux-arm64-v8a.zip"
        else
            echo "ERROR: Unsupported architecture for Xray fallback: $ARCH"
            exit 1
        fi

        if ! command -v unzip &> /dev/null; then
            echo "unzip not found, installing..."
            install_pkg unzip
        fi

        TMP_DIR=$(mktemp -d)
        ZIP_PATH="$TMP_DIR/xray.zip"
        DOWNLOADED=0
        CHECKSUM_URLS="
https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG.dgst
https://ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG.dgst
https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG.dgst
https://ghproxy.net/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG.dgst
"

        for XRAY_URL in \
            "https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG" \
            "https://ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG" \
            "https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG" \
            "https://ghproxy.net/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG"; do
            echo "Fallback download URL: $XRAY_URL"
            rm -f "$ZIP_PATH"
            if curl -fL --retry 10 --retry-all-errors --retry-delay 3 --connect-timeout 20 --max-time 900 \
                --speed-time 30 --speed-limit 32768 "$XRAY_URL" -o "$ZIP_PATH"; then
                ZIP_SIZE=$(wc -c < "$ZIP_PATH" | tr -d ' ')
                if [ "\${ZIP_SIZE:-0}" -lt 5000000 ]; then
                    echo "WARN: Downloaded archive looks too small (\${ZIP_SIZE:-0} bytes), trying next mirror"
                    continue
                fi
                if ! unzip -tq "$ZIP_PATH" >/dev/null 2>&1; then
                    echo "WARN: Archive integrity check failed, trying next mirror"
                    continue
                fi

                EXPECTED_SHA256=""
                for CHECKSUM_URL in $CHECKSUM_URLS; do
                    rm -f "$TMP_DIR/xray.dgst"
                    if curl -fL --retry 5 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 60 \
                        "$CHECKSUM_URL" -o "$TMP_DIR/xray.dgst"; then
                        EXPECTED_SHA256=$(grep -Eo '[A-Fa-f0-9]{64}' "$TMP_DIR/xray.dgst" | head -n 1 || true)
                        if [ -n "$EXPECTED_SHA256" ]; then
                            break
                        fi
                    fi
                done

                if [ -z "$EXPECTED_SHA256" ]; then
                    echo "WARN: Could not fetch checksum for $XRAY_PKG, trying next mirror"
                    continue
                fi

                if command -v sha256sum >/dev/null 2>&1; then
                    ACTUAL_SHA256=$(sha256sum "$ZIP_PATH" | awk '{print $1}')
                elif command -v openssl >/dev/null 2>&1; then
                    ACTUAL_SHA256=$(openssl dgst -sha256 "$ZIP_PATH" | awk '{print $2}')
                else
                    echo "WARN: No checksum tool available, trying next mirror"
                    continue
                fi

                if [ "$EXPECTED_SHA256" != "$ACTUAL_SHA256" ]; then
                    echo "WARN: Archive checksum mismatch, trying next mirror"
                    continue
                fi

                DOWNLOADED=1
                break
            fi
        done

        if [ "$DOWNLOADED" -ne 1 ]; then
            rm -rf "$TMP_DIR"
            echo "ERROR: Fallback download failed from all mirrors"
            exit 1
        fi

        if ! unzip -o "$ZIP_PATH" -d "$TMP_DIR/xray" >/dev/null 2>&1; then
            rm -rf "$TMP_DIR"
            echo "ERROR: Failed to unpack fallback Xray archive"
            exit 1
        fi

        if [ ! -f "$TMP_DIR/xray/xray" ]; then
            rm -rf "$TMP_DIR"
            echo "ERROR: xray binary missing in fallback archive"
            exit 1
        fi

        install -m 0755 "$TMP_DIR/xray/xray" /usr/local/bin/xray
        mkdir -p /usr/local/share/xray
        [ -f "$TMP_DIR/xray/geoip.dat" ] && install -m 0644 "$TMP_DIR/xray/geoip.dat" /usr/local/share/xray/geoip.dat || true
        [ -f "$TMP_DIR/xray/geosite.dat" ] && install -m 0644 "$TMP_DIR/xray/geosite.dat" /usr/local/share/xray/geosite.dat || true
        rm -rf "$TMP_DIR"

        if command -v xray &> /dev/null; then
            INSTALL_OK=1
            echo "Done: Xray installed via fallback mirror ($(xray version | head -1))"
        fi
    fi

    if [ "$INSTALL_OK" -ne 1 ]; then
        echo "ERROR: Xray installation failed after retries and mirror fallback"
        exit 1
    fi

    echo "Done: Xray installed ($(xray version | head -1))"
else
    echo "Done: Xray already installed ($(xray version | head -1))"
fi

mkdir -p /usr/local/etc/xray /var/log/xray
touch /var/log/xray/access.log /var/log/xray/error.log
chmod 755 /var/log/xray
chmod 644 /var/log/xray/access.log /var/log/xray/error.log
echo "Done: Xray directories ready"
`;

/**
 * Generate x25519 keys for Xray Reality via SSH
 * Supports multiple output formats:
 * - Old: "Private key: xxx\nPublic key: xxx"
 * - New: "PrivateKey: xxx\nPublicKey: xxx"
 * @returns {{ privateKey: string, publicKey: string } | null}
 */
async function generateX25519Keys(conn) {
    const result = await execSSH(conn, 'xray x25519');
    if (!result.success) {
        throw new Error(`Failed to generate x25519 keys: ${result.output}`);
    }
    const output = result.output;
    
    // Try different formats (case-insensitive, with/without space)
    const privMatch = output.match(/Private\s*[Kk]ey:\s*(\S+)/i);
    const pubMatch = output.match(/Public\s*[Kk]ey:\s*(\S+)/i);
    
    if (!privMatch || !pubMatch) {
        // Fallback: try to extract first two base64-like strings
        const base64Pattern = /:\s*([A-Za-z0-9_-]{40,})/g;
        const matches = [...output.matchAll(base64Pattern)];
        if (matches.length >= 2) {
            return { privateKey: matches[0][1], publicKey: matches[1][1] };
        }
        throw new Error(`Could not parse x25519 output: ${output}`);
    }
    return { privateKey: privMatch[1], publicKey: pubMatch[1] };
}

async function getRemoteXrayVersion(conn) {
    const result = await execSSH(conn, 'xray version 2>/dev/null | head -1');
    if (!result.success) return '';
    const firstLine = String(result.output || '').trim().split('\n')[0].trim();
    const match = firstLine.match(/Xray\s+([0-9][0-9A-Za-z.\-]*)/i);
    return match ? match[1] : '';
}

async function getRemoteSingboxVersion(conn) {
    const result = await execSSH(conn, 'sing-box version 2>/dev/null | head -1');
    if (!result.success) return '';
    const firstLine = String(result.output || '').trim().split('\n')[0].trim();
    const match = firstLine.match(/sing-box\s+version\s+([0-9][0-9A-Za-z.\-]*)/i);
    return match ? match[1] : '';
}

async function getRemoteSingboxBinaryPath(conn) {
    const result = await execSSH(conn, 'command -v sing-box 2>/dev/null || true');
    const binaryPath = String(result.output || '').trim().split('\n')[0].trim();
    return binaryPath || '';
}

async function generateSingboxRealityKeys(conn) {
    const result = await execSSH(conn, 'sing-box generate reality-keypair 2>/dev/null || true');
    if (!result.success) {
        throw new Error(`Failed to generate Sing-box reality keypair: ${result.error || 'unknown error'}`);
    }
    const output = String(result.output || '');
    const privateKey = output.match(/PrivateKey:\s*([^\s]+)/i)?.[1] || '';
    const publicKey = output.match(/PublicKey:\s*([^\s]+)/i)?.[1] || '';
    if (!privateKey || !publicKey) {
        throw new Error('Unable to parse Sing-box reality keypair output');
    }
    return { privateKey, publicKey };
}

/**
 * Setup Xray node via SSH:
 * 1. Install xray-core
 * 2. Generate x25519 Reality keys (if security=reality and no keys yet)
 * 3. Upload config.json
 * 4. Open firewall ports
 * 5. Enable and restart xray service
 *
 * @param {Object} node - Node document
 * @param {Object} options - { restartService }
 * @returns {{ success, logs, realityKeys? }}
 */
async function setupXrayNode(node, options = {}) {
    const { restartService = true, exitOnly = false } = options;
    const onLogLine = typeof options.onLogLine === 'function' ? options.onLogLine : null;

    const logs = [];
    const pushLiveLine = (line, source = 'stdout') => {
        if (!onLogLine || !line) return;
        const text = String(line).trimEnd();
        if (!text) return;
        onLogLine(source === 'stderr' ? `[STDERR] ${text}` : text);
    };
    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        logs.push(line);
        pushLiveLine(line);
        logger.info(`[XraySetup] ${msg}`);
    };

    log(`Starting Xray setup for ${node.name} (${node.ip})${exitOnly ? ' [exit/bridge mode]' : ''}`);

    if (!exitOnly) {
        // Detect port conflict: Xray on the same VPS as the panel (Caddy) using port 443/80
        const sameVps = await isSameVpsAsPanel(node);
        const nodePort = node.port || 443;
        if (sameVps && (nodePort === 443 || nodePort === 80)) {
            const msg = `Port conflict detected: Xray port ${nodePort} is already used by the panel (Caddy) on this server. ` +
                `Use a different port (e.g. 8443) for the Xray node. ` +
                `After changing the port, save the node and run Auto Setup again.`;
            log(`ERROR: ${msg}`);
            return { success: false, error: msg, logs, realityKeys: null };
        }

        if (sameVps) {
            log(`Same-VPS setup detected (node port: ${nodePort}, panel domain: ${config.PANEL_DOMAIN})`);
        }
    }

    let conn;
    let generatedKeys = null;

    try {
        log('Connecting via SSH...');
        conn = await connectSSH(node);
        log('SSH connected');
        const execRemote = (command, timeoutMs = 0) => execSSH(conn, command, {
            timeoutMs,
            onStdoutLine: (line) => pushLiveLine(line, 'stdout'),
            onStderrLine: (line) => pushLiveLine(line, 'stderr'),
        });

        // Install Xray
        log('Installing Xray-core...');
        const installResult = await execRemote(XRAY_INSTALL_SCRIPT);
        if (!onLogLine && installResult.output) logs.push(installResult.output);
        if (!installResult.success) {
            throw new Error(`Xray installation failed: ${installResult.error}`);
        }
        await assertRemoteFileExists(conn, '/usr/local/bin/xray', 'Xray binary');
        log('Xray-core installed');

        const xrayVersion = await getRemoteXrayVersion(conn);
        if (xrayVersion) {
            const HyNode = require('../models/hyNodeModel');
            await HyNode.updateOne({ _id: node._id }, { $set: { xrayVersion } });
            node.xrayVersion = xrayVersion;
            log(`Detected Xray version: ${xrayVersion}`);
        }

        const requestedPort = Number(node.port) || 443;
        if (!exitOnly && (requestedPort === 443 || requestedPort === 80)) {
            if (await isTcpPortOwnedByXray(conn, requestedPort)) {
                log(`Port ${requestedPort} is already used by Xray; keeping existing public port.`);
            } else {
                const pickedPort = await pickAvailableTcpPort(conn, requestedPort, [8443, 2053, 2083, 2087, 2096, 9443, 10443]);
                if (!pickedPort) {
                    throw new Error(`Could not find a free TCP port for Xray. Checked ${requestedPort}, 8443, 2053, 2083, 2087, 2096, 9443, 10443.`);
                }
                if (pickedPort !== requestedPort) {
                    const HyNode = require('../models/hyNodeModel');
                    await HyNode.updateOne({ _id: node._id }, { $set: { port: pickedPort } });
                    node.port = pickedPort;
                    log(`Port ${requestedPort} is busy on the node; switched Xray public port to ${pickedPort} and saved it.`);
                } else {
                    log(`Port ${requestedPort} is free for Xray`);
                }
            }
        }

        // Exit (Bridge) nodes: skip config upload, firewall, and service start.
        // Persist Reality material so the later cascade deploy can render a valid config.
        if (exitOnly) {
            const xrayCfg = node.xray || {};
            if (xrayCfg.security === 'reality') {
                const updates = {};
                let needsUpdate = false;

                if (!xrayCfg.realityPrivateKey) {
                    log('Generating x25519 Reality keys for exit-only node...');
                    generatedKeys = await generateX25519Keys(conn);
                    log(`Reality keys generated. PublicKey: ${generatedKeys.publicKey}`);
                    updates['xray.realityPrivateKey'] = generatedKeys.privateKey;
                    updates['xray.realityPublicKey'] = generatedKeys.publicKey;
                    node.xray = { ...node.xray, realityPrivateKey: generatedKeys.privateKey, realityPublicKey: generatedKeys.publicKey };
                    needsUpdate = true;
                }

                const currentShortIds = xrayCfg.realityShortIds || [''];
                const hasRealShortId = currentShortIds.some(id => id && id.length > 0);
                if (!hasRealShortId) {
                    const shortId = require('crypto').randomBytes(8).toString('hex');
                    log(`Generated exit-only shortId: ${shortId}`);
                    updates['xray.realityShortIds'] = ['', shortId];
                    node.xray = { ...node.xray, realityShortIds: ['', shortId] };
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    const HyNode = require('../models/hyNodeModel');
                    await HyNode.updateOne({ _id: node._id }, { $set: updates });
                    log('Exit-only Reality settings saved to database');
                }
            }

            log('Exit node setup completed (Xray binary only). Deploy a cascade link to configure.');
            if (conn) conn.end();
            return { success: true, logs, realityKeys: null };
        }

        // Generate Reality keys and shortId if needed
        const xrayCfg = node.xray || {};
        if (xrayCfg.security === 'reality') {
            const updates = {};
            let needsUpdate = false;

            // Generate x25519 keys if not set
            if (!xrayCfg.realityPrivateKey) {
                log('Generating x25519 Reality keys...');
                generatedKeys = await generateX25519Keys(conn);
                log(`Reality keys generated. PublicKey: ${generatedKeys.publicKey}`);
                updates['xray.realityPrivateKey'] = generatedKeys.privateKey;
                updates['xray.realityPublicKey'] = generatedKeys.publicKey;
                node.xray = { ...node.xray, realityPrivateKey: generatedKeys.privateKey, realityPublicKey: generatedKeys.publicKey };
                needsUpdate = true;
            }

            // Generate shortId if not set or only contains empty string
            const currentShortIds = xrayCfg.realityShortIds || [''];
            const hasRealShortId = currentShortIds.some(id => id && id.length > 0);
            if (!hasRealShortId) {
                const shortId = require('crypto').randomBytes(8).toString('hex'); // 16 hex chars
                log(`Generated shortId: ${shortId}`);
                updates['xray.realityShortIds'] = ['', shortId]; // empty + random
                node.xray = { ...node.xray, realityShortIds: ['', shortId] };
                needsUpdate = true;
            }

            // Save to DB
            if (needsUpdate) {
                const HyNode = require('../models/hyNodeModel');
                await HyNode.updateOne({ _id: node._id }, { $set: updates });
                log('Reality settings saved to database');
            }
        }

        // Generate and upload config
        log('Generating Xray config...');
        const configGenerator = require('./configGenerator');
        const syncService = require('./syncService');
        const users = await syncService._getUsersForNode(node);
        const configContent = configGenerator.generateXrayConfig(node, users);
        const configPath = '/usr/local/etc/xray/config.json';

        await uploadFile(conn, configContent, configPath);
        await assertRemoteFileExists(conn, configPath, 'Xray config');
        log(`Config uploaded to ${configPath} (${users.length} users)`);
        logs.push('--- Config preview ---');
        logs.push(configContent.substring(0, 500) + (configContent.length > 500 ? '\n...' : ''));
        logs.push('--- End config preview ---');

        // Open firewall ports
        const mainPort = node.port || 443;
        const apiPort = (node.xray || {}).apiPort || 61000;
        log(`Opening firewall ports (${mainPort}, api:${apiPort})...`);
        const firewallResult = await execRemote(`
echo "=== Opening firewall ports ==="
if command -v iptables &> /dev/null; then
    iptables -I INPUT -p tcp --dport ${mainPort} -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p udp --dport ${mainPort} -j ACCEPT 2>/dev/null || true
    echo "Done: iptables rules added"
fi
if command -v ufw &> /dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow ${mainPort}/tcp 2>/dev/null || true
    ufw allow ${mainPort}/udp 2>/dev/null || true
    echo "Done: UFW rules added"
fi
echo "Done: Firewall configured"
        `);
        if (!onLogLine && firewallResult.output) logs.push(firewallResult.output);
        log('Firewall configured');

        if (restartService) {
            log('Installing systemd service and starting Xray...');
            const serviceContent = configGenerator.generateXraySystemdService();
            await uploadFile(conn, serviceContent, '/etc/systemd/system/xray.service');
            const restartResult = await execRemote(`
echo "=== Starting Xray service ==="
systemctl daemon-reload
systemctl enable xray
systemctl restart xray
sleep 2
echo "Service status:"
systemctl status xray --no-pager -l || true
echo ""
echo "Journal (last 15 lines):"
journalctl -u xray -n 15 --no-pager || true
            `);
            if (!onLogLine && restartResult.output) logs.push(restartResult.output);
            if (!restartResult.success) {
                throw new Error(`Xray service restart failed: ${restartResult.error || `exit ${restartResult.code}`}`);
            }
            await waitForServiceActive(conn, ['xray'], {
                label: 'Xray service',
                timeoutMs: 25000,
                journalLines: 20,
            });
            log('Xray service started');
        }

        log('Xray setup completed successfully!');
        return { success: true, logs, realityKeys: generatedKeys };

    } catch (error) {
        const normalizedError = normalizeSetupError(error);
        log(`Error: ${normalizedError}`);
        return { success: false, error: normalizedError, logs, realityKeys: generatedKeys };

    } finally {
        if (conn) conn.end();
    }
}

async function setupSingboxNode(node, options = {}) {
    const { restartService = true } = options;

    const logs = [];
    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        logs.push(line);
        logger.info(`[SingboxSetup] ${msg}`);
    };

    log(`Starting Sing-box setup for ${node.name} (${node.ip})`);

    if (node.type !== 'xray') {
        return { success: false, error: 'Sing-box PoC currently supports only Xray-type nodes', logs };
    }

    const transport = node.xray?.transport || 'tcp';
    if (transport !== 'tcp') {
        return { success: false, error: 'Sing-box PoC currently supports only TCP transport', logs };
    }

    const sameVps = await isSameVpsAsPanel(node);
    const nodePort = node.port || 443;
    if (sameVps && (nodePort === 443 || nodePort === 80)) {
        const msg = `Port conflict detected: Sing-box port ${nodePort} is already used by the panel on this server. Use a different port (for example 8443).`;
        log(`ERROR: ${msg}`);
        return { success: false, error: msg, logs };
    }

    let conn;
    let generatedKeys = null;

    try {
        log('Connecting via SSH...');
        conn = await connectSSH(node);
        log('SSH connected');

        log('Installing sing-box...');
        const installResult = await execSSH(conn, SINGBOX_INSTALL_SCRIPT);
        logs.push(installResult.output);
        if (!installResult.success) {
            throw new Error(`Sing-box installation failed: ${installResult.error}`);
        }
        const binaryPath = await getRemoteSingboxBinaryPath(conn);
        if (!binaryPath) {
            throw new Error('Sing-box binary is missing on remote host');
        }
        log(`Sing-box installed (${binaryPath})`);

        const singboxVersion = await getRemoteSingboxVersion(conn);
        if (singboxVersion) {
            const HyNode = require('../models/hyNodeModel');
            await HyNode.updateOne({ _id: node._id }, { $set: { runtimeVersion: singboxVersion } });
            log(`Detected Sing-box version: ${singboxVersion}`);
        }

        const xrayCfg = node.xray || {};
        if (xrayCfg.security === 'reality') {
            const updates = {};
            let needsUpdate = false;

            if (!xrayCfg.realityPrivateKey) {
                log('Generating Reality keys for Sing-box...');
                generatedKeys = await generateSingboxRealityKeys(conn);
                updates['xray.realityPrivateKey'] = generatedKeys.privateKey;
                updates['xray.realityPublicKey'] = generatedKeys.publicKey;
                node.xray = { ...node.xray, realityPrivateKey: generatedKeys.privateKey, realityPublicKey: generatedKeys.publicKey };
                needsUpdate = true;
                log(`Reality keys generated. PublicKey: ${generatedKeys.publicKey}`);
            }

            const currentShortIds = xrayCfg.realityShortIds || [''];
            const hasRealShortId = currentShortIds.some(id => id && id.length > 0);
            if (!hasRealShortId) {
                const shortId = require('crypto').randomBytes(8).toString('hex');
                updates['xray.realityShortIds'] = [shortId];
                node.xray = { ...node.xray, realityShortIds: [shortId] };
                needsUpdate = true;
                log(`Generated shortId: ${shortId}`);
            }

            if (needsUpdate) {
                const HyNode = require('../models/hyNodeModel');
                await HyNode.updateOne({ _id: node._id }, { $set: updates });
                log('Reality settings saved to database');
            }
        }

        const syncService = require('./syncService');
        const CascadeLink = require('../models/cascadeLinkModel');
        const role = node.cascadeRole || 'standalone';
        const isHopRole = ['bridge', 'relay'].includes(role);
        const activeForwardLinks = isHopRole
            ? await CascadeLink.find({ bridgeNode: node._id, active: true, mode: 'forward' }).lean()
            : [];
        const downstreamForwardLinks = role === 'relay'
            ? await syncService._getForwardChainLinks(node._id)
            : [];
        const activeReverseLinkCount = isHopRole
            ? await CascadeLink.countDocuments({ bridgeNode: node._id, active: true, mode: 'reverse' })
            : 0;

        if (isHopRole && activeReverseLinkCount > 0) {
            throw new Error('Sing-box PoC currently supports only forward cascade bridge/relay nodes');
        }

        let users = [];
        let configContent;
        if (isHopRole) {
            if (activeForwardLinks.length > 0) {
                log(`Generating Sing-box forward-hop config (${activeForwardLinks.length} link(s))...`);
            } else {
                log('No active forward cascade links yet, generating placeholder Sing-box hop config...');
            }
            configContent = role === 'relay' && activeForwardLinks.length > 0 && downstreamForwardLinks.length > 0
                ? configGenerator.generateSingboxForwardRelayConfig(activeForwardLinks, downstreamForwardLinks)
                : configGenerator.generateSingboxForwardHopConfig(activeForwardLinks);
        } else {
            users = await syncService._getUsersForNode(node);
            configContent = configGenerator.generateSingboxConfig(node, users);
        }
        const configPath = '/etc/sing-box/config.json';

        await uploadFile(conn, configContent, configPath);
        await assertRemoteFileExists(conn, configPath, 'Sing-box config');
        log(`Config uploaded to ${configPath} (${users.length} users)`);

        const validateResult = await execSSH(conn, `sing-box check -c ${configPath}`);
        logs.push(validateResult.output);
        if (!validateResult.success) {
            throw new Error(`Sing-box config validation failed: ${validateResult.error || `exit ${validateResult.code}`}`);
        }
        log('Sing-box config validated');

        const firewallPorts = isHopRole
            ? [...new Set(activeForwardLinks.map(link => Number(link.tunnelPort || 10086)).filter(Boolean))]
            : [node.port || 443];
        log(`Opening firewall ports (${firewallPorts.join(', ') || 'none'})...`);
        const firewallResult = await execSSH(conn, `
echo "=== Opening firewall ports ==="
if command -v iptables &> /dev/null; then
    ${firewallPorts.map(port => `iptables -I INPUT -p tcp --dport ${port} -j ACCEPT 2>/dev/null || true
    iptables -I INPUT -p udp --dport ${port} -j ACCEPT 2>/dev/null || true`).join('\n    ')}
    echo "Done: iptables rules added"
fi
if command -v ufw &> /dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ${firewallPorts.map(port => `ufw allow ${port}/tcp 2>/dev/null || true
    ufw allow ${port}/udp 2>/dev/null || true`).join('\n    ')}
    echo "Done: UFW rules added"
fi
echo "Done: Firewall configured"
        `);
        logs.push(firewallResult.output);

        if (restartService) {
            log('Starting Sing-box service...');
            const restartResult = await execSSH(conn, `
echo "=== Starting Sing-box service ==="
systemctl daemon-reload
systemctl enable sing-box >/dev/null 2>&1 || true
systemctl restart sing-box
sleep 2
echo "Service status:"
systemctl status sing-box --no-pager -l || true
echo ""
echo "Journal (last 15 lines):"
journalctl -u sing-box -n 15 --no-pager || true
            `);
            logs.push(restartResult.output);
            if (!restartResult.success) {
                throw new Error(`Sing-box service restart failed: ${restartResult.error || `exit ${restartResult.code}`}`);
            }
            await waitForServiceActive(conn, ['sing-box'], {
                label: 'Sing-box service',
                timeoutMs: 25000,
                journalLines: 20,
            });
            if (isHopRole) {
                for (const port of firewallPorts) {
                    await waitForListeningPort(conn, port, { timeoutMs: 15000 });
                }
            } else {
                await waitForListeningPort(conn, node.port || 443, { timeoutMs: 15000 });
            }
            log('Sing-box service started');
        }

        log('Sing-box setup completed successfully!');
        return { success: true, logs, realityKeys: generatedKeys };
    } catch (error) {
        const normalizedError = normalizeSetupError(error);
        log(`Error: ${normalizedError}`);
        return { success: false, error: normalizedError, logs, realityKeys: generatedKeys };
    } finally {
        if (conn) conn.end();
    }
}

/**
 * Check Xray service status via SSH
 */
async function checkXrayNodeStatus(node) {
    try {
        const conn = await connectSSH(node);
        try {
            const result = await execSSH(conn, 'systemctl is-active xray');
            return result.output.trim() === 'active' ? 'online' : 'offline';
        } finally {
            conn.end();
        }
    } catch (error) {
        return 'error';
    }
}

async function checkSingboxNodeStatus(node) {
    try {
        const conn = await connectSSH(node);
        try {
            const result = await execSSH(conn, 'systemctl is-active sing-box');
            return result.output.trim() === 'active' ? 'online' : 'offline';
        } finally {
            conn.end();
        }
    } catch (error) {
        return 'error';
    }
}

/**
 * Get Xray node logs via SSH
 */
async function getXrayNodeLogs(node, lines = 50) {
    try {
        const conn = await connectSSH(node);
        try {
            const result = await execSSH(conn, `journalctl -u xray -n ${lines} --no-pager`);
            return { success: true, logs: result.output };
        } finally {
            conn.end();
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getSingboxNodeLogs(node, lines = 50) {
    try {
        const conn = await connectSSH(node);
        try {
            const result = await execSSH(conn, `journalctl -u sing-box -n ${lines} --no-pager`);
            return { success: true, logs: result.output };
        } finally {
            conn.end();
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==================== CC AGENT SETUP ====================

/**
 * Generate a secure random token for the CC Agent
 */
function generateAgentToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Install and configure cc-agent on an Xray node via SSH.
 *
 * Flow:
 *  1. Download binary from GitHub releases (or fallback URL)
 *  2. Write /etc/cc-agent/config.json with token + TLS settings
 *  3. If TLS: generate self-signed cert with openssl
 *  4. Open port in firewall only for the panel's IP
 *  5. Install & start cc-agent.service
 *
 * @param {Object} conn  - Active ssh2 connection
 * @param {Object} node  - Node document
 * @param {string} token - Pre-generated agent token
 * @param {string} panelIp - Panel's outbound IP (for firewall whitelist)
 * @param {Function} log - Logging callback
 * @returns {{ success, agentVersion }}
 */
async function installCCAgent(conn, node, token, panelIp, log, streamLine = null) {
    const agentPort = (node.xray || {}).agentPort || 62080;
    const useTls = (node.xray || {}).agentTls !== false;
    const apiPort = (node.xray || {}).apiPort || 61000;
    const inboundTag = (node.xray || {}).inboundTag || 'vless-in';

    const agentConfig = {
        listen: `0.0.0.0:${agentPort}`,
        token: token,
        xray_api: `127.0.0.1:${apiPort}`,
        inbound_tag: inboundTag,
        data_dir: '/var/lib/cc-agent',
        access_log: '/var/log/xray/access.log',
        session_window_seconds: 900,
        tls: {
            enabled: useTls,
            cert: '/etc/cc-agent/cert.pem',
            key: '/etc/cc-agent/key.pem',
        },
    };

    const configJson = JSON.stringify(agentConfig, null, 2);

    // TLS setup: generate self-signed certificate with openssl
    const tlsSetupScript = useTls ? `
echo "=== Generating self-signed TLS cert for cc-agent ==="
openssl req -x509 -nodes -newkey rsa:2048 \\
    -keyout /etc/cc-agent/key.pem \\
    -out /etc/cc-agent/cert.pem \\
    -subj "/CN=cc-agent" -days 36500 2>&1
chmod 600 /etc/cc-agent/key.pem /etc/cc-agent/cert.pem
echo "Done: TLS cert generated"
` : `
echo "TLS disabled, skipping cert generation"
`;

    const AGENT_INSTALL = `#!/bin/bash
set -euo pipefail

echo "=== [1/5] Downloading CC Agent ==="
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    BIN_NAME="cc-agent-linux-arm64"
else
    BIN_NAME="cc-agent-linux-amd64"
fi

GITHUB_URL="https://github.com/ClickDevTech/CELERITY-panel/releases/latest/download/$BIN_NAME"
MIRROR_URL_1="https://ghproxy.com/https://github.com/ClickDevTech/CELERITY-panel/releases/latest/download/$BIN_NAME"
MIRROR_URL_2="https://mirror.ghproxy.com/https://github.com/ClickDevTech/CELERITY-panel/releases/latest/download/$BIN_NAME"
MIRROR_URL_3="https://ghproxy.net/https://github.com/ClickDevTech/CELERITY-panel/releases/latest/download/$BIN_NAME"

# Clean up any previous broken/stale binary before downloading
rm -f /usr/local/bin/cc-agent

DOWNLOADED=0

for ATTEMPT in 1 2 3; do
    echo "Download attempt $ATTEMPT/3..."
    for URL in "$GITHUB_URL" "$MIRROR_URL_1" "$MIRROR_URL_2" "$MIRROR_URL_3"; do
        echo "Trying: $URL"
        rm -f /usr/local/bin/cc-agent
        if curl -fL --retry 6 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 180 \
            "$URL" -o /usr/local/bin/cc-agent 2>/dev/null && [ -s /usr/local/bin/cc-agent ]; then
            chmod +x /usr/local/bin/cc-agent
            echo "Done: cc-agent downloaded"
            DOWNLOADED=1
            break 2
        fi
    done
    sleep $((ATTEMPT * 2))
done

# Validate the downloaded file is a real ELF binary, not an error page
if [ "$DOWNLOADED" = "1" ]; then
    if command -v file &>/dev/null && ! file /usr/local/bin/cc-agent 2>/dev/null | grep -q "ELF"; then
        echo "WARNING: Downloaded file does not appear to be a valid binary (got: $(file /usr/local/bin/cc-agent 2>/dev/null || echo 'unknown'))"
        rm -f /usr/local/bin/cc-agent
        DOWNLOADED=0
    fi
fi

if [ "$DOWNLOADED" = "0" ]; then
    echo "ERROR: Could not download cc-agent binary from any source."
    exit 1
fi

echo "=== [2/5] Creating directories ==="
mkdir -p /etc/cc-agent /var/lib/cc-agent /var/log/xray
touch /var/log/xray/access.log /var/log/xray/error.log
chmod 755 /var/log/xray
chmod 644 /var/log/xray/access.log /var/log/xray/error.log

echo "=== [3/5] Writing config ==="
cat > /etc/cc-agent/config.json << 'EOFCONFIG'
${configJson}
EOFCONFIG
echo "Done: config written"

${tlsSetupScript}

echo "=== [4/5] Installing systemd service ==="
cat > /etc/systemd/system/cc-agent.service << 'EOFSVC'
[Unit]
Description=CC Xray Agent
After=network.target xray.service

[Service]
Type=simple
ExecStart=/usr/local/bin/cc-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOFSVC

echo "=== [5/5] Opening firewall for panel IP ${panelIp} ==="
if command -v iptables &> /dev/null; then
    if [ "${panelIp}" = "0.0.0.0/0" ]; then
        iptables -I INPUT -p tcp --dport ${agentPort} -j ACCEPT 2>/dev/null || true
    else
        iptables -I INPUT -p tcp -s ${panelIp} --dport ${agentPort} -j ACCEPT 2>/dev/null || true
    fi
    echo "Done: iptables rule added"
fi
if command -v ufw &> /dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    if [ "${panelIp}" = "0.0.0.0/0" ]; then
        ufw allow ${agentPort}/tcp 2>/dev/null || true
    else
        ufw allow from ${panelIp} to any port ${agentPort} proto tcp 2>/dev/null || true
    fi
    echo "Done: ufw rule added"
fi

echo "=== Starting cc-agent ==="
systemctl daemon-reload
systemctl enable cc-agent
systemctl restart cc-agent
sleep 2

AGENT_STATE=$(systemctl is-active cc-agent 2>/dev/null || true)
if [ "$AGENT_STATE" != "active" ]; then
    echo "ERROR: cc-agent failed to start (state=$AGENT_STATE)"
    journalctl -u cc-agent -n 30 --no-pager || true
    exit 1
fi
echo "cc-agent: running"
echo "Done: cc-agent installed"
`;

    const result = await execSSH(conn, AGENT_INSTALL, {
        onStdoutLine: typeof streamLine === 'function'
            ? (line) => streamLine(line, 'stdout')
            : null,
        onStderrLine: typeof streamLine === 'function'
            ? (line) => streamLine(line, 'stderr')
            : null,
    });
    const agentVersion = result.output.match(/cc-agent[:\s]+(v[\d.]+)/)?.[1] || 'installed';
    return { success: result.success, agentVersion, output: result.output };
}

/**
 * Ensure Xray node has a non-empty agent token persisted in DB.
 * Generates and saves one if token is missing/empty.
 */
async function ensureXrayAgentToken(node, log = null) {
    const HyNode = require('../models/hyNodeModel');
    const nodeId = node?._id || node;

    if (!nodeId) {
        throw new Error('[AgentSetup] Cannot ensure agent token: missing node id');
    }

    const current = await HyNode.findById(nodeId).select('name xray.agentToken').lean();
    if (!current) {
        throw new Error('[AgentSetup] Cannot ensure agent token: node not found');
    }

    let token = hasNonEmptyToken(current?.xray?.agentToken)
        ? current.xray.agentToken.trim()
        : '';

    if (!token) {
        token = generateAgentToken();
        await HyNode.updateOne({ _id: nodeId }, { $set: { 'xray.agentToken': token } });
        if (typeof log === 'function') {
            log(`Generated and persisted agent token: ${token.substring(0, 8)}...`);
        }
    }

    return token;
}

/**
 * Install or repair cc-agent for an Xray node.
 * Token is guaranteed to be present in DB even if installation fails.
 */
async function setupOrRepairXrayAgent(node, options = {}) {
    const strictAgent = options.strictAgent !== false;
    const onLogLine = typeof options.onLogLine === 'function' ? options.onLogLine : null;
    const log = typeof options.log === 'function'
        ? options.log
        : (msg) => logger.info(`[AgentSetup] ${msg}`);
    const includeInstallerOutput = options.includeInstallerOutput !== false;
    const streamLine = (line, source = 'stdout') => {
        if (!onLogLine || !line) return;
        const text = String(line).trimEnd();
        if (!text) return;
        onLogLine(source === 'stderr' ? `[STDERR] ${text}` : text);
    };

    const token = await ensureXrayAgentToken(node, log);

    let conn;
    let agentResult = { success: false, agentVersion: '', output: '' };
    let installError = null;

    try {
        log('Connecting via SSH for agent installation...');
        conn = await connectSSH(node);

        const panelIpInfo = await resolvePanelFirewallIp();
        const panelIp = panelIpInfo.ip;
        log(`Panel IP for firewall: ${panelIp}`);
        if (panelIp === '0.0.0.0/0') {
            log(`Warning: failed to resolve panel host (${panelIpInfo.source}), firewall rule will be opened to all sources`);
        }

        const nodeWithToken = {
            ...(typeof node.toObject === 'function' ? node.toObject() : node),
            xray: {
                ...(node.xray || {}),
                agentToken: token,
            },
        };

        log('Installing CC Agent...');
        agentResult = await installCCAgent(conn, nodeWithToken, token, panelIp, log, streamLine);
        if (!agentResult.success) {
            const msg = `Agent install failed: ${agentResult.output || 'unknown error'}`;
            if (strictAgent) {
                throw new Error(msg);
            }
            log(`Agent install warning: ${msg}`);
        } else {
            log(`Agent installed: ${agentResult.agentVersion}`);
        }

        const agentSanity = await execSSH(conn, `
if [ -x /usr/local/bin/cc-agent ]; then
  STATE=$(systemctl is-active cc-agent 2>/dev/null || true)
  echo "state:$STATE"
else
  echo "state:missing-binary"
fi
        `, {
            onStdoutLine: (line) => streamLine(line, 'stdout'),
            onStderrLine: (line) => streamLine(line, 'stderr'),
        });
        const sanityState = String(agentSanity.output || '').trim().split(':').pop();
        if (sanityState !== 'active') {
            const msg = `Agent sanity check failed (state=${sanityState || 'unknown'})`;
            if (strictAgent) {
                throw new Error(msg);
            }
            log(`Warning: ${msg}`);
        }
    } catch (error) {
        installError = error;
    } finally {
        if (conn) conn.end();
    }

    const HyNode = require('../models/hyNodeModel');
    await HyNode.updateOne(
        { _id: node._id },
        {
            $set: {
                'xray.agentToken': token,
                agentVersion: agentResult.agentVersion || '',
                agentStatus: 'unknown',
            },
        },
    );

    const verify = await HyNode.findById(node._id).select('xray.agentToken').lean();
    if (!hasNonEmptyToken(verify?.xray?.agentToken)) {
        await HyNode.updateOne({ _id: node._id }, { $set: { 'xray.agentToken': token } });
        log('Agent token was empty after setup; restored from fail-safe copy');
    }

    if (installError && strictAgent) {
        throw installError;
    }

    return {
        success: !installError,
        token,
        agentVersion: agentResult.agentVersion || '',
        output: includeInstallerOutput ? String(agentResult.output || '') : '',
        error: installError ? installError.message : '',
    };
}

/**
 * Setup Xray node + CC Agent via SSH.
 * Extends setupXrayNode to also install the agent.
 */
async function setupXrayNodeWithAgent(node, options = {}) {
    const { strictAgent = true } = options;
    const onLogLine = typeof options.onLogLine === 'function' ? options.onLogLine : null;
    const result = await setupXrayNode(node, { ...options, onLogLine });

    if (!result.success) {
        return result;
    }

    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}`;
        result.logs.push(line);
        if (onLogLine) onLogLine(line);
        logger.info(`[AgentSetup] ${msg}`);
    };
    try {
        const agentState = await setupOrRepairXrayAgent(node, {
            strictAgent,
            log,
            includeInstallerOutput: true,
            onLogLine,
        });

        if (agentState.output && !onLogLine) {
            result.logs.push(agentState.output);
        }
        result.agentToken = agentState.token;
        result.agentInstallSuccess = agentState.success;

    } catch (error) {
        const line = `[${new Date().toISOString()}] Agent install error: ${error.message}`;
        result.logs.push(line);
        logger.error(`[AgentSetup] ${error.message}`);
        try {
            result.agentToken = await ensureXrayAgentToken(node, log);
        } catch (_) {}
        if (strictAgent) {
            result.success = false;
            result.error = `CC Agent setup failed: ${error.message}`;
        }
    }

    return result;
}

module.exports = {
    setupHysteriaNode,
    setupNode,
    checkNodeStatus,
    getNodeLogs,
    connectSSH,
    execSSH,
    uploadFile,
    setupXrayNode,
    setupXrayNodeWithAgent,
    setupSingboxNode,
    installCCAgent,
    ensureXrayAgentToken,
    setupOrRepairXrayAgent,
    generateAgentToken,
    generateX25519Keys,
    checkXrayNodeStatus,
    getXrayNodeLogs,
    checkSingboxNodeStatus,
    getSingboxNodeLogs,
    getPanelCertificates,
    isSameVpsAsPanel,
    pickSameHostNodePort,
};
