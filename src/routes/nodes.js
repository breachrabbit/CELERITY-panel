/**
 * API для управления нодами Hysteria + Xray
 */

const express = require('express');
const router = express.Router();
const HyNode = require('../models/hyNodeModel');
const HyUser = require('../models/hyUserModel');
const ServerGroup = require('../models/serverGroupModel');
const cryptoService = require('../services/cryptoService');
const cache = require('../services/cacheService');
const nodeSetup = require('../services/nodeSetup');
const logger = require('../utils/logger');
const { requireScope } = require('../middleware/auth');

/**
 * Инвалидация кэша при изменении нод
 */
async function invalidateNodesCache() {
    await cache.invalidateNodes();
    await cache.invalidateAllSubscriptions();
    await cache.invalidateDashboardCounts();
}

async function resolveNodePortForSameHost(ip, requestedPort) {
    const normalizedPort = Number(requestedPort) || 443;
    const sameVps = await nodeSetup.isSameVpsAsPanel({ ip, domain: '' });
    if (!sameVps) {
        return { port: normalizedPort, adjusted: false };
    }

    const chosenPort = await nodeSetup.pickSameHostNodePort(normalizedPort);
    return {
        port: chosenPort,
        adjusted: chosenPort !== normalizedPort,
        requestedPort: normalizedPort,
    };
}

function parseCascadeSidecar(value) {
    const fail = (msg) => {
        throw new Error(`Invalid cascadeSidecar: ${msg}`);
    };

    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail('must be an object');
    }

    const out = {};

    if (value.enabled !== undefined) {
        out.enabled = typeof value.enabled === 'string'
            ? ['true', '1', 'on', 'yes'].includes(value.enabled.toLowerCase())
            : !!value.enabled;
    }

    if (value.socksPort !== undefined) {
        const socksPort = parseInt(value.socksPort, 10);
        if (!Number.isInteger(socksPort) || socksPort < 1 || socksPort > 65535) {
            fail('socksPort must be between 1 and 65535');
        }
        out.socksPort = socksPort;
    }

    if (value.serviceName !== undefined) {
        const serviceName = String(value.serviceName || '').trim();
        if (!serviceName || !/^[A-Za-z0-9_.@-]+$/.test(serviceName)) {
            fail('serviceName contains invalid characters');
        }
        out.serviceName = serviceName;
    }

    if (value.configPath !== undefined) {
        const configPath = String(value.configPath || '').trim();
        if (!configPath.startsWith('/')) {
            fail('configPath must be an absolute path');
        }
        out.configPath = configPath;
    }

    return out;
}

function isInputValidationError(error) {
    return String(error?.message || '').startsWith('Invalid cascadeSidecar: ');
}

/**
 * GET /nodes - Список всех нод
 */
router.get('/', requireScope('nodes:read'), async (req, res) => {
    try {
        const { active, group, status } = req.query;
        
        const filter = {};
        if (active !== undefined) filter.active = active === 'true';
        if (group) filter.groups = group;
        if (status) filter.status = status;
        
        const nodes = await HyNode.find(filter)
            .populate('groups', 'name color')
            .sort({ name: 1 });
        
        res.json(nodes);
    } catch (error) {
        logger.error(`[Nodes API] List error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /nodes/:id - Получить ноду
 */
router.get('/:id', requireScope('nodes:read'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).populate('groups', 'name color');
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        // Считаем пользователей на этой ноде
        const userCount = await HyUser.countDocuments({
            nodes: node._id,
            enabled: true
        });
        
        res.json({
            ...node.toObject(),
            userCount,
        });
    } catch (error) {
        logger.error(`[Nodes API] Get node error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes - Создать ноду
 */
router.post('/', requireScope('nodes:write'), async (req, res) => {
    try {
        const {
            name, ip, domain, sni, port, portRange, statsPort,
            groups, ssh, paths, settings, rankingCoefficient,
            type, xray, cascadeRole, country,
            hopInterval, acme, masquerade, bandwidth,
            ignoreClientBandwidth, speedTest, disableUDP,
            udpIdleTimeout, sniff, quic, resolver, acl,
            aclRules, useTlsFiles, cascadeSidecar,
        } = req.body;
        
        if (!name || !ip) {
            return res.status(400).json({ error: 'name и ip обязательны' });
        }

        if (type && !['hysteria', 'xray'].includes(type)) {
            return res.status(400).json({ error: 'type должен быть hysteria или xray' });
        }
        
        // Проверяем уникальность IP
        const existing = await HyNode.findOne({ ip });
        if (existing) {
            return res.status(409).json({ error: 'Нода с таким IP уже существует' });
        }
        
        // Генерируем секрет для API статистики (Hysteria)
        const statsSecret = cryptoService.generateNodeSecret();
        
        const sameHostPort = await resolveNodePortForSameHost(ip, port || 443);

        const nodeData = {
            name,
            ip,
            type: type || 'hysteria',
            domain: domain || '',
            sni: sni || '',
            port: sameHostPort.port,
            portRange: portRange || '20000-50000',
            statsPort: statsPort || 9999,
            statsSecret,
            groups: groups || [],
            ssh: cryptoService.encryptSshCredentials(ssh || {}),
            paths: paths || {},
            settings: settings || {},
            rankingCoefficient: rankingCoefficient || 1.0,
            cascadeRole: cascadeRole || 'standalone',
            country: country || '',
            active: true,
            status: 'offline',
        };

        if (type === 'xray' && xray) {
            nodeData.xray = xray;
        }

        const parsedSidecar = parseCascadeSidecar(cascadeSidecar);
        if (parsedSidecar !== undefined) {
            nodeData.cascadeSidecar = parsedSidecar;
        }

        // Hysteria 2 advanced configuration fields
        const hy2Fields = { hopInterval, acme, masquerade, bandwidth, ignoreClientBandwidth, speedTest, disableUDP, udpIdleTimeout, sniff, quic, resolver, acl, aclRules, useTlsFiles };
        for (const [key, value] of Object.entries(hy2Fields)) {
            if (value !== undefined) nodeData[key] = value;
        }

        const node = new HyNode(nodeData);
        await node.save();
        
        // Инвалидируем кэш
        await invalidateNodesCache();
        
        logger.info(`[Nodes API] Created ${type || 'hysteria'} node ${name} (${ip})`);
        if (sameHostPort.adjusted) {
            logger.warn(`[Nodes API] Auto-adjusted same-host node port for ${name}: ${sameHostPort.requestedPort} -> ${sameHostPort.port}`);
        }

        const response = node.toObject ? node.toObject() : node;
        if (sameHostPort.adjusted) {
            response.autoAdjustedPort = {
                from: sameHostPort.requestedPort,
                to: sameHostPort.port,
            };
        }
        
        res.status(201).json(response);
    } catch (error) {
        logger.error(`[Nodes API] Create node error: ${error.message}`);
        if (isInputValidationError(error)) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /nodes/:id - Обновить ноду
 */
router.put('/:id', requireScope('nodes:write'), async (req, res) => {
    try {
        const allowedUpdates = [
            'name', 'domain', 'sni', 'port', 'portRange', 'statsPort',
            'groups', 'ssh', 'paths', 'settings', 'active', 'rankingCoefficient',
            'type', 'xray', 'cascadeRole', 'country',
            'hopInterval', 'acme', 'masquerade', 'bandwidth',
            'ignoreClientBandwidth', 'speedTest', 'disableUDP',
            'udpIdleTimeout', 'sniff', 'quic', 'resolver', 'acl',
            'aclRules', 'useTlsFiles', 'cascadeSidecar',
        ];
        
        const updates = {};
        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                updates[key] = key === 'ssh'
                    ? cryptoService.encryptSshCredentials(req.body[key])
                    : key === 'cascadeSidecar'
                        ? parseCascadeSidecar(req.body[key])
                    : req.body[key];
            }
        }
        
        let autoAdjustedPort = null;
        const targetIp = updates.ip ?? (await HyNode.findById(req.params.id).select('ip').lean())?.ip;
        if (updates.port !== undefined && targetIp) {
            const sameHostPort = await resolveNodePortForSameHost(targetIp, updates.port);
            updates.port = sameHostPort.port;
            autoAdjustedPort = sameHostPort.adjusted
                ? { from: sameHostPort.requestedPort, to: sameHostPort.port }
                : null;
        }

        const node = await HyNode.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true }
        ).populate('groups', 'name color');
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        // Инвалидируем кэш
        await invalidateNodesCache();
        
        logger.info(`[Nodes API] Updated node ${node.name}`);
        
        const response = node.toObject ? node.toObject() : node;
        if (autoAdjustedPort) {
            logger.warn(`[Nodes API] Auto-adjusted same-host node port for ${node.name}: ${autoAdjustedPort.from} -> ${autoAdjustedPort.to}`);
            response.autoAdjustedPort = autoAdjustedPort;
        }

        res.json(response);
    } catch (error) {
        logger.error(`[Nodes API] Update error: ${error.message}`);
        if (isInputValidationError(error)) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /nodes/:id - Удалить ноду
 */
router.delete('/:id', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findByIdAndDelete(req.params.id);
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        // Удаляем ноду из списка пользователей
        await HyUser.updateMany(
            { nodes: node._id },
            { $pull: { nodes: node._id } }
        );
        
        // Инвалидируем кэш
        await invalidateNodesCache();
        
        logger.info(`[Nodes API] Deleted node ${node.name}`);
        
        res.json({ success: true, message: 'Нода удалена' });
    } catch (error) {
        logger.error(`[Nodes API] Delete error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /nodes/:id/status - Получить статус ноды
 */
router.get('/:id/status', requireScope('nodes:read'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('name status lastError onlineUsers lastSync');
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        res.json({
            name: node.name,
            status: node.status,
            lastError: node.lastError,
            onlineUsers: node.onlineUsers,
            lastSync: node.lastSync,
        });
    } catch (error) {
        logger.error(`[Nodes API] Get status error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/reset-status - Сброс статуса ноды на online
 */
router.post('/:id/reset-status', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'online', lastError: '', healthFailures: 0 } },
            { new: true }
        );
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        logger.info(`[Nodes API] Node ${node.name} status reset to online`);
        
        res.json({ success: true, message: 'Статус сброшен', node });
    } catch (error) {
        logger.error(`[Nodes API] Status reset error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /nodes/:id/agent-info - Fetch live info from CC Agent (version, users, uptime)
 */
router.get('/:id/agent-info', requireScope('nodes:read'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        if (!node) return res.status(404).json({ error: 'Node not found' });
        if (node.type !== 'xray') return res.status(400).json({ error: 'Not an Xray node' });

        const syncService = require('../services/syncService');
        const runtimeNode = await syncService._ensureXrayAgentReady(node);
        const response = await syncService._agentRequest(runtimeNode, 'GET', '/info');
        res.json(response.data);
    } catch (error) {
        logger.error(`[Nodes API] agent-info error: ${error.message}`);
        res.status(502).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/sync - Принудительная синхронизация ноды
 */
router.post('/:id/sync', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'syncing' } },
            { new: true }
        );
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        const syncService = require('../services/syncService');
        syncService.updateNodeConfig(node).catch(err => {
            logger.error(`[Nodes API] Sync error for ${node.name}: ${err.message}`);
        });
        
        logger.info(`[Nodes API] Started sync for node ${node.name}`);
        
        res.json({ success: true, message: 'Синхронизация запущена' });
    } catch (error) {
        logger.error(`[Nodes API] Start sync error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /nodes/:id/users - Пользователи на ноде
 */
router.get('/:id/users', requireScope('nodes:read'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        const users = await HyUser.find({
            nodes: node._id,
            enabled: true
        }).select('userId username traffic');
        
        res.json(users);
    } catch (error) {
        logger.error(`[Nodes API] Get users error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/groups - Добавить ноду в группы
 */
router.post('/:id/groups', requireScope('nodes:write'), async (req, res) => {
    try {
        const { groups } = req.body;
        
        if (!Array.isArray(groups)) {
            return res.status(400).json({ error: 'groups должен быть массивом' });
        }
        
        const node = await HyNode.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { groups: { $each: groups } } },
            { new: true }
        ).populate('groups', 'name color');
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        // Инвалидируем кэш
        await invalidateNodesCache();
        
        logger.info(`[Nodes API] Added groups for node ${node.name}`);
        res.json(node);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /nodes/:id/groups/:groupId - Удалить ноду из группы
 */
router.delete('/:id/groups/:groupId', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findByIdAndUpdate(
            req.params.id,
            { $pull: { groups: req.params.groupId } },
            { new: true }
        ).populate('groups', 'name color');
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        // Инвалидируем кэш
        await invalidateNodesCache();
        
        logger.info(`[Nodes API] Removed group ${req.params.groupId} from node ${node.name}`);
        res.json(node);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /nodes/:id/config - Получить текущий конфиг ноды
 */
router.get('/:id/config', requireScope('nodes:read'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        // Генерируем конфиг с HTTP авторизацией
        const configGenerator = require('../services/configGenerator');
        const config = require('../../config');
        
        const baseUrl = process.env.BASE_URL || `http://localhost:${config.PORT}`;
        const authUrl = `${baseUrl}/api/auth`;
        
        const configContent = configGenerator.generateNodeConfig(node, authUrl);
        
        res.type('text/yaml').send(configContent);
    } catch (error) {
        logger.error(`[Nodes API] Config generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/setup-port-hopping - Настройка port hopping на ноде
 */
router.post('/:id/setup-port-hopping', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        const syncService = require('../services/syncService');
        const success = await syncService.setupPortHopping(node);
        
        if (success) {
            res.json({ success: true, message: 'Port hopping настроен' });
        } else {
            res.status(500).json({ error: 'Не удалось настроить port hopping' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/update-config - Обновить конфиг на ноде через SSH
 */
router.post('/:id/update-config', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ error: 'Нода не найдена' });
        }
        
        const syncService = require('../services/syncService');
        const success = await syncService.updateNodeConfig(node);
        
        if (success) {
            res.json({ success: true, message: 'Конфиг обновлён' });
        } else {
            res.status(500).json({ error: 'Не удалось обновить конфиг' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/generate-xray-keys - Generate x25519 Reality keys via SSH
 * Saves the keys to the node and returns the public key.
 */
router.post('/:id/generate-xray-keys', requireScope('nodes:write'), async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);

        if (!node) return res.status(404).json({ error: 'Нода не найдена' });
        if (node.type !== 'xray') return res.status(400).json({ error: 'Нода не является Xray-нодой' });
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ error: 'SSH credentials not configured' });
        }

        const nodeSetup = require('../services/nodeSetup');
        const { connectSSH, generateX25519Keys } = nodeSetup;

        const conn = await connectSSH(node);
        let keys;
        try {
            keys = await generateX25519Keys(conn);
        } finally {
            conn.end();
        }

        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: {
                'xray.realityPrivateKey': keys.privateKey,
                'xray.realityPublicKey': keys.publicKey,
            },
        });

        await invalidateNodesCache();

        logger.info(`[Nodes API] x25519 keys generated for ${node.name}`);
        res.json({ success: true, privateKey: keys.privateKey, publicKey: keys.publicKey });
    } catch (error) {
        logger.error(`[Nodes API] Generate xray keys error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /nodes/:id/setup - Auto-setup node via SSH
 *
 * Installs Hysteria, generates certs, configures port hopping, opens firewall ports
 * and starts the service — same as the one-click setup in the web panel.
 *
 * This is a long-running operation (30s–2min). The response is returned only after
 * all steps complete. Set your HTTP client timeout accordingly (e.g. 3–5 minutes).
 *
 * Body (all optional, all default to true):
 *   installHysteria  {boolean}  Install/update Hysteria binary
 *   setupPortHopping {boolean}  Configure iptables NAT rules for port range
 *   restartService   {boolean}  Enable and restart hysteria-server systemd unit
 *
 * Returns:
 *   200 { success: true,  logs: string[] }
 *   500 { success: false, error: string, logs: string[] }
 */
router.post('/:id/setup', requireScope('nodes:write'), async (req, res) => {
    let logs = [];
    try {
        const node = await HyNode.findById(req.params.id);

        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ error: 'SSH credentials not configured for this node' });
        }

        const {
            installHysteria  = true,
            setupPortHopping = true,
            restartService   = true,
        } = req.body || {};

        logger.info(`[Nodes API] Auto-setup started for ${node.name} (${node.ip}) via API`);

        const nodeSetup = require('../services/nodeSetup');
        const syncService = require('../services/syncService');

        let result;
        if (node.type === 'xray' && node.cascadeRole === 'bridge') {
            result = await nodeSetup.setupXrayNode(node, { restartService: false, exitOnly: true });
        } else if (node.type === 'xray') {
            result = await nodeSetup.setupXrayNodeWithAgent(node, { restartService, strictAgent: false });
        } else {
            result = await nodeSetup.setupNode(node, {
                installHysteria,
                setupPortHopping,
                restartService,
            });
        }

        if (result.success) {
            logs = Array.isArray(result.logs) ? [...result.logs] : [];
            if (node.type === 'xray') {
                logs.push('[Xray] Finalizing setup with cascade/config sync...');
                const finalization = await syncService.finalizeNodeSetup(node);
                if (finalization.mode === 'cascade') {
                    logs.push(`[Cascade] Chain deployment completed (${finalization.deployed} node(s) updated)`);
                } else if (finalization.mode === 'xray-sync') {
                    logs.push('[Xray] Post-setup sync completed');
                } else if (finalization.mode === 'bridge-ready') {
                    logs.push('[Bridge] Xray binary installed; waiting for cascade link deployment');
                }
            }

            const updateFields = { status: 'online', lastSync: new Date(), lastError: '', healthFailures: 0 };
            if (node.type !== 'xray') updateFields.useTlsFiles = result.useTlsFiles;
            await HyNode.findByIdAndUpdate(req.params.id, { $set: updateFields });
            await invalidateNodesCache();
            logger.info(`[Nodes API] Auto-setup completed for ${node.name} (${node.type})`);
            res.json({ success: true, logs });
        } else {
            await HyNode.findByIdAndUpdate(req.params.id, {
                $set: { status: 'error', lastError: result.error, healthFailures: 0 },
            });
            logger.warn(`[Nodes API] Auto-setup failed for ${node.name}: ${result.error}`);
            res.status(500).json({ success: false, error: result.error, logs: result.logs });
        }
    } catch (error) {
        logger.error(`[Nodes API] Setup error: ${error.message}`);
        res.status(500).json({ error: error.message, logs });
    }
});

module.exports = router;
