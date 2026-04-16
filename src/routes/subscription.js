/**
 * API подписок Hysteria 2
 * 
 * Единый роут /api/files/:token:
 * - Браузер → HTML страница
 * - Приложение → подписка в нужном формате
 * 
 * С кэшированием в Redis для высокой производительности
 */

const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const HyUser = require('../models/hyUserModel');
const HyNode = require('../models/hyNodeModel');
const cache = require('../services/cacheService');
const logger = require('../utils/logger');
const { getNodesByGroups, getSettings, parseDurationSeconds, normalizeHopInterval } = require('../utils/helpers');

// ==================== HELPERS ====================

function detectFormat(userAgent) {
    const ua = (userAgent || '').toLowerCase();
    // Shadowrocket ожидает base64-encoded URI list
    if (/shadowrocket/.test(ua)) return 'shadowrocket';
    // Happ (Xray-core) ожидает plain URI list
    if (/happ/.test(ua)) return 'uri';
    // sing-box based clients — проверяем ДО clash, т.к. Hiddify UA содержит "ClashMeta"
    // Пример: "HiddifyNext/4.0.5 (android) like ClashMeta v2ray sing-box"
    if (/hiddify|hiddifynext|sing-?box|nekobox|nekoray|neko|sfi|sfa|sfm|sft|karing/.test(ua)) return 'singbox';
    if (/clash|stash|surge|loon/.test(ua)) return 'clash';
    return 'uri';
}

function isBrowser(req) {
    const accept = req.headers.accept || '';
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    return accept.includes('text/html') && /mozilla|chrome|safari|edge|opera/.test(ua);
}

async function getUserByToken(token) {
    // Один запрос вместо двух (оптимизация)
    const user = await HyUser.findOne({
        $or: [
            { subscriptionToken: token },
            { userId: token }
        ]
    })
        .populate('nodes', 'active name type status onlineUsers maxOnlineUsers rankingCoefficient domain sni ip port portRange hopInterval portConfigs obfs flag xray')
        .populate('groups', '_id name subscriptionTitle maxDevices');
    
    return user;
}

/**
 * Получить название подписки для пользователя
 * Берётся subscriptionTitle первой группы или name группы
 */
function getSubscriptionTitle(user) {
    if (!user.groups || user.groups.length === 0) {
        return 'Hysteria';
    }
    
    // Берём первую группу
    const group = user.groups[0];
    return group.subscriptionTitle || group.name || 'Hysteria';
}

/**
 * Кодирует название в base64 (как в Marzban)
 */
function encodeTitle(text) {
    return `base64:${Buffer.from(text).toString('base64')}`;
}

function normalizeHeaderText(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeHappText(value) {
    const text = normalizeHeaderText(value);
    if (!text) return '';
    return /[^\x20-\x7E]/.test(text)
        ? `base64:${Buffer.from(text, 'utf8').toString('base64')}`
        : text;
}

function calculateUserDeviceLimit(user) {
    let deviceLimit = parseInt(user?.maxDevices, 10);
    if (deviceLimit === -1) return 0;
    if (deviceLimit > 0) return deviceLimit;

    const groupLimits = (user?.groups || [])
        .map(group => parseInt(group?.maxDevices, 10))
        .filter(limit => Number.isFinite(limit) && limit > 0);
    if (groupLimits.length === 0) return 0;
    return Math.min(...groupLimits);
}

function formatTrafficValue(bytes) {
    const gb = (bytes || 0) / (1024 * 1024 * 1024);
    if (gb >= 100) return `${Math.round(gb)} GB`;
    if (gb >= 10) return `${gb.toFixed(1)} GB`;
    return `${gb.toFixed(2)} GB`;
}

function resolveSupportState(user, settings) {
    const supportSettings = settings?.subscription?.happ?.support || {};
    const dueAt = user?.support?.dueAt ? new Date(user.support.dueAt) : null;
    if (!supportSettings.enabled) {
        return { dueAt, state: 'disabled' };
    }
    if (!dueAt || Number.isNaN(dueAt.getTime())) {
        return { dueAt: null, state: 'neutral' };
    }
    return { dueAt, state: dueAt.getTime() >= Date.now() ? 'active' : 'overdue' };
}

function appendPart(parts, value) {
    const normalized = normalizeHeaderText(value);
    if (normalized) parts.push(normalized);
}

function buildHappRoutingProfile(routing) {
    if (!routing || !routing.enabled || !routing.rules || routing.rules.length === 0) return null;

    const domesticDns = (routing.dns && routing.dns.domestic) || '77.88.8.8';
    const remoteDns = (routing.dns && routing.dns.remote) || 'tls://1.1.1.1';
    const profile = {
        Name: 'Auto',
        GlobalProxy: 'true',
        DomainStrategy: 'IPIfNonMatch',
        FakeDNS: 'false',
        DirectSites: [],
        DirectIp: [
            '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
            '169.254.0.0/16', '224.0.0.0/4', '255.255.255.255',
        ],
        ProxySites: [],
        ProxyIp: [],
        BlockSites: [],
        BlockIp: [],
    };

    if (remoteDns.startsWith('tls://')) {
        profile.RemoteDNSType = 'DoT';
        profile.RemoteDNSIP = remoteDns.slice(6);
        profile.RemoteDNSDomain = '';
    } else if (remoteDns.startsWith('https://')) {
        profile.RemoteDNSType = 'DoH';
        profile.RemoteDNSDomain = remoteDns;
        profile.RemoteDNSIP = '1.1.1.1';
        try {
            const hostname = new URL(remoteDns).hostname;
            profile.DnsHosts = { [hostname]: profile.RemoteDNSIP };
        } catch {}
    } else {
        profile.RemoteDNSType = 'DoU';
        profile.RemoteDNSIP = remoteDns;
        profile.RemoteDNSDomain = '';
    }

    profile.DomesticDNSType = 'DoU';
    profile.DomesticDNSIP = domesticDns;
    profile.DomesticDNSDomain = '';

    for (const rule of routing.rules) {
        if (!rule.enabled) continue;

        let siteVal = null;
        if (rule.type === 'geosite') siteVal = `geosite:${rule.value}`;
        else if (rule.type === 'domain_suffix') siteVal = `domain:${rule.value.replace(/^\./, '')}`;
        else if (rule.type === 'domain') siteVal = `full:${rule.value}`;
        else if (rule.type === 'domain_keyword') siteVal = `keyword:${rule.value}`;

        let ipVal = null;
        if (rule.type === 'geoip') ipVal = `geoip:${rule.value}`;
        else if (rule.type === 'ip_cidr') ipVal = rule.value;

        if (rule.action === 'direct') {
            if (siteVal) profile.DirectSites.push(siteVal);
            if (ipVal) profile.DirectIp.push(ipVal);
        } else if (rule.action === 'block') {
            if (siteVal) profile.BlockSites.push(siteVal);
            if (ipVal) profile.BlockIp.push(ipVal);
        }
    }

    return profile;
}

/**
 * Получить активные ноды (с кэшированием)
 */
async function getActiveNodesWithCache() {
    const cached = await cache.getActiveNodes();
    if (cached) return cached;

    // Include type, xray, obfs, and cascadeRole fields needed for URI generation and filtering
    const nodes = await HyNode.find({ active: true })
        .select('name type flag ip domain sni port portRange hopInterval portConfigs obfs active status onlineUsers maxOnlineUsers rankingCoefficient groups xray cascadeRole')
        .lean();
    await cache.setActiveNodes(nodes);
    return nodes;
}

async function getActiveNodes(user) {
    let nodes = [];
    let settings;
    
    // Check if user has linked nodes
    if (user.nodes && user.nodes.length > 0) {
        // User has linked nodes - only need settings
        nodes = user.nodes.filter(n => n && n.active);
        settings = await getSettings();
        logger.debug(`[Sub] User ${user.userId}: ${nodes.length} linked active nodes`);
    } else {
        // No linked nodes - fetch nodes and settings in parallel for better performance
        const [allNodes, loadedSettings] = await Promise.all([
            getActiveNodesWithCache(),
            getSettings()
        ]);
        settings = loadedSettings;
        
        // Filter by user groups
        const userGroupIds = (user.groups || []).map(g => g._id?.toString() || g.toString());
        nodes = allNodes.filter(n => {
            const nodeGroupIds = (n.groups || []).map(g => g._id?.toString() || g.toString());
            if (userGroupIds.length === 0) {
                return nodeGroupIds.length === 0;
            }
            return nodeGroupIds.some(gId => userGroupIds.includes(gId));
        });
        
        logger.debug(`[Sub] User ${user.userId}: ${nodes.length} nodes by groups`);
    }
    
    const lb = settings.loadBalancing || {};
    
    // Exclude exit (bridge) and relay nodes — users connect to entry (portal) or standalone nodes only.
    // Traffic is routed through the cascade automatically.
    {
        const beforeCascadeFilter = nodes.length;
        nodes = nodes.filter(n => n.cascadeRole !== 'bridge' && n.cascadeRole !== 'relay');
        if (nodes.length < beforeCascadeFilter) {
            logger.debug(`[Sub] Filtered out ${beforeCascadeFilter - nodes.length} bridge/relay nodes from subscription`);
        }
    }

    // Фильтрация перегруженных нод (если включено)
    if (lb.hideOverloaded) {
        const beforeFilter = nodes.length;
        nodes = nodes.filter(n => {
            if (!n.maxOnlineUsers || n.maxOnlineUsers === 0) return true;
            return n.onlineUsers < n.maxOnlineUsers;
        });
        if (nodes.length < beforeFilter) {
            logger.debug(`[Sub] Filtered out ${beforeFilter - nodes.length} overloaded nodes`);
        }
    }
    
    // Логируем статусы нод (debug уровень для снижения нагрузки)
    if (nodes.length > 0) {
        const statuses = nodes.map(n => `${n.name}:${n.status}(${n.onlineUsers}/${n.maxOnlineUsers || '∞'})`).join(', ');
        logger.debug(`[Sub] Nodes for ${user.userId}: ${statuses}`);
    } else {
        logger.warn(`[Sub] NO NODES for user ${user.userId}! Check: active=true, groups match`);
    }
    
    // Sort nodes: by load percentage when LB is enabled, otherwise by rankingCoefficient
    if (lb.enabled) {
        nodes.sort((a, b) => {
            const loadA = a.maxOnlineUsers ? a.onlineUsers / a.maxOnlineUsers : 0;
            const loadB = b.maxOnlineUsers ? b.onlineUsers / b.maxOnlineUsers : 0;
            if (loadA !== loadB) return loadA - loadB;
            if (a.onlineUsers !== b.onlineUsers) return a.onlineUsers - b.onlineUsers;
            return (a.rankingCoefficient || 1) - (b.rankingCoefficient || 1);
        });
        logger.debug(`[Sub] Load balancing applied`);
    } else {
        nodes.sort((a, b) => (a.rankingCoefficient || 1) - (b.rankingCoefficient || 1));
    }

    return nodes;
}

function validateUser(user) {
    if (!user) return { valid: false, error: 'Not found' };
    if (!user.enabled) return { valid: false, error: 'Inactive' };
    if (user.expireAt && new Date(user.expireAt) < new Date()) return { valid: false, error: 'Expired' };
    if (user.trafficLimit > 0) {
        const used = (user.traffic?.tx || 0) + (user.traffic?.rx || 0);
        if (used >= user.trafficLimit) return { valid: false, error: 'Traffic exceeded' };
    }
    return { valid: true };
}

function getNodeConfigs(node) {
    const configs = [];
    const host = node.domain || node.ip;
    // SNI logic:
    // - If domain is set (ACME): SNI MUST be domain (server's sniGuard will reject other values)
    // - If no domain (self-signed): can use custom SNI for domain fronting
    const sni = node.domain ? node.domain : (node.sni || '');
    // hasCert: true if domain is set (ACME = valid cert)
    const hasCert = !!node.domain;
    const hopInterval = node.hopInterval || '';
    
    const obfs = node.obfs?.type || '';
    const obfsPassword = node.obfs?.password || '';

    if (node.portConfigs && node.portConfigs.length > 0) {
        node.portConfigs.filter(c => c.enabled).forEach(cfg => {
            configs.push({
                name: cfg.name || `Port ${cfg.port}`,
                host,
                port: cfg.port,
                portRange: cfg.portRange || '',
                hopInterval,
                sni,
                hasCert,
                obfs,
                obfsPassword,
            });
        });
    } else {
        configs.push({ name: 'TLS', host, port: node.port || 443, portRange: '', hopInterval, sni, hasCert, obfs, obfsPassword });
        // Порт 80 убран (используется для ACME)
        if (node.portRange) {
            configs.push({ name: 'Hopping', host, port: node.port || 443, portRange: node.portRange, hopInterval, sni, hasCert, obfs, obfsPassword });
        }
    }
    
    return configs;
}


// ==================== URI GENERATION ====================

function generateURI(user, node, config) {
    // Auth содержит userId для идентификации на сервере
    const auth = `${user.userId}:${user.password}`;
    const params = [];
    
    // SNI for TLS handshake (can be custom domain for masquerading)
    if (config.sni) params.push(`sni=${config.sni}`);
    params.push('alpn=h3');
    // insecure=1 only if no valid certificate (self-signed without domain)
    params.push(`insecure=${config.hasCert ? '0' : '1'}`);
    if (config.portRange) params.push(`mport=${config.portRange}`);
    if (config.obfs === 'salamander' && config.obfsPassword) {
        params.push('obfs=salamander');
        params.push(`obfs-password=${encodeURIComponent(config.obfsPassword)}`);
    }
    
    const name = `${node.flag || ''} ${node.name} ${config.name}`.trim();
    const uri = `hysteria2://${auth}@${config.host}:${config.port}?${params.join('&')}#${encodeURIComponent(name)}`;
    return uri;
}

/**
 * Generate VLESS URI for an Xray node
 * vless://{uuid}@{host}:{port}?type={transport}&security={security}&...#{name}
 */
function generateVlessURI(user, node) {
    const uuid = user.xrayUuid;
    if (!uuid) return null;

    const xray = node.xray || {};
    const host = node.domain || node.ip;
    const port = node.port || 443;
    const transport = xray.transport || 'tcp';
    const security = xray.security || 'reality';
    const fingerprint = xray.fingerprint || 'chrome';

    const params = new URLSearchParams();
    // xhttp → splithttp in URI type parameter
    params.set('type', transport === 'xhttp' ? 'splithttp' : transport);
    params.set('security', security);

    if (security === 'reality') {
        if (xray.flow && transport === 'tcp') params.set('flow', xray.flow);
        if (xray.realityPublicKey) params.set('pbk', xray.realityPublicKey);
        const sni = xray.realitySni && xray.realitySni[0] ? xray.realitySni[0] : '';
        if (sni) params.set('sni', sni);
        // Prefer non-empty shortId if available
        const shortIds = xray.realityShortIds || [''];
        const sid = shortIds.find(id => id && id.length > 0) || shortIds[0] || '';
        params.set('sid', sid);
        if (xray.realitySpiderX) params.set('spx', xray.realitySpiderX);
        params.set('fp', fingerprint);
    } else if (security === 'tls') {
        if (xray.flow && transport === 'tcp') params.set('flow', xray.flow);
        const sni = node.domain || node.sni || '';
        if (sni) params.set('sni', sni);
        params.set('fp', fingerprint);
        // ALPN
        if (xray.alpn && xray.alpn.length > 0) {
            params.set('alpn', xray.alpn.join(','));
        }
    }

    if (transport === 'ws') {
        params.set('path', xray.wsPath || '/');
        if (xray.wsHost) params.set('host', xray.wsHost);
    } else if (transport === 'grpc') {
        params.set('serviceName', xray.grpcServiceName || 'grpc');
        params.set('mode', 'gun');
    } else if (transport === 'xhttp') {
        params.set('path', xray.xhttpPath || '/');
        if (xray.xhttpHost) params.set('host', xray.xhttpHost);
        if (xray.xhttpMode && xray.xhttpMode !== 'auto') params.set('mode', xray.xhttpMode);
    }

    const transportLabel = {
        tcp: security === 'reality' ? 'Reality' : 'TCP',
        ws: 'WebSocket',
        grpc: 'gRPC',
        xhttp: 'XHTTP',
    }[transport] || transport.toUpperCase();

    const name = `${node.flag || ''} ${node.name} ${transportLabel}`.trim();
    return `vless://${uuid}@${host}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
}

// ==================== FORMAT GENERATORS ====================

function generateURIList(user, nodes) {
    const uris = [];
    nodes.forEach(node => {
        if (node.type === 'xray') {
            const uri = generateVlessURI(user, node);
            if (uri) uris.push(uri);
        } else {
            getNodeConfigs(node).forEach(cfg => {
                uris.push(generateURI(user, node, cfg));
            });
        }
    });
    return uris.join('\n');
}

function _buildClashVlessProxy(user, node) {
    const xray = node.xray || {};
    const host = node.domain || node.ip;
    const transport = xray.transport || 'tcp';
    const security = xray.security || 'reality';
    const fingerprint = xray.fingerprint || 'chrome';
    const transportLabel = { tcp: security === 'reality' ? 'Reality' : 'TCP', ws: 'WebSocket', grpc: 'gRPC', xhttp: 'XHTTP' }[transport] || transport;
    const name = `${node.flag || ''} ${node.name} ${transportLabel}`.trim();

    // Clash Meta doesn't support splithttp/xhttp - skip these nodes
    if (transport === 'xhttp') {
        return { name, proxy: null };
    }

    let proxy = `  - name: "${name}"
    type: vless
    server: ${host}
    port: ${node.port || 443}
    uuid: "${user.xrayUuid}"
    udp: true`;

    if (security === 'reality') {
        const sni = xray.realitySni && xray.realitySni[0] ? xray.realitySni[0] : host;
        proxy += `
    network: ${transport}
    tls: true
    reality-opts:
      public-key: "${xray.realityPublicKey || ''}"
      short-id: "${(xray.realityShortIds || ['']).find(id => id && id.length > 0) || ''}"
    servername: ${sni}
    client-fingerprint: ${fingerprint}`;
        if (transport === 'tcp' && xray.flow) proxy += `\n    flow: ${xray.flow}`;
    } else if (security === 'tls') {
        proxy += `
    network: ${transport}
    tls: true
    servername: ${node.domain || node.sni || host}
    client-fingerprint: ${fingerprint}`;
        if (xray.alpn && xray.alpn.length > 0) {
            proxy += `\n    alpn:\n${xray.alpn.map(a => `      - ${a}`).join('\n')}`;
        }
        if (transport === 'tcp' && xray.flow) proxy += `\n    flow: ${xray.flow}`;
    } else {
        proxy += `\n    network: ${transport}`;
    }

    if (transport === 'ws') {
        proxy += `
    ws-opts:
      path: "${xray.wsPath || '/'}"`;
        if (xray.wsHost) proxy += `\n      headers:\n        Host: "${xray.wsHost}"`;
    } else if (transport === 'grpc') {
        proxy += `
    grpc-opts:
      grpc-service-name: "${xray.grpcServiceName || 'grpc'}"`;
    }

    return { name, proxy };
}

function generateClashYAML(user, nodes) {
    const auth = `${user.userId}:${user.password}`;
    const proxies = [];
    const proxyNames = [];
    
    nodes.forEach(node => {
        if (node.type === 'xray') {
            if (!user.xrayUuid) return;
            const { name, proxy } = _buildClashVlessProxy(user, node);
            if (!proxy) return; // xhttp not supported by Clash
            proxyNames.push(name);
            proxies.push(proxy);
        } else {
            getNodeConfigs(node).forEach(cfg => {
                const name = `${node.flag || ''} ${node.name} ${cfg.name}`.trim();
                proxyNames.push(name);

                let proxy = `  - name: "${name}"
    type: hysteria2
    server: ${cfg.host}
    port: ${cfg.port}
    password: "${auth}"
    sni: ${cfg.sni || cfg.host}
    skip-cert-verify: ${!cfg.hasCert}
    alpn:
      - h3`;

                if (cfg.portRange) proxy += `\n    ports: ${cfg.portRange}`;
                const hopIntervalSec = parseDurationSeconds(normalizeHopInterval(cfg.hopInterval));
                if (hopIntervalSec > 0) proxy += `\n    hop-interval: ${hopIntervalSec}`;
                if (cfg.obfs === 'salamander' && cfg.obfsPassword) {
                    proxy += `\n    obfs: salamander\n    obfs-password: "${cfg.obfsPassword}"`;
                }
                proxies.push(proxy);
            });
        }
    });
    
    return `proxies:\n${proxies.join('\n')}\n\nproxy-groups:\n  - name: "Proxy"\n    type: select\n    proxies:\n${proxyNames.map(n => `      - "${n}"`).join('\n')}\n`;
}

function _buildSingboxVlessOutbound(user, node) {
    const xray = node.xray || {};
    const host = node.domain || node.ip;
    const transport = xray.transport || 'tcp';
    const security = xray.security || 'reality';
    const fingerprint = xray.fingerprint || 'chrome';
    const transportLabel = { tcp: security === 'reality' ? 'Reality' : 'TCP', ws: 'WebSocket', grpc: 'gRPC', xhttp: 'XHTTP' }[transport] || transport;
    const tag = `${node.flag || ''} ${node.name} ${transportLabel}`.trim();

    // Sing-box doesn't support splithttp/xhttp - skip these nodes
    if (transport === 'xhttp') {
        return { tag, outbound: null };
    }

    const outbound = {
        type: 'vless',
        tag,
        server: host,
        server_port: node.port || 443,
        uuid: user.xrayUuid,
    };

    if (transport === 'tcp' && (security === 'reality' || security === 'tls')) {
        outbound.flow = xray.flow || 'xtls-rprx-vision';
    }

    if (security === 'reality') {
        outbound.tls = {
            enabled: true,
            server_name: xray.realitySni && xray.realitySni[0] ? xray.realitySni[0] : host,
            utls: { enabled: true, fingerprint },
            reality: {
                enabled: true,
                public_key: xray.realityPublicKey || '',
                short_id: (xray.realityShortIds || ['']).find(id => id && id.length > 0) || '',
            },
        };
    } else if (security === 'tls') {
        outbound.tls = {
            enabled: true,
            server_name: node.domain || node.sni || host,
            utls: { enabled: true, fingerprint },
        };
        // ALPN
        if (xray.alpn && xray.alpn.length > 0) {
            outbound.tls.alpn = xray.alpn;
        }
    }

    if (transport === 'ws') {
        outbound.transport = {
            type: 'ws',
            path: xray.wsPath || '/',
            headers: xray.wsHost ? { Host: xray.wsHost } : {},
        };
    } else if (transport === 'grpc') {
        outbound.transport = {
            type: 'grpc',
            service_name: xray.grpcServiceName || 'grpc',
        };
    }

    return { tag, outbound };
}

function generateSingboxJSON(user, nodes) {
    const auth = `${user.userId}:${user.password}`;
    const proxyOutbounds = [];
    const tags = [];
    
    nodes.forEach(node => {
        if (node.type === 'xray') {
            if (!user.xrayUuid) return;
            const { tag, outbound } = _buildSingboxVlessOutbound(user, node);
            if (!outbound) return; // xhttp not supported by sing-box
            tags.push(tag);
            proxyOutbounds.push(outbound);
        } else {
            getNodeConfigs(node).forEach(cfg => {
                const tag = `${node.flag || ''} ${node.name} ${cfg.name}`.trim();
                tags.push(tag);

                const outbound = {
                    type: 'hysteria2',
                    tag,
                    server: cfg.host,
                    password: auth,
                    tls: {
                        enabled: true,
                        server_name: cfg.sni || cfg.host,
                        insecure: !cfg.hasCert,
                        alpn: ['h3'],
                    },
                };

                if (cfg.portRange) {
                    outbound.server_ports = [cfg.portRange.replace('-', ':')];
                } else {
                    outbound.server_port = cfg.port;
                }

                const hopInterval = normalizeHopInterval(cfg.hopInterval);
                if (hopInterval) {
                    outbound.hop_interval = hopInterval;
                }

                if (cfg.obfs === 'salamander' && cfg.obfsPassword) {
                    outbound.obfs = { type: 'salamander', password: cfg.obfsPassword };
                }

                proxyOutbounds.push(outbound);
            });
        }
    });
    
    const outbounds = [
        { type: 'selector', tag: 'proxy', outbounds: tags.length > 0 ? [...tags, 'direct'] : ['direct'], default: tags[0] || 'direct' },
        { type: 'urltest', tag: 'auto', outbounds: tags, url: 'https://www.gstatic.com/generate_204', interval: '3m', tolerance: 50 },
        ...proxyOutbounds,
        { type: 'direct', tag: 'direct' },
        { type: 'block', tag: 'block' },
        { type: 'dns', tag: 'dns-out' },
    ];

    // Полная структура sing-box — требуется Hiddify и другим клиентам для распознавания формата
    return {
        log: { level: 'warn', timestamp: true },
        dns: {
            servers: [
                { tag: 'dns-remote', address: 'tls://8.8.8.8', address_resolver: 'dns-local' },
                { tag: 'dns-local', address: '223.5.5.5', detour: 'direct' },
                { tag: 'dns-block', address: 'rcode://refused' },
            ],
            rules: [
                { outbound: 'any', server: 'dns-local' },
            ],
            final: 'dns-remote',
        },
        inbounds: [
            {
                type: 'tun',
                tag: 'tun-in',
                address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
                mtu: 9000,
                auto_route: true,
                strict_route: true,
                stack: 'system',
                sniff: true,
                sniff_override_destination: false,
            },
        ],
        outbounds,
        route: {
            rules: [
                { protocol: 'dns', outbound: 'dns-out' },
                { inbound: 'tun-in', action: 'sniff' },
            ],
            final: 'proxy',
            auto_detect_interface: true,
        },
    };
}

// ==================== HTML PAGE ====================

async function generateHTML(user, nodes, token, baseUrl, settings) {
    // Собираем все конфиги
    const allConfigs = [];
    nodes.forEach(node => {
        if (node.type === 'xray') {
            const uri = generateVlessURI(user, node);
            if (uri) {
                const xray = node.xray || {};
                const transport = xray.transport || 'tcp';
                const security = xray.security || 'reality';
                const label = { tcp: security === 'reality' ? 'Reality' : 'TCP', ws: 'WebSocket', grpc: 'gRPC' }[transport] || transport;
                allConfigs.push({
                    location: node.name,
                    flag: node.flag || '🌐',
                    name: `VLESS ${label}`,
                    uri,
                });
            }
        } else {
            getNodeConfigs(node).forEach(cfg => {
                allConfigs.push({
                    location: node.name,
                    flag: node.flag || '🌐',
                    name: cfg.name,
                    uri: generateURI(user, node, cfg),
                });
            });
        }
    });
    
    const trafficUsed = ((user.traffic?.tx || 0) + (user.traffic?.rx || 0)) / (1024 * 1024 * 1024);
    const trafficLimit = user.trafficLimit ? user.trafficLimit / (1024 * 1024 * 1024) : 0;
    const expireDate = user.expireAt ? new Date(user.expireAt).toLocaleDateString('ru-RU') : 'Бессрочно';
    
    // Group by location preserving node sort order (Map keeps insertion order for all key types)
    const locations = new Map();
    allConfigs.forEach(cfg => {
        if (!locations.has(cfg.location)) {
            locations.set(cfg.location, { flag: cfg.flag, configs: [] });
        }
        locations.get(cfg.location).configs.push({ name: cfg.name, uri: cfg.uri });
    });

    // Кастомизация из настроек
    const sub = settings?.subscription || {};
    const logoUrl   = sub.logoUrl   || '';
    const pageTitle = sub.pageTitle || 'Подключение';

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" style="height:48px; border-radius:10px; object-fit:contain;" onerror="this.style.display='none'">`
        : '<i class="ti ti-rocket"></i>';

    // QR code for subscription link (cached)
    let qrDataUrl = await cache.getQR(baseUrl);
    if (!qrDataUrl) {
        try {
            qrDataUrl = await QRCode.toDataURL(baseUrl, { width: 180, margin: 1, color: { dark: '#ffffff', light: '#141414' } });
            await cache.setQR(baseUrl, qrDataUrl);
        } catch (e) {
            logger.warn(`[Sub] QR generation failed: ${e.message}`);
        }
    }

    const qrSectionHtml = qrDataUrl
        ? `<div class="section section-center">
            <h2 class="section-title-center"><i class="ti ti-qrcode"></i> QR-код</h2>
            <div class="qr-shell">
                <img src="${qrDataUrl}" alt="QR" style="width:160px; height:160px; border-radius:8px; display:block;">
            </div>
            <div class="section-hint">Отсканируйте код, чтобы быстро импортировать подписку в приложение</div>
           </div>`
        : '';

    function escAttr(s) {
        return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function resolveButtonUrl(rawUrl, subUrl) {
        if (!rawUrl) return null;
        if (rawUrl === '__HAPP_SUBSCRIPTION__') {
            return { action: 'happ-subscription', value: subUrl };
        }
        const b64 = Buffer.from(subUrl).toString('base64');
        const resolved = rawUrl
            .replace(/\{url_encoded\}/g, encodeURIComponent(subUrl))
            .replace(/\{url_b64\}/g, b64)
            .replace(/\{url\}/g, subUrl);
        if (/^javascript:/i.test(resolved)) return null;
        return { action: 'link', value: resolved };
    }

    const buttons = (sub.buttons || []).filter(b => b.label && b.url);
    const buttonsHtml = buttons.length > 0
        ? `<div class="section" style="padding:12px;">
            <div class="btn-grid">
                ${buttons.map(b => {
                    const resolved = resolveButtonUrl(b.url, baseUrl);
                    if (!resolved) return '';
                    const iconClass = (b.icon || '').trim().replace(/[^a-zA-Z0-9-]/g, '') || 'ti-external-link';
                    const safeLabel = escAttr(b.label);
                    if (resolved.action === 'happ-subscription') {
                        return `<button type="button" class="app-btn app-btn-button" onclick="copyAndLaunchHapp('${escAttr(resolved.value)}', this)">
                            <i class="ti ${iconClass}" style="font-size:18px; color:var(--accent); flex-shrink:0;"></i>
                            <span>${safeLabel}</span>
                        </button>`;
                    }
                    const href = resolved.value;
                    const isExternalHttp = /^https?:/i.test(href);
                    const extraAttrs = isExternalHttp
                        ? 'target="_blank" rel="noopener noreferrer"'
                        : `onclick="openAppLink('${escAttr(href)}'); return false;"`;
                    return `<a href="${escAttr(href)}" ${extraAttrs} class="app-btn">
                        <i class="ti ${iconClass}" style="font-size:18px; color:var(--accent); flex-shrink:0;"></i>
                        <span>${safeLabel}</span>
                    </a>`;
                }).filter(Boolean).join('')}
            </div>
           </div>`
        : '';

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Geologica:wght@500;600;700&family=Lilex:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
    <style>
        :root {
            --navy: #050A3C;
            --cyan: #08C5CB;
            --white: #ffffff;
            --bg: #f8fafc;
            --card: #ffffff;
            --card-soft: #f2f6fa;
            --border: rgba(5,10,60,0.12);
            --text: #07123c;
            --muted: #68738f;
            --success: #22c55e;
            --shadow: 0 18px 36px rgba(5,10,60,0.06);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Lilex', 'Segoe UI', sans-serif;
            background:
                linear-gradient(rgba(5,10,60,0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(5,10,60,0.05) 1px, transparent 1px),
                var(--bg);
            background-size: 108px 108px, 108px 108px, auto;
            color: var(--text);
            min-height: 100vh;
            padding: 18px 16px 34px;
        }
        .container { max-width: 760px; margin: 0 auto; }
        .hero {
            display: grid;
            grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
            gap: 16px;
            padding: 26px;
            border-radius: 18px;
            border: 1px solid var(--border);
            background:
                linear-gradient(rgba(5,10,60,0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(5,10,60,0.05) 1px, transparent 1px),
                var(--card);
            background-size: 84px 84px, 84px 84px, auto;
            background-position: right -1px bottom -1px, right -1px bottom -1px, 0 0;
            box-shadow: var(--shadow);
            margin-bottom: 16px;
        }
        .hero-copy { display: flex; flex-direction: column; gap: 12px; }
        .eyebrow {
            display: inline-flex;
            width: fit-content;
            padding: 6px 10px;
            border: 1px solid var(--border);
            border-radius: 999px;
            color: var(--muted);
            font-size: 11px;
            letter-spacing: .08em;
            text-transform: uppercase;
        }
        .hero h1 {
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: 'Geologica', 'Segoe UI', sans-serif;
            font-size: clamp(30px, 5vw, 42px);
            line-height: 0.98;
        }
        .hero p { color: var(--muted); max-width: 34ch; }
        .hero-meta { display: grid; gap: 10px; }
        .hero-meta-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid var(--border);
            background: var(--card-soft);
        }
        .hero-meta-card strong,
        .stat-value,
        .section h2,
        .location-name {
            font-family: 'Geologica', 'Segoe UI', sans-serif;
        }
        .hero-meta-card span,
        .section-hint { color: var(--muted); font-size: 12px; }
        .hero-meta-card strong { font-size: 18px; }
        .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }
        .stat {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 16px;
            box-shadow: var(--shadow);
            position: relative;
        }
        .stat::after {
            content: '';
            position: absolute;
            left: 16px;
            right: 16px;
            bottom: 12px;
            border-bottom: 1px dashed rgba(8,197,203,0.42);
        }
        .stat-value { font-size: 24px; color: var(--navy); }
        .stat-label { font-size: 12px; color: var(--muted); margin-top: 6px; padding-bottom: 10px; }
        .section {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 18px;
            margin-bottom: 12px;
            box-shadow: var(--shadow);
        }
        .section-center { text-align: center; }
        .section h2 {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 15px;
            margin-bottom: 14px;
            color: var(--navy);
        }
        .section-title-center { justify-content: center; }
        .sub-box {
            display: flex;
            gap: 10px;
            align-items: center;
            padding: 12px;
            border-radius: 14px;
            background: var(--card-soft);
        }
        .sub-box input {
            flex: 1;
            padding: 12px 14px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            color: var(--text);
            font: inherit;
            font-size: 12px;
            min-width: 0;
        }
        .location {
            border: 1px solid var(--border);
            border-radius: 14px;
            margin-bottom: 10px;
            overflow: hidden;
        }
        .location-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            cursor: pointer;
            background: var(--card-soft);
        }
        .location-header:hover { background: #edf3f8; }
        .location-flag { font-size: 24px; }
        .location-name { flex: 1; font-weight: 600; }
        .location-arrow { color: var(--muted); transition: transform 0.2s; display: inline-flex; }
        .location.open .location-arrow { transform: rotate(180deg); }
        .location-configs { display: none; border-top: 1px solid var(--border); }
        .location.open .location-configs { display: block; }
        .config {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-bottom: 1px solid rgba(5,10,60,0.06);
            background: var(--card);
        }
        .config:last-child { border-bottom: none; }
        .config-name { font-size: 13px; }
        .copy-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 10px 14px;
            background: var(--navy);
            border: 1px solid var(--navy);
            border-radius: 999px;
            color: #fff;
            font: inherit;
            font-size: 12px;
            cursor: pointer;
        }
        .copy-btn:active { transform: scale(0.96); }
        .copy-btn.success {
            background: var(--success);
            border-color: var(--success);
        }
        .btn-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .app-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 14px;
            color: var(--text);
            text-decoration: none;
            font-size: 14px;
            transition: transform 0.15s, border-color 0.15s;
        }
        .app-btn-button { width: 100%; cursor: pointer; font: inherit; text-align: left; }
        .app-btn:hover {
            transform: translateY(-1px);
            border-color: rgba(8,197,203,0.4);
        }
        .qr-shell {
            display: inline-block;
            background: var(--navy);
            padding: 14px;
            border-radius: 16px;
            margin-bottom: 10px;
        }
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--success);
            color: #fff;
            padding: 12px 20px;
            border-radius: 999px;
            font-size: 14px;
            transition: transform 0.3s;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 16px 34px rgba(34,197,94,0.22);
        }
        .toast.show { transform: translateX(-50%) translateY(0); }
        @media (max-width: 720px) {
            .hero,
            .stats { grid-template-columns: 1fr; }
        }
        @media (max-width: 420px) {
            .btn-grid { grid-template-columns: 1fr; }
            .sub-box,
            .config { flex-direction: column; align-items: stretch; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="hero">
            <div class="hero-copy">
                <span class="eyebrow">Access Profile</span>
                <h1>${logoHtml} ${pageTitle}</h1>
                <p>Персональная страница подключения с готовой ссылкой, QR-кодом и быстрым импортом в совместимые приложения.</p>
            </div>
            <div class="hero-meta">
                <div class="hero-meta-card">
                    <div>
                        <span>Использовано</span>
                        <strong>${trafficUsed.toFixed(1)} ГБ</strong>
                    </div>
                    <i class="ti ti-chart-donut-3" style="font-size:24px; color:var(--cyan);"></i>
                </div>
                <div class="hero-meta-card">
                    <div>
                        <span>Локаций</span>
                        <strong>${locations.size}</strong>
                    </div>
                    <i class="ti ti-world" style="font-size:24px; color:var(--navy);"></i>
                </div>
                <div class="hero-meta-card">
                    <div>
                        <span>Действует до</span>
                        <strong>${expireDate}</strong>
                    </div>
                    <i class="ti ti-calendar-time" style="font-size:24px; color:var(--navy);"></i>
                </div>
            </div>
        </div>

        <div class="stats">
            <div class="stat">
                <div class="stat-value">${trafficUsed.toFixed(1)} ГБ</div>
                <div class="stat-label">Использовано${trafficLimit > 0 ? ` / ${trafficLimit.toFixed(0)} ГБ` : ''}</div>
            </div>
            <div class="stat">
                <div class="stat-value">${locations.size}</div>
                <div class="stat-label">Локаций</div>
            </div>
            <div class="stat">
                <div class="stat-value">${expireDate}</div>
                <div class="stat-label">Действует до</div>
            </div>
        </div>

        <div class="section">
            <h2><i class="ti ti-link"></i> Ссылка для приложений</h2>
            <div class="sub-box">
                <input type="text" value="${baseUrl}" readonly id="subUrl">
                <button class="copy-btn" onclick="copyText('${baseUrl}', this)">Копировать</button>
            </div>
        </div>

        <div class="section">
            <h2><i class="ti ti-world"></i> Доступные локации</h2>
            ${[...locations.entries()].map(([name, loc]) => `
            <div class="location">
                <div class="location-header" onclick="this.parentElement.classList.toggle('open')">
                    <span class="location-flag">${loc.flag}</span>
                    <span class="location-name">${name}</span>
                    <span class="location-arrow"><i class="ti ti-chevron-down"></i></span>
                </div>
                <div class="location-configs">
                    ${loc.configs.map((cfg) => `
                    <div class="config">
                        <span class="config-name">${cfg.name}</span>
                        <button class="copy-btn" onclick="copyUri(this)">Копировать</button>
                    </div>
                    `).join('')}
                </div>
            </div>
            `).join('')}
        </div>

        ${qrSectionHtml}
        ${buttonsHtml}
    </div>
    
    <div class="toast" id="toast"><i class="ti ti-check"></i> Скопировано</div>
    
    <script>
        // Все URI для копирования
        const uris = ${JSON.stringify(allConfigs.map(c => c.uri))};
        
        function copyText(text, btn) {
            doCopy(text, btn);
        }
        
        function copyUri(btn) {
            const allBtns = document.querySelectorAll('.location-configs .copy-btn');
            let idx = 0;
            for (let i = 0; i < allBtns.length; i++) {
                if (allBtns[i] === btn) {
                    idx = i;
                    break;
                }
            }
            doCopy(uris[idx], btn);
        }
        
        function doCopy(text, btn) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => success(btn)).catch(() => fallback(text, btn));
            } else {
                fallback(text, btn);
            }
        }

        function openAppLink(href) {
            window.location.href = href;
        }

        function copySync(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            let copied = false;
            try { copied = document.execCommand('copy'); } catch(e) {}
            document.body.removeChild(ta);
            return copied;
        }

        function launchHappApp() {
            try {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = 'happ://';
                document.body.appendChild(iframe);
                setTimeout(() => iframe.remove(), 1200);
            } catch (e) {}
            try { window.location.assign('happ://'); } catch (e) {}
        }

        function copyAndLaunchHapp(text, btn) {
            const copiedSync = copySync(text);
            success(btn, copiedSync ? 'Ссылка скопирована' : 'Открываем HAPP');
            launchHappApp();
            if (!copiedSync && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(() => {});
            }
        }
        
        function fallback(text, btn) {
            if (copySync(text)) success(btn);
        }
        
        function success(btn, toastText) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="ti ti-check"></i>';
            btn.classList.add('success');
            const toast = document.getElementById('toast');
            if (toastText) {
                toast.innerHTML = '<i class="ti ti-check"></i> ' + toastText;
            }
            toast.classList.add('show');
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.classList.remove('success');
                toast.classList.remove('show');
                toast.innerHTML = '<i class="ti ti-check"></i> Скопировано';
            }, 1500);
        }
    </script>
</body>
</html>`;
}

// ==================== MAIN ROUTE ====================

/**
 * GET /files/:token - Единственный роут
 * - Браузер → HTML
 * - Приложение → подписка
 * 
 * С кэшированием готовых подписок в Redis
 */
router.get('/files/:token', async (req, res) => {
    try {
        const token = req.params.token;
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        // Определяем формат
        let format = req.query.format;
        const browser = isBrowser(req);
        
        // Для браузера без format — не кэшируем (HTML со свежими данными)
        if (browser && !format) {
            // HTML страница — не кэшируем, показываем свежие данные
            const [user, settings] = await Promise.all([
                getUserByToken(token),
                getSettings(),
            ]);
            
            if (!user) {
                logger.warn(`[Sub] User not found for token: ${token}`);
                return res.status(404).type('text/plain').send('# User not found');
            }
            
            const validation = validateUser(user);
            if (!validation.valid) {
                logger.warn(`[Sub] User ${user.userId} invalid: ${validation.error}`);
                return res.status(403).type('text/plain').send(`# ${validation.error}`);
            }
            
            const nodes = await getActiveNodes(user);
            if (nodes.length === 0) {
                return res.status(503).type('text/plain').send('# No servers available');
            }
            
            const baseUrl = `${req.protocol}://${req.get('host')}/api/files/${token}`;
            const html = await generateHTML(user, nodes, token, baseUrl, settings);
            return res.type('text/html').send(html);
        }
        
        // Для приложений — определяем формат и кэшируем
        if (!format) {
            format = detectFormat(userAgent);
            logger.debug(`[Sub] UA: "${userAgent}" → format: ${format}`);
        }
        
        // Читаем настройки (из Redis-кэша — быстро)
        const settings = await getSettings();

        // Проверяем кэш
        const cached = await cache.getSubscription(token, format);
        if (cached) {
            logger.debug(`[Sub] Cache HIT: ${token}:${format}`);
            return await sendCachedSubscription(res, cached, format, userAgent, settings);
        }
        
        // Кэша нет — генерируем
        logger.debug(`[Sub] Cache MISS: token=${token.substring(0,8)}..., format=${format}`);
        
        const user = await getUserByToken(token);
        
        if (!user) {
            logger.warn(`[Sub] User not found for token: ${token}`);
            return res.status(404).type('text/plain').send('# User not found');
        }
        
        const validation = validateUser(user);
        
        if (!validation.valid) {
            logger.warn(`[Sub] User ${user.userId} invalid: ${validation.error}`);
            return res.status(403).type('text/plain').send(`# ${validation.error}`);
        }
        
        const nodes = await getActiveNodes(user);
        if (nodes.length === 0) {
            logger.error(`[Sub] NO SERVERS for user ${user.userId}! Check nodes in panel.`);
            return res.status(503).type('text/plain').send('# No servers available');
        }
        
        logger.debug(`[Sub] Serving ${nodes.length} nodes to user ${user.userId}`);
        
        // Генерируем подписку
        const subscriptionData = generateSubscriptionData(user, nodes, format, userAgent, settings?.subscription?.happProviderId || '');
        
        // Сохраняем в кэш
        await cache.setSubscription(token, format, subscriptionData);
        
        // Отправляем
        return await sendCachedSubscription(res, subscriptionData, format, userAgent, settings);
        
    } catch (error) {
        logger.error(`[Sub] Error: ${error.message}`);
        res.status(500).type('text/plain').send('# Error');
    }
});

/**
 * Генерирует данные подписки для кэширования
 */
function generateSubscriptionData(user, nodes, format, userAgent, happProviderId = '') {
    let content;
    let needsBase64 = false;
    
    switch (format) {
        case 'shadowrocket':
            content = generateURIList(user, nodes);
            needsBase64 = true;
            break;
        case 'clash':
        case 'yaml':
            content = generateClashYAML(user, nodes);
            break;
        case 'singbox':
        case 'json':
            content = JSON.stringify(generateSingboxJSON(user, nodes), null, 2);
            break;
        case 'uri':
        case 'raw':
        default:
            content = generateURIList(user, nodes);
            // HAPP reads #providerid from body as fallback (in case headers are stripped by a proxy)
            if (happProviderId) {
                content = `#providerid ${happProviderId}\n${content}`;
            }
            if (/quantumult/i.test(userAgent)) {
                needsBase64 = true;
            }
            break;
    }
    
    if (needsBase64) {
        content = Buffer.from(content).toString('base64');
    }
    
    return {
        content,
        userId: user.userId,
        profileTitle: getSubscriptionTitle(user),
        username: user.username || user.userId,
        traffic: {
            tx: user.traffic?.tx || 0,
            rx: user.traffic?.rx || 0,
        },
        trafficLimit: user.trafficLimit || 0,
        expireAt: user.expireAt,
        supportDueAt: user.support?.dueAt || null,
        supportLastPaymentAt: user.support?.lastPaymentAt || null,
        maxDevices: user.maxDevices || 0,
        groupMaxDevices: (user.groups || []).map(group => group?.maxDevices || 0),
    };
}

/**
 * Отправляет закэшированную подписку
 */
async function sendCachedSubscription(res, data, format, userAgent, settings) {
    let contentType = 'text/plain';
    
    switch (format) {
        case 'clash':
        case 'yaml':
            contentType = 'text/yaml';
            break;
        case 'singbox':
        case 'json':
            contentType = 'application/json';
            break;
    }

    const isHapp = /happ/i.test(userAgent);
    const happ = settings?.subscription?.happ || {};
    const display = happ.display || {};
    const supportConfig = happ.support || {};
    const showTrafficProgress = !isHapp || display.showTrafficProgress !== false;
    const showSupportPeriod = isHapp && display.showSupportPeriod !== false && supportConfig.enabled !== false;
    const supportState = resolveSupportState({
        support: {
            dueAt: data.supportDueAt,
            lastPaymentAt: data.supportLastPaymentAt,
        },
    }, settings);

    const subscriptionUserinfo = [];
    if (showTrafficProgress) {
        subscriptionUserinfo.push(`upload=${data.traffic.tx}`);
        subscriptionUserinfo.push(`download=${data.traffic.rx}`);
        if (data.trafficLimit > 0) subscriptionUserinfo.push(`total=${data.trafficLimit}`);
    }
    const expireTs = (isHapp && showSupportPeriod)
        ? (supportState.dueAt ? Math.floor(new Date(supportState.dueAt).getTime() / 1000) : 0)
        : (data.expireAt ? Math.floor(new Date(data.expireAt).getTime() / 1000) : 0);
    subscriptionUserinfo.push(`expire=${expireTs}`);
    
    const headers = {
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${data.username}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'Profile-Title': encodeTitle(data.profileTitle),
        'Profile-Update-Interval': String(settings?.subscription?.updateInterval || 12),
        'Subscription-Userinfo': subscriptionUserinfo.join('; '),
    };

    const sub = settings?.subscription;
    if (sub?.supportUrl)     headers['support-url']          = sub.supportUrl;
    if (sub?.webPageUrl)     headers['profile-web-page-url'] = sub.webPageUrl;
    if (sub?.happProviderId) headers['providerid']            = sub.happProviderId;
    
    let content = data.content;

    if (isHapp) {
        if (settings?.routing?.enabled) {
            const profile = buildHappRoutingProfile(settings.routing);
            if (profile) {
                const b64 = Buffer.from(JSON.stringify(profile)).toString('base64');
                const routingLink = `happ://routing/onadd/${b64}`;
                headers.routing = routingLink;
                if (format === 'uri' || format === 'raw') {
                    content = `${routingLink}\n${content}`;
                }
            }
        } else {
            headers.routing = 'happ://routing/off';
            if (format === 'uri' || format === 'raw') {
                content = `happ://routing/off\n${content}`;
            }
        }

        if (happ) {
            if (happ.announce) {
                headers.announce = encodeHappText(happ.announce);
            }
            if (sub?.happProviderId) {
                if (happ.hideSettings) headers['hide-settings'] = '1';
                const supportEnabled = showSupportPeriod;
                if (!supportEnabled && happ.notifyExpire) headers['notification-subs-expire'] = '1';
                headers['sub-expire'] = !supportEnabled && happ.expireBannerEnabled ? '1' : '0';
                if (!supportEnabled && happ.expireBannerEnabled && happ.expireButtonLink) {
                    headers['sub-expire-button-link'] = normalizeHeaderText(happ.expireButtonLink);
                }

                const infoParts = [];
                if (supportConfig.enabled !== false && display.showSupportStatus !== false) {
                    const supportTextByState = {
                        neutral: supportConfig.neutralText,
                        active: supportConfig.activeText,
                        overdue: supportConfig.overdueText,
                    };
                    appendPart(infoParts, supportTextByState[supportState.state] || supportConfig.neutralText);
                }

                if (display.showTrafficDetails !== false) {
                    const usedBytes = (data.traffic.tx || 0) + (data.traffic.rx || 0);
                    const limitLabel = data.trafficLimit > 0 ? formatTrafficValue(data.trafficLimit) : '∞';
                    appendPart(infoParts, `Трафик ${formatTrafficValue(usedBytes)} / ${limitLabel}`);
                }

                if (display.showDevices !== false) {
                    const deviceLimit = calculateUserDeviceLimit({
                        maxDevices: data.maxDevices,
                        groups: (data.groupMaxDevices || []).map((limit) => ({ maxDevices: limit })),
                    });
                    const deviceIPs = data.userId ? await cache.getDeviceIPs(data.userId) : {};
                    const gracePeriodMs = (settings?.deviceGracePeriod ?? 15) * 60 * 1000;
                    const now = Date.now();
                    const activeDevices = Object.values(deviceIPs).filter((timestamp) => {
                        const ts = parseInt(timestamp, 10);
                        return Number.isFinite(ts) && (now - ts) < gracePeriodMs;
                    }).length;
                    appendPart(infoParts, `Устройства ${activeDevices} / ${deviceLimit > 0 ? deviceLimit : '∞'}`);
                }

                if (infoParts.length === 0) {
                    appendPart(infoParts, happ.infoText);
                }

                if (infoParts.length > 0) {
                    headers['sub-info-text'] = encodeHappText(infoParts.join(' • ').slice(0, 200));
                    const supportDrivenColor = display.showSupportStatus !== false
                        ? ({ active: 'green', overdue: 'red', neutral: 'blue' }[supportState.state] || null)
                        : null;
                    headers['sub-info-color'] = supportDrivenColor || (['blue', 'green', 'red'].includes(happ.infoColor) ? happ.infoColor : 'blue');
                    const supportButtonText = normalizeHeaderText(supportConfig.buttonText || '');
                    const supportButtonLink = normalizeHeaderText(supportConfig.buttonLink || sub.supportUrl || '');
                    const infoButtonText = supportButtonText || normalizeHeaderText(happ.infoButtonText);
                    const infoButtonLink = supportButtonLink || normalizeHeaderText(happ.infoButtonLink);
                    if (infoButtonText) {
                        headers['sub-info-button-text'] = encodeHappText(infoButtonText);
                    }
                    if (infoButtonLink) {
                        headers['sub-info-button-link'] = infoButtonLink;
                    }
                } else {
                    headers['sub-info-text'] = '';
                }
                if (happ.alwaysHwid) headers['subscription-always-hwid-enable'] = '1';
                if (happ.pingType) {
                    headers['ping-type'] = happ.pingType;
                    if ((happ.pingType === 'proxy' || happ.pingType === 'proxy-head') && happ.pingUrl) {
                        headers['check-url-via-proxy'] = happ.pingUrl;
                    }
                }
                if (happ.colorProfile) headers['color-profile'] = happ.colorProfile;
            }
        }
    }

    res.set(headers);
    res.send(content);
}

// ==================== INFO ====================

router.get('/info/:token', async (req, res) => {
    try {
        const user = await getUserByToken(req.params.token);
        if (!user) return res.status(404).json({ error: 'Not found' });
        
        const nodes = await getActiveNodes(user);
        
        res.json({
            enabled: user.enabled,
            groups: user.groups,
            traffic: { used: (user.traffic?.tx || 0) + (user.traffic?.rx || 0), limit: user.trafficLimit },
            expire: user.expireAt,
            support: user.support || {},
            maxDevices: calculateUserDeviceLimit(user),
            servers: nodes.length,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
