const express = require('express');
const router = express.Router();

const HyNode = require('../../models/hyNodeModel');
const HyUser = require('../../models/hyUserModel');
const ServerGroup = require('../../models/serverGroupModel');
const Settings = require('../../models/settingsModel');
const cryptoService = require('../../services/cryptoService');
const syncService = require('../../services/syncService');
const configGenerator = require('../../services/configGenerator');
const nodeSetup = require('../../services/nodeSetup');
const NodeSSH = require('../../services/nodeSSH');
const sshKeyService = require('../../services/sshKeyService');
const cache = require('../../services/cacheService');
const cascadeService = require('../../services/cascadeService');
const statsService = require('../../services/statsService');
const { getActiveGroups } = require('../../utils/helpers');
const config = require('../../../config');
const logger = require('../../utils/logger');

const {
    render,
    parseXrayFormFields,
    parseBool,
    parseHysteriaFormFields,
    getHysteriaAclInlineState,
    validateHysteriaFormFields,
    buildSshKeyFilename,
    connectNodeSSH,
    generateSshKeyLimiter,
    sniScanLimiter,
} = require('./helpers');

const sniScanner = require('../../services/sniScanner');
const RESERVED_CASCADE_OUTBOUND = '__cascade_sidecar__';

function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const setupJobs = new Map();
const SETUP_JOB_TTL_MS = 1000 * 60 * 60; // keep finished jobs for 1 hour

function cleanupSetupJobs() {
    const now = Date.now();
    for (const [nodeId, job] of setupJobs.entries()) {
        if (!job) continue;
        if (job.state === 'running') continue;
        if ((now - (job.finishedAt || job.startedAt || now)) > SETUP_JOB_TTL_MS) {
            setupJobs.delete(nodeId);
        }
    }
}

function getSetupJob(nodeId) {
    cleanupSetupJobs();
    return setupJobs.get(String(nodeId)) || null;
}

function setSetupJob(nodeId, patch) {
    const key = String(nodeId);
    const prev = setupJobs.get(key) || {};
    const next = { ...prev, ...patch };
    setupJobs.set(key, next);
    return next;
}

async function runNodeSetupJob(nodeId) {
    const key = String(nodeId);
    let node = await HyNode.findById(nodeId);
    if (!node) {
        setSetupJob(key, {
            state: 'error',
            error: 'Нода не найдена',
            finishedAt: Date.now(),
            logs: ['Node not found'],
        });
        return;
    }

    logger.info(`[Panel] Background setup started for node ${node.name} (type: ${node.type || 'hysteria'}, role: ${node.cascadeRole || 'standalone'})`);

    try {
        let result;
        if (node.type === 'xray' && node.cascadeRole === 'bridge') {
            result = await nodeSetup.setupXrayNode(node, { restartService: false, exitOnly: true });
            if (result.success) {
                result.logs = result.logs || [];
                result.logs.push('[Bridge] Xray installed. Create a cascade link to deploy bridge config.');
            }
        } else if (node.type === 'xray') {
            result = await nodeSetup.setupXrayNodeWithAgent(node, { restartService: true });
        } else {
            result = await nodeSetup.setupNode(node, {
                installHysteria: true,
                setupPortHopping: true,
                restartService: true,
            });
        }

        const logs = Array.isArray(result.logs) ? result.logs : [];

        if (result.success) {
            const updateFields = { status: 'online', lastSync: new Date(), lastError: '', healthFailures: 0 };
            if (node.type !== 'xray') updateFields.useTlsFiles = result.useTlsFiles;
            if (node.cascadeRole === 'bridge') updateFields.status = 'offline';
            await HyNode.findByIdAndUpdate(node._id, { $set: updateFields });

            const CascadeLink = require('../../models/cascadeLinkModel');
            const linkCount = await CascadeLink.countDocuments({
                $or: [{ portalNode: node._id }, { bridgeNode: node._id }],
                active: true,
            });
            if (linkCount > 0) {
                logs.push(`[Cascade] Re-deploying ${linkCount} cascade link(s)...`);
                cascadeService.redeployAllLinksForNode(node._id).catch(err => {
                    logger.error(`[Cascade] Auto-redeploy after setup: ${err.message}`);
                });
            }

            setSetupJob(key, {
                state: 'success',
                message: 'Нода успешно настроена',
                logs,
                finishedAt: Date.now(),
                error: '',
            });
            logger.info(`[Panel] Background setup completed for node ${node.name}`);
        } else {
            await HyNode.findByIdAndUpdate(node._id, {
                $set: { status: 'error', lastError: result.error, healthFailures: 0 },
            });
            setSetupJob(key, {
                state: 'error',
                error: result.error || 'Setup failed',
                logs,
                finishedAt: Date.now(),
            });
            logger.warn(`[Panel] Background setup failed for node ${node.name}: ${result.error}`);
        }
    } catch (error) {
        logger.error(`[Panel] Background setup exception: ${error.message}`);
        await HyNode.findByIdAndUpdate(node._id, {
            $set: { status: 'error', lastError: error.message, healthFailures: 0 },
        });
        const existingLogs = getSetupJob(key)?.logs || [];
        setSetupJob(key, {
            state: 'error',
            error: error.message,
            logs: [...existingLogs, `Exception: ${error.message}`],
            finishedAt: Date.now(),
        });
    }
}

function getHybridSidecarRuntime(node) {
    const raw = node?.cascadeSidecar || {};
    const socksPort = Number(raw.socksPort) > 0 ? Number(raw.socksPort) : 11080;
    const rawServiceName = String(raw.serviceName || 'xray-cascade').trim() || 'xray-cascade';
    const serviceName = rawServiceName.endsWith('.service') ? rawServiceName : `${rawServiceName}.service`;
    const sidecarConfigPath = String(raw.configPath || '/usr/local/etc/xray-cascade/config.json').trim() || '/usr/local/etc/xray-cascade/config.json';
    const hysteriaConfigPath = String(node?.paths?.config || '/etc/hysteria/config.yaml').trim() || '/etc/hysteria/config.yaml';
    return {
        socksPort,
        serviceName,
        sidecarConfigPath,
        hysteriaConfigPath,
    };
}

async function runHybridSidecarSmokeCheck(node) {
    const runtime = getHybridSidecarRuntime(node);
    const checks = [];
    const logs = [];
    let ssh;

    const pushCheck = (name, ok, details) => {
        checks.push({ name, ok, details: details || '' });
        logs.push(`[${ok ? 'PASS' : 'FAIL'}] ${name}${details ? ` — ${details}` : ''}`);
    };

    try {
        ssh = new NodeSSH(node);
        await ssh.connect();

        logs.push(`[INFO] Node: ${node.name} (${node.ip})`);
        logs.push(`[INFO] sidecar service: ${runtime.serviceName}`);
        logs.push(`[INFO] sidecar config: ${runtime.sidecarConfigPath}`);
        logs.push(`[INFO] hysteria config: ${runtime.hysteriaConfigPath}`);
        logs.push(`[INFO] SOCKS port: ${runtime.socksPort}`);

        const hysteriaState = await ssh.exec('(systemctl is-active hysteria-server 2>/dev/null || systemctl is-active hysteria 2>/dev/null || true) | head -n 1');
        const hysteriaStatus = String(hysteriaState.stdout || '').trim();
        pushCheck('hysteria service active', hysteriaStatus === 'active', `status=${hysteriaStatus || 'unknown'}`);

        const sidecarState = await ssh.exec(`(systemctl is-active ${shellQuote(runtime.serviceName)} 2>/dev/null || true) | head -n 1`);
        const sidecarStatus = String(sidecarState.stdout || '').trim();
        let sidecarDetails = `status=${sidecarStatus || 'unknown'}`;
        if (sidecarStatus !== 'active') {
            const sidecarJournal = await ssh.exec(`journalctl -u ${shellQuote(runtime.serviceName)} -n 12 --no-pager 2>/dev/null || true`);
            const journalTail = String(sidecarJournal.stdout || sidecarJournal.stderr || '')
                .trim()
                .split('\n')
                .slice(-3)
                .join(' | ');
            if (journalTail) sidecarDetails += `; logs=${journalTail}`;
        }
        pushCheck('sidecar service active', sidecarStatus === 'active', sidecarDetails);

        const sidecarConfig = await ssh.exec(`[ -f ${shellQuote(runtime.sidecarConfigPath)} ] && echo yes || echo no`);
        pushCheck('sidecar config exists', String(sidecarConfig.stdout || '').trim() === 'yes', runtime.sidecarConfigPath);

        const hysteriaConfig = await ssh.exec(`[ -f ${shellQuote(runtime.hysteriaConfigPath)} ] && echo yes || echo no`);
        pushCheck('hysteria config exists', String(hysteriaConfig.stdout || '').trim() === 'yes', runtime.hysteriaConfigPath);

        const sidecarRule = await ssh.exec(`grep -n "__cascade_sidecar__" ${shellQuote(runtime.hysteriaConfigPath)} 2>/dev/null | head -n 1`);
        const sidecarRuleLine = String(sidecarRule.stdout || '').trim();
        pushCheck('overlay marker in hysteria config', !!sidecarRuleLine, sidecarRuleLine || 'not found');

        const listenCheck = await ssh.exec(`ss -ltnH '( sport = :${runtime.socksPort} )' | wc -l`);
        const listeners = parseInt(String(listenCheck.stdout || '0').trim(), 10) || 0;
        pushCheck('sidecar listens on SOCKS port', listeners > 0, `port=${runtime.socksPort}, listeners=${listeners}`);

        const xrayBinary = await ssh.exec('command -v xray >/dev/null 2>&1 && echo yes || echo no');
        pushCheck('xray binary present', String(xrayBinary.stdout || '').trim() === 'yes', '/usr/local/bin/xray');
    } finally {
        if (ssh) ssh.disconnect();
    }

    const passed = checks.filter(c => c.ok).length;
    const failed = checks.length - passed;
    logs.push(`[SUMMARY] PASS=${passed} FAIL=${failed}`);

    return {
        success: failed === 0,
        checks,
        summary: { passed, failed, total: checks.length },
        logs,
        runtime,
    };
}

// ==================== DASHBOARD ====================

// GET /panel - Dashboard
router.get('/', async (req, res) => {
    try {
        let counts = await cache.getDashboardCounts();
        
        if (!counts) {
            const [trafficAgg, usersTotal, usersEnabled, nodesTotal, nodesOnline] = await Promise.all([
                HyUser.aggregate([
                    { $group: { 
                        _id: null, 
                        tx: { $sum: '$traffic.tx' }, 
                        rx: { $sum: '$traffic.rx' } 
                    }}
                ]),
                HyUser.countDocuments(),
                HyUser.countDocuments({ enabled: true }),
                HyNode.countDocuments(),
                HyNode.countDocuments({ status: 'online' }),
            ]);
            
            const trafficStats = trafficAgg[0] || { tx: 0, rx: 0 };
            
            counts = {
                usersTotal,
                usersEnabled,
                nodesTotal,
                nodesOnline,
                trafficStats,
            };
            
            await cache.setDashboardCounts(counts);
        }
        
        const { usersTotal, usersEnabled, nodesTotal, nodesOnline, trafficStats } = counts;
        
        const nodes = await HyNode.find({ active: true })
            .select('name ip status onlineUsers maxOnlineUsers groups traffic type flag rankingCoefficient')
            .populate('groups', 'name color')
            .sort({ rankingCoefficient: 1, name: 1 });
        
        const totalOnline = nodes.reduce((sum, n) => sum + (n.onlineUsers || 0), 0);
        
        const totalTrafficBytes = (trafficStats.tx || 0) + (trafficStats.rx || 0);
        
        render(res, 'dashboard', {
            title: 'Dashboard',
            page: 'dashboard',
            stats: {
                users: { total: usersTotal, enabled: usersEnabled },
                nodes: { total: nodesTotal, online: nodesOnline },
                onlineUsers: totalOnline,
                lastSync: syncService.lastSyncTime,
                traffic: {
                    tx: trafficStats.tx || 0,
                    rx: trafficStats.rx || 0,
                    total: totalTrafficBytes,
                },
            },
            nodes,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// ==================== NODES ====================

// GET /panel/nodes - Node list
router.get('/nodes', async (req, res) => {
    try {
        const CascadeLink = require('../../models/cascadeLinkModel');
        const [nodes, groups, linksCount, settings] = await Promise.all([
            HyNode.find().populate('groups', 'name color').sort({ rankingCoefficient: 1, name: 1 }),
            getActiveGroups(),
            CascadeLink.countDocuments({ active: true }),
            Settings.get(),
        ]);

        render(res, 'nodes', {
            title: res.locals.locales.nodes.title,
            page: 'nodes',
            nodes,
            groups,
            linksCount,
            loadBalancingEnabled: !!(settings?.loadBalancing?.enabled),
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /panel/nodes/add - Node creation form
router.get('/nodes/add', async (req, res) => {
    try {
        const groups = await getActiveGroups();
        render(res, 'node-form', {
            title: res.locals.t('nodes.newNode'),
            page: 'nodes',
            node: null,
            groups,
            cascadeLinks: [],
            error: req.query.error || null,
            panelDomain: config.PANEL_DOMAIN || '',
        });
    } catch (error) {
        logger.error('[Panel] GET /nodes/add error:', error.message);
        res.status(500).send('Error: ' + error.message);
    }
});

// PATCH /panel/nodes/reorder - Bulk-update rankingCoefficient from drag-and-drop
router.patch('/nodes/reorder', async (req, res) => {
    try {
        const order = req.body.order;

        if (!Array.isArray(order) || order.length === 0 || order.length > 500) {
            return res.status(400).json({ success: false, error: 'Invalid order array' });
        }

        const mongoose = require('mongoose');
        const bulk = [];

        for (const item of order) {
            if (!mongoose.Types.ObjectId.isValid(item.id)) continue;
            const pos = parseInt(item.position, 10);
            if (!Number.isFinite(pos) || pos < 0) continue;
            bulk.push({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(item.id) },
                    update: { $set: { rankingCoefficient: pos } },
                },
            });
        }

        if (bulk.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid entries' });
        }

        const result = await HyNode.bulkWrite(bulk, { ordered: false });
        logger.info(`[Panel] Reorder: ${bulk.length} ops, matched=${result.matchedCount}, modified=${result.modifiedCount}`);

        if (result.matchedCount === 0) {
            return res.status(400).json({ success: false, error: `No nodes matched (${bulk.length} ops sent)` });
        }

        await Promise.all([
            cache.invalidateNodes(),
            cache.invalidateAllSubscriptions(),
        ]);

        res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    } catch (error) {
        logger.error(`[Panel] Reorder nodes error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /panel/nodes - Create node
router.post('/nodes', async (req, res) => {
    try {
        const { name, ip } = req.body;

        if (!name || !ip) {
            return res.redirect(`/panel/nodes/add?error=${encodeURIComponent('Name and IP address are required')}`);
        }

        const existing = await HyNode.findOne({ ip });
        if (existing) {
            return res.redirect(`/panel/nodes/add?error=${encodeURIComponent('A node with this IP already exists')}`);
        }

        const sshPassword = req.body['ssh.password'] || '';
        const encryptedPassword = sshPassword ? cryptoService.encrypt(sshPassword) : '';

        const sshPrivateKeyRaw = req.body['ssh.privateKey'] || '';
        let encryptedPrivateKey = '';
        if (sshPrivateKeyRaw.trim()) {
            if (!sshKeyService.isValidPrivateKey(sshPrivateKeyRaw)) {
                return res.redirect(`/panel/nodes/add?error=${encodeURIComponent('Invalid private key format')}`);
            }
            encryptedPrivateKey = cryptoService.encrypt(sshPrivateKeyRaw.trim());
        }

        let groups = [];
        if (req.body.groups) {
            groups = Array.isArray(req.body.groups) ? req.body.groups : [req.body.groups];
        }

        const nodeType = req.body.type === 'xray' ? 'xray' : 'hysteria';

        const statsSecret = req.body.statsSecret || cryptoService.generateNodeSecret();

        const nodeData = {
            name,
            ip,
            type: nodeType,
            domain: req.body.domain || '',
            sni: req.body.sni || '',
            flag: req.body.flag || '',
            port: parseInt(req.body.port) || 443,
            portRange: req.body.portRange || '20000-50000',
            statsPort: parseInt(req.body.statsPort) || 9999,
            statsSecret,
            groups,
            maxOnlineUsers: parseInt(req.body.maxOnlineUsers) || 0,
            rankingCoefficient: parseFloat(req.body.rankingCoefficient) || 1,
            active: req.body.active === 'on',
            useCustomConfig: req.body.useCustomConfig === 'on',
            customConfig: req.body.customConfig || '',
            cascadeRole: req.body.cascadeRole || 'standalone',
            country: req.body.country || '',
            obfs: {
                type: req.body['obfs.type'] || '',
                password: req.body['obfs.password'] || '',
            },
            ssh: {
                port: parseInt(req.body['ssh.port']) || 22,
                username: req.body['ssh.username'] || 'root',
                password: encryptedPassword,
                privateKey: encryptedPrivateKey,
            },
        };

        if (nodeType === 'xray') {
            nodeData.xray = parseXrayFormFields(req.body);
        } else {
            const hyFields = parseHysteriaFormFields(req.body);
            const hyValidationError = validateHysteriaFormFields(hyFields);
            if (hyValidationError) {
                return res.redirect(`/panel/nodes/add?error=${encodeURIComponent(hyValidationError)}`);
            }
            delete hyFields.acmeDnsConfigValid;
            Object.assign(nodeData, hyFields);
        }

        const newNode = await HyNode.create(nodeData);
        logger.info(`[Panel] Created ${nodeType} node ${name} (${ip})`);
        // Invalidate active-nodes and all subscription caches so changes are reflected immediately
        await Promise.all([
            cache.invalidateNodes(),
            cache.invalidateAllSubscriptions(),
        ]);
        res.redirect(`/panel/nodes/${newNode._id}`);
    } catch (error) {
        logger.error(`[Panel] Create node error: ${error.message}`);
        res.redirect(`/panel/nodes/add?error=${encodeURIComponent(error.message)}`);
    }
});

// POST /panel/nodes/scan-sni - Stream TLS 1.3+H2 scan results as SSE
router.post('/nodes/scan-sni', sniScanLimiter, async (req, res) => {
    const ip      = String(req.body.ip      || '').trim();
    const port    = Math.min(65535, Math.max(1,   parseInt(req.body.port,    10) || 443));
    const threads = Math.min(200,   Math.max(1,   parseInt(req.body.threads, 10) || 50));
    const timeout = Math.min(30,    Math.max(2,   parseInt(req.body.timeout, 10) || 5));

    if (!sniScanner.isValidIpv4(ip)) {
        return res.status(400).json({ error: 'Invalid IPv4 address' });
    }

    res.setHeader('Content-Type',      'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const send = (type, data = {}) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
            // Force flush through compression middleware if present
            if (typeof res.flush === 'function') res.flush();
        }
    };

    try {
        await sniScanner.scanRange({
            ip,
            port,
            threads,
            timeout,
            signal:      controller.signal,
            onResult:    r             => send('result',   r),
            onProgress:  (done, total) => send('progress', { done, total }),
            onVerifying: ()            => send('verifying'),
        });
        send('done');
    } catch (err) {
        logger.error(`[SNI Scan] ${err.message}`);
        send('error', { message: err.message });
    } finally {
        res.end();
    }
});

// POST /panel/nodes/preview-config - Generate config preview from current form values
router.post('/nodes/preview-config', async (req, res) => {
    try {
        const nodeType = req.body.type === 'xray' ? 'xray' : 'hysteria';
        if (nodeType !== 'hysteria') {
            return res.status(400).json({ success: false, error: 'Preview config supports only Hysteria nodes' });
        }

        const hyFields = parseHysteriaFormFields(req.body);
        const hyValidationError = validateHysteriaFormFields(hyFields);
        if (hyValidationError) {
            return res.status(400).json({ success: false, error: hyValidationError });
        }
        delete hyFields.acmeDnsConfigValid;

        const nodeData = {
            type: 'hysteria',
            port: parseInt(req.body.port, 10) || 443,
            domain: (req.body.domain || '').trim(),
            sni: (req.body.sni || '').trim(),
            useTlsFiles: parseBool(req.body, 'useTlsFiles', false),
            obfs: {
                type: req.body['obfs.type'] || '',
                password: req.body['obfs.password'] || '',
            },
            statsPort: parseInt(req.body.statsPort, 10) || 9999,
            statsSecret: req.body.statsSecret || '',
            outbounds: [],
            aclRules: hyFields.aclRules || [],
            ...hyFields,
        };

        const settings = await Settings.get();
        const authInsecure = settings?.nodeAuth?.insecure ?? true;
        const authUrl = `${config.BASE_URL}/api/auth`;
        const useTlsFiles = nodeData.useTlsFiles || !nodeData.domain;

        const generatedConfig = configGenerator.generateNodeConfig(nodeData, authUrl, { authInsecure, useTlsFiles });
        return res.json({ success: true, config: generatedConfig });
    } catch (error) {
        logger.error('[Panel] Preview config generation error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /panel/nodes/:id - Edit node form
router.get('/nodes/:id', async (req, res) => {
    try {
        const CascadeLink = require('../../models/cascadeLinkModel');
        const [node, groups, cascadeLinks, settings] = await Promise.all([
            HyNode.findById(req.params.id).populate('groups', 'name color'),
            getActiveGroups(),
            CascadeLink.find({
                $or: [{ portalNode: req.params.id }, { bridgeNode: req.params.id }],
            }).populate('portalNode', 'name ip flag')
              .populate('bridgeNode', 'name ip flag')
              .sort({ createdAt: -1 }),
            Settings.get(),
        ]);

        if (!node) {
            return res.redirect('/panel/nodes');
        }

        let nodeConfigPreview = '';
        if (node.type !== 'xray') {
            const customConfig = String(node.customConfig || '').trim();
            if (node.useCustomConfig && customConfig) {
                nodeConfigPreview = customConfig;
            } else {
                const authInsecure = settings?.nodeAuth?.insecure ?? true;
                const authUrl = `${config.BASE_URL}/api/auth`;
                const useTlsFiles = !!(node.useTlsFiles || !node.domain);
                nodeConfigPreview = configGenerator.generateNodeConfig(node, authUrl, { authInsecure, useTlsFiles });
            }
        }

        render(res, 'node-form', {
            title: `${res.locals.t('nodes.editNode')}: ${node.name}`,
            page: 'nodes',
            node,
            nodeConfigPreview,
            groups,
            cascadeLinks: cascadeLinks || [],
            error: req.query.error || null,
            panelDomain: config.PANEL_DOMAIN || '',
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /panel/nodes/:id - Update node
router.post('/nodes/:id', async (req, res) => {
    const nodeId = req.params.id;
    try {
        const { name, ip } = req.body;

        if (!name || !ip) {
            return res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent('Name and IP address are required')}`);
        }

        let groups = [];
        if (req.body.groups) {
            groups = Array.isArray(req.body.groups) ? req.body.groups : [req.body.groups];
        }

        const nodeType = req.body.type === 'xray' ? 'xray' : 'hysteria';

        const updates = {
            name,
            ip,
            type: nodeType,
            domain: req.body.domain || '',
            sni: req.body.sni || '',
            port: parseInt(req.body.port) || 443,
            portRange: req.body.portRange || '20000-50000',
            statsPort: parseInt(req.body.statsPort) || 9999,
            groups,
            maxOnlineUsers: parseInt(req.body.maxOnlineUsers) || 0,
            rankingCoefficient: parseFloat(req.body.rankingCoefficient) || 1,
            active: req.body.active === 'on',
            useCustomConfig: req.body.useCustomConfig === 'on',
            customConfig: req.body.customConfig || '',
            obfs: {
                type: req.body['obfs.type'] || '',
                password: req.body['obfs.password'] || '',
            },
            flag: req.body.flag || '',
            cascadeRole: req.body.cascadeRole || 'standalone',
            country: req.body.country || '',
            'ssh.port': parseInt(req.body['ssh.port']) || 22,
            'ssh.username': req.body['ssh.username'] || 'root',
        };

        if (req.body.statsSecret) {
            updates.statsSecret = req.body.statsSecret;
        }

        if (nodeType === 'xray') {
            updates.xray = parseXrayFormFields(req.body);
        } else {
            const hyFields = parseHysteriaFormFields(req.body);
            const hyValidationError = validateHysteriaFormFields(hyFields);
            if (hyValidationError) {
                return res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent(hyValidationError)}`);
            }
            delete hyFields.acmeDnsConfigValid;
            Object.assign(updates, hyFields);
        }

        if (req.body['ssh.password']) {
            updates['ssh.password'] = cryptoService.encrypt(req.body['ssh.password']);
        }

        if (req.body['ssh.clearPrivateKey'] === '1') {
            updates['ssh.privateKey'] = '';
        } else if (req.body['ssh.privateKey'] && req.body['ssh.privateKey'].trim()) {
            const rawKey = req.body['ssh.privateKey'].trim();
            if (!sshKeyService.isValidPrivateKey(rawKey)) {
                return res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent('Invalid private key format')}`);
            }
            updates['ssh.privateKey'] = cryptoService.encrypt(rawKey);
        }

        await HyNode.findByIdAndUpdate(nodeId, { $set: updates });
        // Invalidate active-nodes and all subscription caches so ranking/config changes apply immediately
        await Promise.all([
            cache.invalidateNodes(),
            cache.invalidateAllSubscriptions(),
        ]);
        res.redirect('/panel/nodes');
    } catch (error) {
        logger.error(`[Panel] Update node error: ${error.message}`);
        res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent(error.message)}`);
    }
});

// POST /panel/nodes/:id/setup - Auto-setup node via SSH
router.post('/nodes/:id/setup', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена', logs: [] });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены', logs: [] });
        }

        const job = getSetupJob(req.params.id);
        if (job?.state === 'running') {
            return res.status(202).json({
                success: true,
                running: true,
                state: 'running',
                message: 'Setup уже выполняется',
                logs: job.logs || [],
                startedAt: job.startedAt,
            });
        }

        const startedAt = Date.now();
        setSetupJob(req.params.id, {
            state: 'running',
            startedAt,
            finishedAt: null,
            logs: [`[${new Date(startedAt).toISOString()}] Setup queued...`],
            error: '',
            message: '',
        });

        setImmediate(() => {
            runNodeSetupJob(req.params.id).catch((err) => {
                logger.error(`[Panel] setup background runner fatal: ${err.message}`);
            });
        });

        res.status(202).json({
            success: true,
            running: true,
            state: 'running',
            message: 'Setup запущен в фоне',
            logs: getSetupJob(req.params.id)?.logs || [],
            startedAt,
        });
    } catch (error) {
        logger.error(`[Panel] Setup error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message, logs: [`Exception: ${error.message}`] });
    }
});

// GET /panel/nodes/:id/setup-status - Poll background setup status
router.get('/nodes/:id/setup-status', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('status lastError lastSync');
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }

        const job = getSetupJob(req.params.id);
        if (!job) {
            return res.json({
                success: true,
                state: 'idle',
                running: false,
                logs: [],
                nodeStatus: node.status || 'unknown',
                lastError: node.lastError || '',
                lastSync: node.lastSync || null,
            });
        }

        return res.json({
            success: true,
            state: job.state,
            running: job.state === 'running',
            message: job.message || '',
            error: job.error || '',
            logs: Array.isArray(job.logs) ? job.logs : [],
            startedAt: job.startedAt || null,
            finishedAt: job.finishedAt || null,
            nodeStatus: node.status || 'unknown',
            lastError: node.lastError || '',
            lastSync: node.lastSync || null,
        });
    } catch (error) {
        logger.error(`[Panel] setup-status error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /panel/nodes/:id/generate-ssh-key - Generate and install ed25519 SSH key
router.post('/nodes/:id/generate-ssh-key', generateSshKeyLimiter, async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);

        if (!node) {
            return res.status(404).json({ success: false, error: 'Node not found' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH credentials not configured. Add a password or existing key first.' });
        }

        logger.info(`[Panel] Generating SSH key for node ${node.name}`);

        const conn = await connectNodeSSH(node);

        const { privateKey, publicKey } = sshKeyService.generateEd25519KeyPair();
        await sshKeyService.installPublicKey(conn, publicKey);
        conn.end();

        const encryptedKey = cryptoService.encrypt(privateKey);
        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: { 'ssh.privateKey': encryptedKey },
        });

        logger.info(`[Panel] SSH key installed on ${node.name}`);
        res.json({ success: true, message: 'SSH key generated and installed successfully' });
    } catch (error) {
        logger.error(`[Panel] SSH key generation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /panel/nodes/:id/download-ssh-key - Download stored SSH private key
router.get('/nodes/:id/download-ssh-key', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('name ip ssh.privateKey');

        if (!node) {
            return res.status(404).type('text/plain; charset=utf-8').send('Node not found');
        }

        if (!node.ssh?.privateKey) {
            return res.status(404).type('text/plain; charset=utf-8').send('SSH private key not configured');
        }

        const privateKey = cryptoService.decryptPrivateKey(node.ssh.privateKey);
        const filename = buildSshKeyFilename(node);

        logger.info(`[Panel] SSH private key downloaded for node ${node.name}`);

        res.set({
            'Content-Type': 'application/x-pem-file; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        return res.send(privateKey);
    } catch (error) {
        logger.error(`[Panel] SSH key download error: ${error.message}`);
        return res.status(500).type('text/plain; charset=utf-8').send('Failed to download SSH private key');
    }
});

// GET /panel/nodes/:id/stats - Node system stats via SSH
router.get('/nodes/:id/stats', async (req, res) => {
    let ssh;
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }
        
        ssh = new NodeSSH(node);
        await ssh.connect();
        const stats = await ssh.getSystemStats();
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (ssh) ssh.disconnect();
    }
});

// GET /panel/nodes/:id/speed - Node network speed
router.get('/nodes/:id/speed', async (req, res) => {
    let ssh;
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }
        
        ssh = new NodeSSH(node);
        await ssh.connect();
        const speed = await ssh.getNetworkSpeed();
        
        res.json(speed);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (ssh) ssh.disconnect();
    }
});

// GET /panel/nodes/:id/get-config - Read current config from node
router.get('/nodes/:id/get-config', async (req, res) => {
    let conn;
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }
        
        conn = await nodeSetup.connectSSH(node);
        const configPath = node.type === 'xray'
            ? '/usr/local/etc/xray/config.json'
            : (node.paths?.config || '/etc/hysteria/config.yaml');
        const result = await nodeSetup.execSSH(conn, `cat ${shellQuote(configPath)}`);
        
        if (result.success) {
            res.json({ success: true, config: result.output });
        } else {
            res.json({ success: false, error: result.error || 'Не удалось прочитать конфиг' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (conn) conn.end();
    }
});

// GET /panel/nodes/:id/logs - Node logs
router.get('/nodes/:id/logs', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);

        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }

        logger.debug(`[Panel] Getting logs for node ${node.name} (type: ${node.type})`);
        const result = node.type === 'xray'
            ? await nodeSetup.getXrayNodeLogs(node, 100)
            : await nodeSetup.getNodeLogs(node, 100);
        res.json(result);
    } catch (error) {
        logger.error(`[Panel] Get logs error for node ${req.params.id}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /panel/nodes/:id/smoke-check-hybrid - Run hybrid cascade smoke-check on Hysteria node
router.post('/nodes/:id/smoke-check-hybrid', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        if (!node) {
            return res.status(404).json({ success: false, error: 'Node not found' });
        }
        if (node.type === 'xray') {
            return res.status(400).json({ success: false, error: 'Smoke-check is supported only for Hysteria nodes' });
        }
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH credentials not configured' });
        }

        const result = await runHybridSidecarSmokeCheck(node);
        logger.info(
            `[Panel] Hybrid smoke-check for ${node.name}: PASS=${result.summary.passed}, FAIL=${result.summary.failed}`
        );
        return res.json(result);
    } catch (error) {
        logger.error(`[Panel] Hybrid smoke-check error for node ${req.params.id}: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== OUTBOUNDS ====================

// GET /panel/nodes/:id/outbounds - Node outbound management
router.get('/nodes/:id/outbounds', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.redirect('/panel/nodes');
        }

        const aclInlineState = getHysteriaAclInlineState(node);
        
        render(res, 'node-outbounds', {
            title: `Outbounds: ${node.name}`,
            page: 'nodes',
            node,
            aclInlineState,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /panel/nodes/:id/outbounds - Save outbounds and ACL rules
router.post('/nodes/:id/outbounds', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.redirect('/panel/nodes');
        }

        const aclInlineState = getHysteriaAclInlineState(node);
        
        const outbounds = [];
        const rawBody = req.body;
        
        if (rawBody.outbound_name) {
            const names = Array.isArray(rawBody.outbound_name) ? rawBody.outbound_name : [rawBody.outbound_name];
            const types = Array.isArray(rawBody.outbound_type) ? rawBody.outbound_type : [rawBody.outbound_type];
            const addrs = Array.isArray(rawBody.outbound_addr) ? rawBody.outbound_addr : [rawBody.outbound_addr || ''];
            const usernames = Array.isArray(rawBody.outbound_username) ? rawBody.outbound_username : [rawBody.outbound_username || ''];
            const passwords = Array.isArray(rawBody.outbound_password) ? rawBody.outbound_password : [rawBody.outbound_password || ''];
            
            for (let i = 0; i < names.length; i++) {
                const name = (names[i] || '').trim();
                const type = (types[i] || '').trim();
                
                if (!name || !type) continue;
                if (name === RESERVED_CASCADE_OUTBOUND) continue;
                if (!['direct', 'block', 'socks5', 'http'].includes(type)) continue;
                
                outbounds.push({
                    name,
                    type,
                    addr: (addrs[i] || '').trim(),
                    username: (usernames[i] || '').trim(),
                    password: (passwords[i] || '').trim(),
                });
            }
        }
        
        let aclRules = Array.isArray(node.aclRules) ? node.aclRules : [];
        if (aclInlineState.editable) {
            const aclRaw = (rawBody.aclRules || '').trim();
            aclRules = aclRaw
                ? aclRaw.split('\n').map(r => r.trim()).filter(Boolean)
                : [];
        }
        aclRules = aclRules.filter(rule => !String(rule || '').startsWith(`${RESERVED_CASCADE_OUTBOUND}(`));
        
        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: { outbounds, aclRules },
        });
        
        logger.info(`[Panel] Outbounds updated for node: ${node.name} (${outbounds.length} outbounds, ${aclRules.length} ACL rules)`);
        
        res.redirect(`/panel/nodes/${req.params.id}/outbounds?message=` + encodeURIComponent('Outbounds сохранены'));
    } catch (error) {
        logger.error('[Panel] Outbounds save error:', error.message);
        res.redirect(`/panel/nodes/${req.params.id}/outbounds?error=` + encodeURIComponent(`${res.locals.t?.('common.error') || 'Error'}: ${error.message}`));
    }
});

// GET /panel/nodes/:id/terminal - SSH terminal
router.get('/nodes/:id/terminal', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.redirect('/panel/nodes');
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).send('SSH данные не настроены для этой ноды');
        }
        
        res.render('terminal', { node });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /panel/network - Redirect to nodes page (network map is a tab there)
router.get('/network', (req, res) => {
    res.redirect('/panel/nodes');
});

// ==================== STATS ====================

// GET /panel/stats - Stats page
router.get('/stats', async (req, res) => {
    try {
        const summary = await statsService.getSummary();
        
        render(res, 'stats', {
            title: res.locals.locales.stats.title,
            page: 'stats',
            summary,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /panel/stats/api/summary - Summary stats
router.get('/stats/api/summary', async (req, res) => {
    try {
        const summary = await statsService.getSummary();
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/online - Online chart data
router.get('/stats/api/online', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getOnlineChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/traffic - Traffic chart data
router.get('/stats/api/traffic', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getTrafficChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/nodes - Nodes chart data
router.get('/stats/api/nodes', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getNodesChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /panel/stats/cleanup - Manual old data cleanup
router.post('/stats/cleanup', async (req, res) => {
    try {
        const result = await statsService.cleanup();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/ssh-pool - SSH pool stats
router.get('/stats/api/ssh-pool', async (req, res) => {
    try {
        const sshPool = require('../../services/sshPoolService');
        res.json(sshPool.getStats());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /nodes/:id/restart - Restart node service via SSH
router.post('/nodes/:id/restart', async (req, res) => {
    let conn;
    try {
        const node = await HyNode.findById(req.params.id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ error: 'SSH credentials not configured' });
        }

        conn = await nodeSetup.connectSSH(node);
        const restartCmd = node.type === 'xray'
            ? 'systemctl restart xray && sleep 2 && (systemctl is-active xray 2>/dev/null || true) | head -n 1'
            : '(systemctl restart hysteria-server 2>/dev/null || systemctl restart hysteria 2>/dev/null) && sleep 2 && (systemctl is-active hysteria-server 2>/dev/null || systemctl is-active hysteria 2>/dev/null || true) | head -n 1';
        const result = await nodeSetup.execSSH(conn, restartCmd);

        const serviceState = String(result.output || '').trim().split('\n')[0].trim();
        const isActive = result.success && serviceState === 'active';

        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: { status: isActive ? 'online' : 'error', lastSync: new Date() }
        });

        res.json({ success: isActive, output: result.output });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (conn) conn.end();
    }
});

module.exports = router;
