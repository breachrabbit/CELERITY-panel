/**
 * Cascade service — manages Xray reverse-proxy tunnels between nodes.
 *
 * Handles deployment, health checking, and topology retrieval for
 * CascadeLink connections (Portal <-> Bridge pairs).
 */

const net = require('net');
const path = require('path');
const appConfig = require('../../config');
const CascadeLink = require('../models/cascadeLinkModel');
const HyNode = require('../models/hyNodeModel');
const Settings = require('../models/settingsModel');
const configGenerator = require('./configGenerator');
const NodeSSH = require('./nodeSSH');
const cache = require('./cacheService');
const logger = require('../utils/logger');
const webhook = require('./webhookService');

const TOPOLOGY_CACHE_KEY = 'c3:cascade:topology';
const TOPOLOGY_CACHE_TTL = 15;
const HYBRID_DISABLED_ERROR = 'Hybrid cascade is disabled. Enable FEATURE_CASCADE_HYBRID=true or turn it on in Settings > System';
const CASCADE_SIDECAR_OUTBOUND = '__cascade_sidecar__';

/**
 * Safe Redis helpers — cache module exposes .redis but may not be connected.
 */
async function cacheGet(key) {
    try { return cache.redis?.get ? await cache.redis.get(key) : null; } catch { return null; }
}
async function cacheSet(key, value, ttl) {
    try { if (cache.redis?.set) await cache.redis.set(key, value, 'EX', ttl); } catch {}
}
async function cacheDel(key) {
    try { if (cache.redis?.del) await cache.redis.del(key); } catch {}
}

function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

class CascadeService {
    _isXrayNode(node) {
        return node && node.type === 'xray';
    }

    _needsHybridCascade(portalNode, bridgeNode) {
        return !this._isXrayNode(portalNode) || !this._isXrayNode(bridgeNode);
    }

    _resolveCascadeStack(portalNode, bridgeNode) {
        const portalType = String(portalNode?.type || '').toLowerCase();
        const bridgeType = String(bridgeNode?.type || '').toLowerCase();
        if (portalType === 'xray' && bridgeType === 'xray') return 'xray';
        if (portalType === 'hysteria' && bridgeType === 'hysteria') return 'hysteria2';
        return 'hybrid';
    }

    _assertLinkCompatibility(link, portalNode, bridgeNode) {
        if (this._needsHybridCascade(portalNode, bridgeNode) && !appConfig.FEATURE_CASCADE_HYBRID) {
            const linkName = link?.name ? ` "${link.name}"` : '';
            throw new Error(`${HYBRID_DISABLED_ERROR}. Cannot deploy link${linkName} (${portalNode?.type || 'unknown'} -> ${bridgeNode?.type || 'unknown'}).`);
        }
    }

    /**
     * Deploy a single cascade link: upload configs to both Portal and Bridge,
     * restart services, and verify tunnel establishment.
     * @param {Object} link - CascadeLink document (populated with portalNode, bridgeNode)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deployLink(link) {
        const linkId = link._id;
        logger.info(`[Cascade] Deploying ${link.mode || 'reverse'} link ${link.name} (${linkId})`);

        await CascadeLink.updateOne({ _id: linkId }, { $set: { status: 'pending', lastError: '' } });

        const portalNode = link.portalNode._id ? link.portalNode : await HyNode.findById(link.portalNode);
        const bridgeNode = link.bridgeNode._id ? link.bridgeNode : await HyNode.findById(link.bridgeNode);

        if (!portalNode || !bridgeNode) {
            const err = 'Portal or Bridge node not found';
            await CascadeLink.updateOne({ _id: linkId }, { $set: { status: 'error', lastError: err } });
            return { success: false, error: err };
        }

        try {
            this._assertLinkCompatibility(link, portalNode, bridgeNode);

            if (link.mode === 'forward') {
                await this._deployForwardLink(link, portalNode, bridgeNode);
            } else {
                await this._deployReverseLink(link, portalNode, bridgeNode);
            }

            const tunnelPort = link.tunnelPort || 10086;
            await new Promise(r => setTimeout(r, 3000));

            // For forward: check bridge; for reverse: check portal
            const checkNode = link.mode === 'forward' ? bridgeNode : portalNode;
            const [healthy, latencyMs] = await Promise.all([
                link.mode === 'forward'
                    ? this._measureTcpLatency(bridgeNode.ip, tunnelPort).then(ms => ms !== null)
                    : this._checkTunnel(portalNode, tunnelPort),
                this._measureTcpLatency(checkNode.ip, tunnelPort),
            ]);

            const newStatus = healthy ? 'online' : 'deployed';
            await CascadeLink.updateOne({ _id: linkId }, {
                $set: {
                    status:          newStatus,
                    lastError:       '',
                    lastHealthCheck: new Date(),
                    latencyMs:       latencyMs,
                },
            });

            await this._updateNodeRoles();
            await this._invalidateTopologyCache();

            logger.info(`[Cascade] Link ${link.name} deployed, status=${newStatus}`);
            return { success: true };
        } catch (error) {
            logger.error(`[Cascade] Deploy failed for ${link.name}: ${error.message}`);
            await CascadeLink.updateOne({ _id: linkId }, {
                $set: { status: 'error', lastError: error.message },
            });
            return { success: false, error: error.message };
        }
    }

    /**
     * Deploy a reverse-proxy link (original flow).
     */
    async _deployReverseLink(link, portalNode, bridgeNode) {
        await this._deployPortalConfig(portalNode);
        await this._deployBridgeConfig(link, bridgeNode, portalNode);
        await this._openFirewallPort(portalNode, link.tunnelPort || 10086);
    }

    /**
     * Deploy a forward-chain link.
     * Order: bridge first (cascade inbound), then portal (outbound to bridge).
     */
    async _deployForwardLink(link, portalNode, bridgeNode) {
        await this._deployForwardHopConfig(bridgeNode, [link]);
        await this._openFirewallPort(bridgeNode, link.tunnelPort || 10086);
        await this._deployPortalConfig(portalNode);
    }

    /**
     * Undeploy a cascade link: regenerate configs without this link's settings.
     * For reverse mode: regenerate Portal, stop xray-bridge on Bridge.
     * For forward mode: regenerate Portal (remove outbound), regenerate Bridge
     * (remove cascade inbound) if it's an existing Xray node, or stop xray-bridge.
     */
    async undeployLink(link) {
        const portalNode = await HyNode.findById(link.portalNode);
        const bridgeNode = await HyNode.findById(link.bridgeNode);

        // Mark as pending first so _deployPortalConfig excludes this link
        await CascadeLink.updateOne({ _id: link._id }, {
            $set: { status: 'pending', lastError: '' },
        });

        // Regenerate configs — _deployPortalConfig queries status != 'pending'
        // for active links, so this link is excluded
        if (portalNode) {
            try {
                await this._deployPortalConfig(portalNode, { excludeLinkIds: [link._id] });
            } catch (err) {
                logger.warn(`[Cascade] Portal redeploy on undeploy: ${err.message}`);
            }
        }

        if (bridgeNode && (bridgeNode.ssh?.password || bridgeNode.ssh?.privateKey)) {
            const bridgeCanBeRegenerated = bridgeNode.active && (
                bridgeNode.type === 'xray' ||
                (appConfig.FEATURE_CASCADE_HYBRID && bridgeNode.type !== 'xray')
            );
            if (link.mode === 'forward' && bridgeCanBeRegenerated) {
                try {
                    await this._deployPortalConfig(bridgeNode, { excludeLinkIds: [link._id] });
                } catch (err) {
                    logger.warn(`[Cascade] Bridge node redeploy on forward undeploy: ${err.message}`);
                }
            } else {
                const ssh = new NodeSSH(bridgeNode);
                try {
                    await ssh.connect();
                    await ssh.exec('systemctl stop xray-bridge 2>/dev/null; systemctl disable xray-bridge 2>/dev/null');
                    logger.info(`[Cascade] Bridge service stopped on ${bridgeNode.name}`);
                } catch (err) {
                    logger.warn(`[Cascade] Bridge stop on undeploy: ${err.message}`);
                } finally {
                    ssh.disconnect();
                }
            }
        }

        await this._updateNodeRoles();
        await this._invalidateTopologyCache();
    }

    /**
     * Redeploy all cascade links associated with a given node.
     * Called when a node's configuration changes.
     */
    async redeployAllLinksForNode(nodeId) {
        const links = await CascadeLink.find({
            $or: [{ portalNode: nodeId }, { bridgeNode: nodeId }],
            active: true,
            status: { $in: ['deployed', 'online', 'offline'] },
        }).populate('portalNode bridgeNode');

        for (const link of links) {
            await this.deployLink(link).catch(err => {
                logger.error(`[Cascade] Redeploy link ${link.name}: ${err.message}`);
            });
        }
    }

    /**
     * Deploy an entire cascade chain in the correct order.
     * Finds all connected links starting from any node in the chain,
     * builds topological order (Portal → Relay → Bridge), and deploys
     * configs + restarts services with proper delays.
     *
     * @param {string} startNodeId - Any node ID in the chain
     * @returns {Promise<{success: boolean, deployed: number, errors: string[]}>}
     */
    async deployChain(startNodeId) {
        logger.info(`[Cascade] Starting chain deployment from node ${startNodeId}`);

        // 1. Find all links connected to this chain
        const { orderedNodes, orderedLinks } = await this._buildChainOrder(startNodeId);

        if (orderedLinks.length === 0) {
            return { success: true, deployed: 0, errors: [], message: 'No active links found' };
        }

        logger.info(`[Cascade] Chain has ${orderedNodes.length} nodes, ${orderedLinks.length} links`);

        const errors = [];
        let deployed = 0;

        // All links in a chain must use the same mode
        const modes = new Set(orderedLinks.map(l => l.mode || 'reverse'));
        if (modes.size > 1) {
            return { success: false, deployed: 0, errors: ['Mixed reverse/forward links in one chain are not supported'] };
        }
        const chainMode = modes.values().next().value;
        const deployOrder = chainMode === 'forward' ? [...orderedNodes].reverse() : orderedNodes;
        logger.info(`[Cascade] Chain mode: ${chainMode}, deploy order: ${deployOrder.map(n => n.name).join(' → ')}`);

        // Guard against mixed-protocol links when hybrid mode is disabled.
        for (const l of orderedLinks) {
            const portal = l.portalNode?._id ? l.portalNode : null;
            const bridge = l.bridgeNode?._id ? l.bridgeNode : null;
            this._assertLinkCompatibility(l, portal, bridge);
        }

        // 2. Deploy configs in order
        for (let i = 0; i < deployOrder.length; i++) {
            const node = deployOrder[i];
            const nodeLinks = orderedLinks.filter(
                l => String(l.portalNode._id || l.portalNode) === String(node._id) ||
                     String(l.bridgeNode._id || l.bridgeNode) === String(node._id)
            );

            try {
                await this._deployNodeInChain(node, nodeLinks, orderedLinks);
                deployed++;
                logger.info(`[Cascade] Deployed node ${i + 1}/${deployOrder.length}: ${node.name}`);

                if (i < deployOrder.length - 1) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (err) {
                errors.push(`${node.name}: ${err.message}`);
                logger.error(`[Cascade] Failed to deploy ${node.name}: ${err.message}`);
            }
        }

        // 3. Update link statuses after deployment
        await new Promise(r => setTimeout(r, 3000));
        for (const link of orderedLinks) {
            await this.healthCheckLink(link).catch(() => {});
        }

        await this._updateNodeRoles();
        await this._invalidateTopologyCache();

        const success = errors.length === 0;
        logger.info(`[Cascade] Chain deployment complete: ${deployed} nodes, ${errors.length} errors`);

        return { success, deployed, errors };
    }

    /**
     * Build topological order of nodes in the chain.
     * Returns nodes ordered from head (pure Portal) to tail (pure Bridge).
     */
    async _buildChainOrder(startNodeId) {
        // Get all active links
        const allLinks = await CascadeLink.find({ active: true })
            .populate('portalNode bridgeNode')
            .lean();

        if (allLinks.length === 0) {
            return { orderedNodes: [], orderedLinks: [] };
        }

        // Build adjacency: nodeId -> { asPortal: [links], asBridge: [links] }
        const nodeMap = new Map();
        const linkSet = new Set();

        const addNode = (node) => {
            const id = String(node._id || node);
            if (!nodeMap.has(id)) {
                nodeMap.set(id, { node, asPortal: [], asBridge: [] });
            }
            return nodeMap.get(id);
        };

        for (const link of allLinks) {
            const portalId = String(link.portalNode._id || link.portalNode);
            const bridgeId = String(link.bridgeNode._id || link.bridgeNode);

            addNode(link.portalNode).asPortal.push(link);
            addNode(link.bridgeNode).asBridge.push(link);
        }

        // BFS to find all connected nodes starting from startNodeId
        const visited = new Set();
        const queue = [String(startNodeId)];
        const connectedLinks = [];

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (visited.has(nodeId)) continue;
            visited.add(nodeId);

            const entry = nodeMap.get(nodeId);
            if (!entry) continue;

            for (const link of [...entry.asPortal, ...entry.asBridge]) {
                const linkId = String(link._id);
                if (!linkSet.has(linkId)) {
                    linkSet.add(linkId);
                    connectedLinks.push(link);
                }

                const portalId = String(link.portalNode._id || link.portalNode);
                const bridgeId = String(link.bridgeNode._id || link.bridgeNode);

                if (!visited.has(portalId)) queue.push(portalId);
                if (!visited.has(bridgeId)) queue.push(bridgeId);
            }
        }

        // Find head nodes (portals that are not bridges in this chain)
        const bridgeIds = new Set(connectedLinks.map(l => String(l.bridgeNode._id || l.bridgeNode)));
        const portalIds = new Set(connectedLinks.map(l => String(l.portalNode._id || l.portalNode)));

        const headIds = [...portalIds].filter(id => !bridgeIds.has(id));

        // Topological sort from heads
        const orderedNodes = [];
        const orderedNodeIds = new Set();
        const toVisit = headIds.map(id => nodeMap.get(id)?.node).filter(Boolean);

        while (toVisit.length > 0) {
            const node = toVisit.shift();
            const nodeId = String(node._id);

            if (orderedNodeIds.has(nodeId)) continue;
            orderedNodeIds.add(nodeId);
            orderedNodes.push(node);

            // Add downstream nodes (where this node is portal)
            const entry = nodeMap.get(nodeId);
            if (entry) {
                for (const link of entry.asPortal) {
                    const bridgeNode = link.bridgeNode;
                    const bridgeId = String(bridgeNode._id || bridgeNode);
                    if (!orderedNodeIds.has(bridgeId)) {
                        toVisit.push(bridgeNode);
                    }
                }
            }
        }

        return { orderedNodes, orderedLinks: connectedLinks };
    }

    /**
     * Deploy a single node within a chain context.
     * Determines if node is Portal, Relay, or Bridge and applies appropriate config.
     * Handles both reverse and forward mode chains.
     */
    async _deployNodeInChain(node, nodeLinks, allChainLinks) {
        const nodeId = String(node._id);

        const asPortalLinks = allChainLinks.filter(l => String(l.portalNode._id || l.portalNode) === nodeId);
        const asBridgeLinks = allChainLinks.filter(l => String(l.bridgeNode._id || l.bridgeNode) === nodeId);

        const isPortal = asPortalLinks.length > 0;
        const isBridge = asBridgeLinks.length > 0;

        // Determine chain mode from any of the links
        const chainMode = (asPortalLinks[0]?.mode || asBridgeLinks[0]?.mode) || 'reverse';

        if (chainMode === 'forward') {
            if (node.type !== 'xray' && appConfig.FEATURE_CASCADE_HYBRID) {
                // Hybrid mode: one sidecar config handles both portal and hop roles.
                await this._deployPortalConfig(node);
                if (isBridge) {
                    for (const link of asBridgeLinks) {
                        await this._openFirewallPort(node, link.tunnelPort || 10086);
                    }
                }
                return;
            }

            if (isPortal) {
                await this._deployPortalConfig(node);
            }
            if (isBridge) {
                // Deploy all forward-hop inbounds at once to avoid overwriting
                await this._deployForwardHopConfig(node, asBridgeLinks);
                for (const link of asBridgeLinks) {
                    await this._openFirewallPort(node, link.tunnelPort || 10086);
                }
            }
        } else {
            // Reverse chain: original logic
            if (isPortal && !isBridge) {
                await this._deployPortalConfig(node);
                for (const link of asPortalLinks) {
                    await this._openFirewallPort(node, link.tunnelPort || 10086);
                }
            } else if (isBridge && isPortal) {
                const upstreamLink = asBridgeLinks[0];
                const upstreamPortal = await HyNode.findById(upstreamLink.portalNode);
                await this._deployRelayNode(node, upstreamLink, upstreamPortal, asPortalLinks);
                for (const link of asPortalLinks) {
                    await this._openFirewallPort(node, link.tunnelPort || 10086);
                }
            } else if (isBridge && !isPortal) {
                const upstreamLink = asBridgeLinks[0];
                const upstreamPortal = await HyNode.findById(upstreamLink.portalNode);
                await this._deployPureBridge(node, upstreamLink, upstreamPortal);
            }
        }
    }

    /**
     * Deploy Relay node config (middle of chain).
     */
    async _deployRelayNode(node, upstreamLink, upstreamPortal, downstreamLinks) {
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            throw new Error(`Relay node ${node.name} has no SSH credentials`);
        }

        const relayConfig = configGenerator.generateRelayConfig(upstreamLink, upstreamPortal, downstreamLinks);
        const serviceUnit = configGenerator.generateBridgeSystemdService();

        const ssh = new NodeSSH(node);
        try {
            await ssh.connect();

            await this._ensureXrayInstalled(ssh, node.name);

            await this._execChecked(ssh, 'mkdir -p /usr/local/etc/xray-bridge', `xray-bridge dir create on ${node.name}`);
            await ssh.uploadContent(relayConfig, '/usr/local/etc/xray-bridge/config.json');
            await this._assertRemoteFileExists(ssh, '/usr/local/etc/xray-bridge/config.json', `Relay config on ${node.name}`);
            await ssh.uploadContent(serviceUnit, '/etc/systemd/system/xray-bridge.service');
            await this._execChecked(
                ssh,
                'systemctl daemon-reload && systemctl enable xray-bridge && systemctl restart xray-bridge',
                `xray-bridge restart on ${node.name}`
            );
            await this._waitForServiceActive(ssh, ['xray-bridge'], {
                label: `xray-bridge on ${node.name}`,
                timeoutMs: 25000,
                journalLines: 20,
            });

            logger.info(`[Cascade] Relay config deployed to ${node.name}`);
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Deploy pure Bridge node config (tail of chain).
     */
    async _deployPureBridge(node, upstreamLink, upstreamPortal) {
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            throw new Error(`Bridge node ${node.name} has no SSH credentials`);
        }

        const bridgeConfig = configGenerator.generateBridgeConfig(upstreamLink, upstreamPortal);
        const serviceUnit = configGenerator.generateBridgeSystemdService();

        const ssh = new NodeSSH(node);
        try {
            await ssh.connect();

            await this._ensureXrayInstalled(ssh, node.name);

            await this._execChecked(ssh, 'mkdir -p /usr/local/etc/xray-bridge', `xray-bridge dir create on ${node.name}`);
            await ssh.uploadContent(bridgeConfig, '/usr/local/etc/xray-bridge/config.json');
            await this._assertRemoteFileExists(ssh, '/usr/local/etc/xray-bridge/config.json', `Bridge config on ${node.name}`);
            await ssh.uploadContent(serviceUnit, '/etc/systemd/system/xray-bridge.service');
            await this._execChecked(
                ssh,
                'systemctl daemon-reload && systemctl enable xray-bridge && systemctl restart xray-bridge',
                `xray-bridge restart on ${node.name}`
            );
            await this._waitForServiceActive(ssh, ['xray-bridge'], {
                label: `xray-bridge on ${node.name}`,
                timeoutMs: 25000,
                journalLines: 20,
            });

            logger.info(`[Cascade] Bridge config deployed to ${node.name}`);
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Deploy forward-chain hop config to a node (bridge/relay in forward mode).
     * If the node is an existing standalone Xray server, applies forward-hop inbound
     * to its config. Otherwise deploys a standalone forward-hop config.
     * @param {Object} node - HyNode document
     * @param {Array} hopLinks - Array of CascadeLink documents for this node
     */
    async _deployForwardHopConfig(node, hopLinks) {
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            throw new Error(`Forward hop node ${node.name} has no SSH credentials`);
        }

        if (appConfig.FEATURE_CASCADE_HYBRID && node.type !== 'xray') {
            await this._deployPortalConfig(node);
            return;
        }

        // Existing Xray server: cascade inbounds are added via _deployPortalConfig
        if (node.type === 'xray' && node.active && node.status !== 'error') {
            await this._deployPortalConfig(node);
            return;
        }

        // Standalone: generate combined config with all hop inbounds
        const hopConfig = configGenerator.generateForwardHopConfig(hopLinks);
        const serviceUnit = configGenerator.generateBridgeSystemdService();

        const ssh = new NodeSSH(node);
        try {
            await ssh.connect();

            await this._ensureXrayInstalled(ssh, node.name);

            await this._execChecked(ssh, 'mkdir -p /usr/local/etc/xray-bridge', `xray-bridge dir create on ${node.name}`);
            await ssh.uploadContent(hopConfig, '/usr/local/etc/xray-bridge/config.json');
            await this._assertRemoteFileExists(ssh, '/usr/local/etc/xray-bridge/config.json', `Forward-hop config on ${node.name}`);
            await ssh.uploadContent(serviceUnit, '/etc/systemd/system/xray-bridge.service');
            await this._execChecked(
                ssh,
                'systemctl daemon-reload && systemctl enable xray-bridge && systemctl restart xray-bridge',
                `xray-bridge restart on ${node.name}`
            );
            await this._waitForServiceActive(ssh, ['xray-bridge'], {
                label: `xray-bridge on ${node.name}`,
                timeoutMs: 25000,
                journalLines: 20,
            });

            logger.info(`[Cascade] Forward-hop config deployed to ${node.name}`);
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Health-check a single cascade link.
     * Reverse: verify ESTABLISHED connections on Portal's tunnel port.
     * Forward: verify TCP connectivity to Bridge's tunnel port.
     */
    async healthCheckLink(link) {
        const isForward = link.mode === 'forward';
        const checkNodeId = isForward ? link.bridgeNode : link.portalNode;
        const checkNode = await HyNode.findById(checkNodeId);
        if (!checkNode) return false;

        const tunnelPort = link.tunnelPort || 10086;

        try {
            const [healthy, latencyMs] = await Promise.all([
                isForward
                    ? this._measureTcpLatency(checkNode.ip, tunnelPort).then(ms => ms !== null)
                    : this._checkTunnel(checkNode, tunnelPort),
                this._measureTcpLatency(checkNode.ip, tunnelPort),
            ]);

            const prevStatus = link.status;
            const newStatus  = healthy ? 'online' : 'offline';

            await CascadeLink.updateOne({ _id: link._id }, {
                $set: {
                    status:          newStatus,
                    lastHealthCheck: new Date(),
                    lastError:       healthy ? '' : (isForward ? 'Bridge unreachable on tunnel port' : 'No ESTABLISHED tunnel connections'),
                    latencyMs:       latencyMs,
                },
            });

            if (prevStatus !== newStatus) {
                const event = healthy ? 'cascade.online' : 'cascade.offline';
                webhook.emit(event, { linkId: link._id, name: link.name });
                logger.info(`[Cascade] Link ${link.name}: ${prevStatus} -> ${newStatus}, latency=${latencyMs}ms`);
            }

            return healthy;
        } catch (error) {
            await CascadeLink.updateOne({ _id: link._id }, {
                $set: { status: 'error', lastError: error.message, lastHealthCheck: new Date() },
            });
            return false;
        }
    }

    /**
     * Health-check all active, deployed cascade links.
     * Called periodically by cron.
     */
    async healthCheckAll() {
        const links = await CascadeLink.find({
            active: true,
            status: { $in: ['deployed', 'online', 'offline'] },
        });

        if (links.length === 0) return;

        const CONCURRENCY = 5;
        for (let i = 0; i < links.length; i += CONCURRENCY) {
            const batch = links.slice(i, i + CONCURRENCY);
            await Promise.allSettled(batch.map(l => this.healthCheckLink(l)));
        }

        await this._invalidateTopologyCache();
    }

    /**
     * Build the full network topology graph for the visual map.
     * Returns nodes and edges formatted for cytoscape.js consumption.
     * Cached in Redis for performance.
     *
     * @returns {Promise<{nodes: Array, edges: Array}>}
     */
    async getTopology() {
        const cached = await cacheGet(TOPOLOGY_CACHE_KEY);
        if (cached) {
            try { return JSON.parse(cached); } catch (_) {}
        }

        const [allNodes, allLinks] = await Promise.all([
            HyNode.find({ active: true })
                .select('name ip domain flag type status onlineUsers cascadeRole mapPosition country port ssh')
                .lean(),
            CascadeLink.find({ active: true })
                .populate('portalNode', 'name ip type')
                .populate('bridgeNode', 'name ip type')
                .lean(),
        ]);

        const nodeById = new Map(allNodes.map(n => [String(n._id), n]));

        const nodes = allNodes.map(n => ({
            data: {
                id: String(n._id),
                label: n.name,
                ip: n.ip,
                domain: n.domain || '',
                flag: n.flag || '',
                type: n.type,
                status: n.status,
                onlineUsers: n.onlineUsers || 0,
                cascadeRole: n.cascadeRole || 'standalone',
                country: n.country || '',
                port: n.port,
                sshConfigured: !!(n.ssh?.password || n.ssh?.privateKey),
            },
            position: (n.mapPosition?.x != null && n.mapPosition?.y != null)
                ? { x: n.mapPosition.x, y: n.mapPosition.y }
                : undefined,
        }));

        const edges = allLinks.map(l => {
            const source = String(l.portalNode?._id || l.portalNode);
            const target = String(l.bridgeNode?._id || l.bridgeNode);
            const portalType = l.portalNode?.type || nodeById.get(source)?.type || '';
            const bridgeType = l.bridgeNode?.type || nodeById.get(target)?.type || '';
            return {
                data: {
                    id: `link-${l._id}`,
                    linkId: String(l._id),
                    source,
                    target,
                    label: l.name,
                    status: l.status,
                    tunnelPort: l.tunnelPort,
                    latencyMs: l.latencyMs,
                    tunnelProtocol: l.tunnelProtocol,
                    tunnelTransport: l.tunnelTransport,
                    mode: l.mode || 'reverse',
                    muxEnabled: l.muxEnabled || false,
                    tunnelSecurity: l.tunnelSecurity || 'none',
                    portalType,
                    bridgeType,
                    cascadeStack: this._resolveCascadeStack({ type: portalType }, { type: bridgeType }),
                },
            };
        });

        // Add virtual "Internet" node and edges from exit/standalone nodes
        const exitNodes = allNodes.filter(n =>
            n.cascadeRole === 'bridge' || n.cascadeRole === 'standalone' || !n.cascadeRole
        );

        if (exitNodes.length > 0) {
            nodes.push({
                data: {
                    id: 'internet',
                    label: 'Internet',
                    ip: '',
                    domain: '',
                    flag: '🌐',
                    type: 'internet',
                    status: 'online',
                    onlineUsers: 0,
                    cascadeRole: 'internet',
                    country: '',
                    port: null,
                },
                position: undefined,
            });

            for (const exitNode of exitNodes) {
                edges.push({
                    data: {
                        id: `internet-${exitNode._id}`,
                        linkId: null,
                        source: String(exitNode._id),
                        target: 'internet',
                        label: '',
                        status: exitNode.status === 'online' ? 'online' : 'offline',
                        tunnelPort: null,
                        latencyMs: null,
                        tunnelProtocol: null,
                        tunnelTransport: null,
                        cascadeStack: null,
                        isInternetEdge: true,
                    },
                });
            }
        }

        const topology = { nodes, edges };
        await cacheSet(TOPOLOGY_CACHE_KEY, JSON.stringify(topology), TOPOLOGY_CACHE_TTL);
        return topology;
    }

    /**
     * Save node positions from the visual map editor.
     * @param {Array<{id: string, x: number, y: number}>} positions
     */
    async savePositions(positions) {
        if (!Array.isArray(positions) || positions.length === 0) return;

        const bulkOps = positions
            .filter(p => p.id && typeof p.x === 'number' && typeof p.y === 'number')
            .map(p => ({
                updateOne: {
                    filter: { _id: p.id },
                    update: { $set: { 'mapPosition.x': p.x, 'mapPosition.y': p.y } },
                },
            }));

        if (bulkOps.length > 0) {
            await HyNode.bulkWrite(bulkOps, { ordered: false });
            await this._invalidateTopologyCache();
        }
    }

    /**
     * Resolve the full downstream forward-chain path starting from a node.
     *
     * Supports both styles currently present in the UI/data model:
     * 1. Pairwise graph links: A->B, B->C, C->D
     * 2. Head-defined ordered hops: A->B, A->C, A->D with priority ordering
     *
     * Returned links are ordered from the nearest downstream hop to the final
     * exit node and are ready to be passed to applyForwardChain().
     *
     * @param {string|ObjectId} startNodeId
     * @param {Set<string>} [excludeSet]
     * @returns {Promise<Array>}
     */
    async _getForwardChainLinks(startNodeId, excludeSet = new Set()) {
        const allForwardLinks = (await CascadeLink.find({
            mode: 'forward',
            active: true,
        }).populate('bridgeNode')).filter(l => !excludeSet.has(String(l._id)));

        if (allForwardLinks.length === 0) return [];

        const outgoingMap = new Map();
        for (const link of allForwardLinks) {
            const portalId = String(link.portalNode._id || link.portalNode);
            if (!outgoingMap.has(portalId)) outgoingMap.set(portalId, []);
            outgoingMap.get(portalId).push(link);
        }

        const ordered = [];
        const visitedLinks = new Set();
        const visitedNodes = new Set();
        let currentNodeId = String(startNodeId);

        while (true) {
            const outgoing = (outgoingMap.get(currentNodeId) || [])
                .filter(l => !visitedLinks.has(String(l._id)))
                .sort((a, b) => (a.priority || 100) - (b.priority || 100));

            if (outgoing.length === 0) break;

            for (const link of outgoing) {
                ordered.push(link);
                visitedLinks.add(String(link._id));
            }

            visitedNodes.add(currentNodeId);
            const tailLink = outgoing[outgoing.length - 1];
            const nextNodeId = String(tailLink.bridgeNode?._id || tailLink.bridgeNode);

            if (!nextNodeId || visitedNodes.has(nextNodeId)) {
                if (visitedNodes.has(nextNodeId)) {
                    logger.warn(`[Cascade] Forward chain cycle detected from node ${currentNodeId}, stopping path resolution`);
                }
                break;
            }

            currentNodeId = nextNodeId;
        }

        return ordered;
    }

    // ==================== INTERNAL HELPERS ====================

    _getCascadeSidecarRuntime(node) {
        const raw = node?.cascadeSidecar || {};
        const socksPort = Number(raw.socksPort) > 0 ? Number(raw.socksPort) : 11080;
        const rawServiceName = /^[A-Za-z0-9_.@-]+$/.test(raw.serviceName || '')
            ? String(raw.serviceName)
            : 'xray-cascade';
        const serviceName = rawServiceName.endsWith('.service')
            ? rawServiceName.slice(0, -8) || 'xray-cascade'
            : rawServiceName;
        const configPath = (typeof raw.configPath === 'string' && raw.configPath.trim().startsWith('/'))
            ? raw.configPath.trim()
            : '/usr/local/etc/xray-cascade/config.json';
        return {
            enabled: raw.enabled !== false,
            socksPort,
            serviceName,
            configPath,
        };
    }

    _generateCascadeSidecarServiceUnit(configPath) {
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

    _trimExecOutput(result, max = 700) {
        const stdout = String(result?.stdout || '').trim();
        const stderr = String(result?.stderr || '').trim();
        const merged = [stdout, stderr].filter(Boolean).join('\n');
        if (!merged) return '';
        return merged.length > max ? `${merged.slice(0, max)}...` : merged;
    }

    _enforceInlineAclForHybrid(nodeConfig, nodeName = 'unknown') {
        const acl = { ...(nodeConfig?.acl || {}) };
        const aclType = String(acl.type || 'inline').toLowerCase();
        if (aclType === 'file') {
            throw new Error(`Hybrid cascade requires ACL type "inline" on ${nodeName}. Current ACL type is "file"; switch node ACL to inline rules or disable hybrid sidecar.`);
        }
        nodeConfig.acl = { ...acl, enabled: true, type: 'inline' };
    }

    async _execChecked(ssh, command, stepLabel) {
        const result = await ssh.exec(command);
        if ((result?.code || 0) !== 0) {
            const details = this._trimExecOutput(result);
            throw new Error(`${stepLabel} failed (exit ${result?.code ?? 'n/a'})${details ? `: ${details}` : ''}`);
        }
        return result;
    }

    async _assertRemoteFileExists(ssh, remotePath, label) {
        const result = await ssh.exec(`[ -s ${shellQuote(remotePath)} ] && echo ok || echo missing`);
        if (String(result?.stdout || '').trim() !== 'ok') {
            throw new Error(`${label || remotePath} is missing on remote host (${remotePath})`);
        }
    }

    async _getServiceState(ssh, serviceNames) {
        const names = (Array.isArray(serviceNames) ? serviceNames : [serviceNames])
            .map(name => String(name || '').trim())
            .filter(Boolean);
        const states = [];

        for (const serviceName of names) {
            const result = await ssh.exec(`(systemctl is-active ${shellQuote(serviceName)} 2>/dev/null || true) | head -n 1`);
            const state = String(result?.stdout || '').trim().split('\n')[0].trim();
            if (state) states.push(state);
            if (state === 'active') return 'active';
        }

        return states.find(state => state && state !== 'unknown') || states[0] || 'unknown';
    }

    async _collectServiceDiagnostics(ssh, serviceNames, journalLines = 20) {
        const names = (Array.isArray(serviceNames) ? serviceNames : [serviceNames])
            .map(name => String(name || '').trim())
            .filter(Boolean);
        const parts = [];

        for (const serviceName of names) {
            const status = await ssh.exec(`systemctl status ${shellQuote(serviceName)} --no-pager -l 2>/dev/null || true`);
            const statusText = this._trimExecOutput(status, 900);
            if (statusText) parts.push(`[status ${serviceName}] ${statusText}`);
        }

        const journalUnits = names.map(name => `-u ${shellQuote(name)}`).join(' ');
        const journal = await ssh.exec(`journalctl ${journalUnits} -n ${journalLines} --no-pager 2>/dev/null || true`);
        const journalText = this._trimExecOutput(journal, 900);
        if (journalText) parts.push(`[journal] ${journalText}`);

        return parts.join(' | ');
    }

    async _waitForServiceActive(ssh, serviceNames, options = {}) {
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20000;
        const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 1500;
        const label = options.label || (Array.isArray(serviceNames) ? serviceNames.join(', ') : serviceNames);
        const deadline = Date.now() + timeoutMs;
        let lastState = 'unknown';

        while (Date.now() <= deadline) {
            lastState = await this._getServiceState(ssh, serviceNames);
            if (lastState === 'active') return { state: lastState };
            if (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }

        const diagnostics = await this._collectServiceDiagnostics(ssh, serviceNames, options.journalLines || 20);
        throw new Error(
            `${label} is not active (state: ${lastState || 'unknown'})${diagnostics ? `. Diagnostics: ${diagnostics}` : ''}`
        );
    }

    async _waitForListeningPort(ssh, port, options = {}) {
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
        const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 1000;
        const deadline = Date.now() + timeoutMs;
        const portNum = Number(port);

        while (Date.now() <= deadline) {
            const result = await ssh.exec(
                `ss -ltn 2>/dev/null | awk '{print $4}' | grep -F ':${portNum}' >/dev/null && echo listening || echo waiting`
            );
            if (String(result?.stdout || '').includes('listening')) {
                return true;
            }
            if (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }

        throw new Error(`Port ${portNum} is not listening after service start`);
    }

    async _ensureXrayInstalled(ssh, nodeName) {
        const check = await ssh.exec('command -v xray >/dev/null 2>&1');
        if ((check?.code || 0) === 0) return;

        logger.info(`[Cascade] Installing Xray on ${nodeName}`);
        await this._execChecked(ssh, `
set -e
if ! command -v curl >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -y && apt-get install -y curl ca-certificates unzip
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y curl ca-certificates unzip
    elif command -v yum >/dev/null 2>&1; then
        yum install -y curl ca-certificates unzip
    elif command -v apk >/dev/null 2>&1; then
        apk add --no-cache curl ca-certificates unzip
    else
        echo "curl package manager not found" >&2
        exit 1
    fi
fi
INSTALL_OK=0
INSTALLER_URLS="
https://raw.githubusercontent.com/XTLS/Xray-install/main/install-release.sh
https://github.com/XTLS/Xray-install/raw/main/install-release.sh
"
for ATTEMPT in 1 2 3; do
    for INSTALLER_URL in $INSTALLER_URLS; do
        rm -f /tmp/xray-install.sh
        if ! curl -fL --retry 8 --retry-all-errors --retry-delay 2 --connect-timeout 15 --max-time 300 \
            "$INSTALLER_URL" -o /tmp/xray-install.sh; then
            continue
        fi

        if [ ! -s /tmp/xray-install.sh ]; then
            rm -f /tmp/xray-install.sh
            continue
        fi

        SCRIPT_SIZE=$(wc -c < /tmp/xray-install.sh | tr -d ' ')
        if [ "\${SCRIPT_SIZE:-0}" -lt 10000 ] || ! grep -qi "xray" /tmp/xray-install.sh; then
            rm -f /tmp/xray-install.sh
            continue
        fi

        chmod +x /tmp/xray-install.sh
        INSTALL_EXIT=0
        bash /tmp/xray-install.sh install 2>&1 || INSTALL_EXIT=$?
        rm -f /tmp/xray-install.sh

        if [ $INSTALL_EXIT -eq 0 ] && command -v xray >/dev/null 2>&1; then
            INSTALL_OK=1
            break 2
        fi
    done

    if [ "$ATTEMPT" -lt 3 ]; then
        sleep $((ATTEMPT * 3))
    fi
done

if [ "$INSTALL_OK" -ne 1 ]; then
    ARCH=$(uname -m)
    XRAY_VERSION="v26.3.27"
    if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then
        XRAY_PKG="Xray-linux-64.zip"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        XRAY_PKG="Xray-linux-arm64-v8a.zip"
    else
        echo "Unsupported architecture for Xray fallback: $ARCH" >&2
        exit 1
    fi

    if ! command -v unzip >/dev/null 2>&1; then
        if command -v apt-get >/dev/null 2>&1; then
            apt-get update -y && apt-get install -y unzip
        elif command -v dnf >/dev/null 2>&1; then
            dnf install -y unzip
        elif command -v yum >/dev/null 2>&1; then
            yum install -y unzip
        elif command -v apk >/dev/null 2>&1; then
            apk add --no-cache unzip
        else
            echo "unzip package manager not found" >&2
            exit 1
        fi
    fi

    TMP_DIR=$(mktemp -d)
    ZIP_PATH="$TMP_DIR/xray.zip"
    DOWNLOADED=0
    for XRAY_URL in \
        "https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG" \
        "https://ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG" \
        "https://mirror.ghproxy.com/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG" \
        "https://ghproxy.net/https://github.com/XTLS/Xray-core/releases/download/$XRAY_VERSION/$XRAY_PKG"; do
        rm -f "$ZIP_PATH"
        if curl -fL --retry 10 --retry-all-errors --retry-delay 3 --connect-timeout 20 --max-time 900 \
            --speed-time 30 --speed-limit 32768 "$XRAY_URL" -o "$ZIP_PATH"; then
            ZIP_SIZE=$(wc -c < "$ZIP_PATH" | tr -d ' ')
            if [ "\${ZIP_SIZE:-0}" -lt 5000000 ]; then
                continue
            fi
            if ! unzip -tq "$ZIP_PATH" >/dev/null 2>&1; then
                continue
            fi
            DOWNLOADED=1
            break
        fi
    done
    if [ "$DOWNLOADED" -ne 1 ]; then
        rm -rf "$TMP_DIR"
        echo "Fallback Xray archive download failed from all mirrors" >&2
        exit 1
    fi

    unzip -o "$ZIP_PATH" -d "$TMP_DIR/xray" >/dev/null 2>&1
    if [ ! -f "$TMP_DIR/xray/xray" ]; then
        rm -rf "$TMP_DIR"
        echo "Fallback Xray archive does not contain xray binary" >&2
        exit 1
    fi

    install -m 0755 "$TMP_DIR/xray/xray" /usr/local/bin/xray
    mkdir -p /usr/local/share/xray
    [ -f "$TMP_DIR/xray/geoip.dat" ] && install -m 0644 "$TMP_DIR/xray/geoip.dat" /usr/local/share/xray/geoip.dat || true
    [ -f "$TMP_DIR/xray/geosite.dat" ] && install -m 0644 "$TMP_DIR/xray/geosite.dat" /usr/local/share/xray/geosite.dat || true
    rm -rf "$TMP_DIR"
fi

command -v xray >/dev/null 2>&1
`, `xray install on ${nodeName}`);
        await this._assertRemoteFileExists(ssh, '/usr/local/bin/xray', `Xray binary on ${nodeName}`);
    }

    async _deployHysteriaPortalConfig(portalNode, opts = {}) {
        if (!appConfig.FEATURE_CASCADE_HYBRID) {
            throw new Error(`${HYBRID_DISABLED_ERROR}. Portal node "${portalNode.name}" has type "${portalNode.type}".`);
        }

        const excludeSet = new Set((opts.excludeLinkIds || []).map(String));
        const sidecar = this._getCascadeSidecarRuntime(portalNode);

        const allPortalLinks = (await CascadeLink.find({
            portalNode: portalNode._id,
            active: true,
        }).populate('bridgeNode')).filter(l => !excludeSet.has(String(l._id)));
        const reverseLinks = allPortalLinks.filter(l => l.mode !== 'forward');
        const forwardLinks = await this._getForwardChainLinks(portalNode._id, excludeSet);
        const forwardHopLinks = (await CascadeLink.find({
            bridgeNode: portalNode._id,
            mode: 'forward',
            active: true,
        })).filter(l => !excludeSet.has(String(l._id)));

        const needsSidecar = reverseLinks.length > 0 || forwardLinks.length > 0 || forwardHopLinks.length > 0;

        const settings = await Settings.get();
        const authInsecure = settings?.nodeAuth?.insecure ?? true;
        const authUrl = `${appConfig.BASE_URL}/api/auth`;
        const useTlsFiles = !!(portalNode.useTlsFiles || !portalNode.domain);

        const nodeForConfig = portalNode.toObject ? portalNode.toObject() : { ...portalNode };
        const outbounds = Array.isArray(nodeForConfig.outbounds) ? nodeForConfig.outbounds : [];
        const aclRules = Array.isArray(nodeForConfig.aclRules) ? nodeForConfig.aclRules : [];
        const hasCustomConfig = !!(portalNode.useCustomConfig && String(portalNode.customConfig || '').trim());
        if (hasCustomConfig) {
            throw new Error(`Hybrid cascade is not supported while custom config is enabled on node "${portalNode.name}". Disable custom config first.`);
        }

        if (needsSidecar) {
            if (!sidecar.enabled) {
                throw new Error(`Cascade sidecar is disabled on node "${portalNode.name}". Enable node.cascadeSidecar.enabled to use hybrid cascade.`);
            }
            const sidecarOutbound = {
                name: CASCADE_SIDECAR_OUTBOUND,
                type: 'socks5',
                addr: `127.0.0.1:${sidecar.socksPort}`,
                username: '',
                password: '',
                insecure: false,
            };
            nodeForConfig.outbounds = [
                sidecarOutbound,
                ...outbounds.filter(ob => ob && ob.name !== CASCADE_SIDECAR_OUTBOUND),
            ];
            this._enforceInlineAclForHybrid(nodeForConfig, portalNode.name);
            nodeForConfig.aclRules = [
                `${CASCADE_SIDECAR_OUTBOUND}(all)`,
                ...aclRules.filter(r => !String(r || '').startsWith(`${CASCADE_SIDECAR_OUTBOUND}(`)),
            ];
        } else {
            nodeForConfig.outbounds = outbounds.filter(ob => ob && ob.name !== CASCADE_SIDECAR_OUTBOUND);
            nodeForConfig.aclRules = aclRules.filter(r => !String(r || '').startsWith(`${CASCADE_SIDECAR_OUTBOUND}(`));
        }

        const hysteriaConfig = configGenerator.generateNodeConfig(nodeForConfig, authUrl, {
            authInsecure,
            useTlsFiles,
        });
        if (needsSidecar && !hysteriaConfig.includes(CASCADE_SIDECAR_OUTBOUND)) {
            throw new Error(`Hybrid overlay marker ${CASCADE_SIDECAR_OUTBOUND} is missing from generated Hysteria config for ${portalNode.name}`);
        }

        let sidecarConfig = '';
        if (needsSidecar) {
            const configObj = JSON.parse(configGenerator.generateXrayCascadeSidecarConfig(sidecar.socksPort));
            const inboundTag = 'hy-cascade-in';
            if (reverseLinks.length > 0) {
                configGenerator.applyReversePortal(configObj, reverseLinks, inboundTag);
            }
            if (forwardLinks.length > 0) {
                configGenerator.applyForwardChain(configObj, forwardLinks, inboundTag);
            }
            if (forwardHopLinks.length > 0) {
                configGenerator.applyForwardHopInbound(configObj, forwardHopLinks);
            }
            configGenerator.ensurePrivateIpBlock(configObj);
            sidecarConfig = JSON.stringify(configObj, null, 2);
        }

        if (!portalNode.ssh?.password && !portalNode.ssh?.privateKey) {
            throw new Error(`Portal node ${portalNode.name} has no SSH credentials`);
        }

        const ssh = new NodeSSH(portalNode);
        try {
            await ssh.connect();

            const hyConfigPath = portalNode.paths?.config || '/etc/hysteria/config.yaml';
            await ssh.uploadContent(hysteriaConfig, hyConfigPath);
            logger.info(`[Cascade] Hysteria portal config uploaded to ${portalNode.name} at ${hyConfigPath}`);
            if (needsSidecar) {
                const markerCheck = await ssh.exec(`grep -F ${shellQuote(CASCADE_SIDECAR_OUTBOUND)} ${shellQuote(hyConfigPath)} >/dev/null && echo ok || echo missing`);
                if (String(markerCheck?.stdout || '').trim() !== 'ok') {
                    throw new Error(`Hybrid overlay marker ${CASCADE_SIDECAR_OUTBOUND} is missing from ${hyConfigPath} on ${portalNode.name} after upload`);
                }
            }

            if (needsSidecar) {
                const serviceUnitName = `${sidecar.serviceName}.service`;
                await this._ensureXrayInstalled(ssh, portalNode.name);
                await this._execChecked(ssh, `mkdir -p ${shellQuote(path.dirname(sidecar.configPath))}`, `sidecar dir create on ${portalNode.name}`);
                await ssh.uploadContent(sidecarConfig, sidecar.configPath);
                await this._assertRemoteFileExists(ssh, sidecar.configPath, `Hybrid sidecar config on ${portalNode.name}`);
                await ssh.uploadContent(
                    this._generateCascadeSidecarServiceUnit(sidecar.configPath),
                    `/etc/systemd/system/${serviceUnitName}`
                );
                await this._execChecked(
                    ssh,
                    `systemctl daemon-reload && systemctl enable ${shellQuote(serviceUnitName)} && systemctl restart ${shellQuote(serviceUnitName)}`,
                    `sidecar service restart on ${portalNode.name}`
                );
                await this._waitForServiceActive(ssh, [serviceUnitName], {
                    label: `Sidecar service ${serviceUnitName} on ${portalNode.name}`,
                    timeoutMs: 25000,
                    journalLines: 20,
                });
                await this._waitForListeningPort(ssh, sidecar.socksPort, { timeoutMs: 15000 });
            } else {
                const serviceUnitName = `${sidecar.serviceName}.service`;
                await ssh.exec(`systemctl stop ${shellQuote(serviceUnitName)} 2>/dev/null || true; systemctl disable ${shellQuote(serviceUnitName)} 2>/dev/null || true`);
            }

            await ssh.exec('systemctl restart hysteria-server 2>/dev/null || systemctl restart hysteria 2>/dev/null');
            await this._waitForServiceActive(ssh, ['hysteria-server', 'hysteria'], {
                label: `Hysteria service on ${portalNode.name}`,
                timeoutMs: 25000,
                journalLines: 20,
            });
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Regenerate and upload a node's full Xray config, including
     * reverse-portal and/or forward-chain settings from its active cascade links.
     * For Hysteria nodes in hybrid mode this deploys a local Xray sidecar.
     * @param {Object} portalNode - HyNode document
     * @param {Object} [opts]
     * @param {Array<string>} [opts.excludeLinkIds] - Link IDs to exclude (used during undeploy)
     */
    async _deployPortalConfig(portalNode, opts = {}) {
        if (portalNode.type !== 'xray') {
            return this._deployHysteriaPortalConfig(portalNode, opts);
        }

        const syncService = require('./syncService');
        const users = await syncService._getUsersForNode(portalNode);

        const configStr = configGenerator.generateXrayConfig(portalNode, users);
        const config = JSON.parse(configStr);

        const excludeSet = new Set((opts.excludeLinkIds || []).map(String));

        const allPortalLinks = (await CascadeLink.find({
            portalNode: portalNode._id,
            active: true,
        }).populate('bridgeNode')).filter(l => !excludeSet.has(String(l._id)));

        const reverseLinks = allPortalLinks.filter(l => l.mode !== 'forward');
        const forwardLinks = await this._getForwardChainLinks(portalNode._id, excludeSet);

        const inboundTag = portalNode.xray?.inboundTag || 'vless-in';

        if (reverseLinks.length > 0) {
            configGenerator.applyReversePortal(config, reverseLinks, inboundTag);
        }
        if (forwardLinks.length > 0) {
            configGenerator.applyForwardChain(config, forwardLinks, inboundTag);
        }

        const forwardHopLinks = (await CascadeLink.find({
            bridgeNode: portalNode._id,
            mode: 'forward',
            active: true,
        })).filter(l => !excludeSet.has(String(l._id)));
        if (forwardHopLinks.length > 0) {
            configGenerator.applyForwardHopInbound(config, forwardHopLinks);
        }

        // geoip:private block must be the very last routing rule
        configGenerator.ensurePrivateIpBlock(config);

        const finalConfig = JSON.stringify(config, null, 2);

        if (portalNode.ssh?.password || portalNode.ssh?.privateKey) {
            const ssh = new NodeSSH(portalNode);
            try {
                await ssh.connect();
                await ssh.uploadContent(finalConfig, '/usr/local/etc/xray/config.json');
                logger.info(`[Cascade] Portal config uploaded to ${portalNode.name} at /usr/local/etc/xray/config.json`);
            } finally {
                ssh.disconnect();
            }
        }

        const hasAgent = !!(portalNode.xray?.agentToken);
        if (hasAgent) {
            try {
                await syncService._agentRequest(portalNode, 'POST', '/restart');
                logger.info(`[Cascade] Portal ${portalNode.name} restarted via agent`);
            } catch (err) {
                logger.warn(`[Cascade] Portal agent restart: ${err.message}`);
                if (portalNode.ssh?.password || portalNode.ssh?.privateKey) {
                    const ssh = new NodeSSH(portalNode);
                    try {
                        await ssh.connect();
                        await ssh.exec('systemctl restart xray');
                    } finally { ssh.disconnect(); }
                }
            }
        } else if (portalNode.ssh?.password || portalNode.ssh?.privateKey) {
            const ssh = new NodeSSH(portalNode);
            try {
                await ssh.connect();
                await ssh.exec('systemctl restart xray');
            } finally { ssh.disconnect(); }
        }
    }

    /**
     * Generate and upload the Bridge/Relay config, create systemd service, and start it.
     * Detects if bridgeNode is also a portal (relay) and generates appropriate config.
     */
    async _deployBridgeConfig(link, bridgeNode, portalNode) {
        if (!bridgeNode.ssh?.password && !bridgeNode.ssh?.privateKey) {
            throw new Error(`Bridge node ${bridgeNode.name} has no SSH credentials`);
        }

        // Check if this bridgeNode is also a portal for other links (i.e., it's a relay)
        const downstreamLinks = await CascadeLink.find({
            portalNode: bridgeNode._id,
            active: true,
        });
        const isRelay = downstreamLinks.length > 0;

        let bridgeConfig;
        if (isRelay) {
            logger.info(`[Cascade] Node ${bridgeNode.name} is a RELAY (${downstreamLinks.length} downstream link(s))`);
            bridgeConfig = configGenerator.generateRelayConfig(link, portalNode, downstreamLinks);
        } else {
            bridgeConfig = configGenerator.generateBridgeConfig(link, portalNode);
        }

        const serviceUnit = configGenerator.generateBridgeSystemdService();

        const ssh = new NodeSSH(bridgeNode);
        try {
            await ssh.connect();

            await this._ensureXrayInstalled(ssh, bridgeNode.name);

            await this._execChecked(ssh, 'mkdir -p /usr/local/etc/xray-bridge', `xray-bridge dir create on ${bridgeNode.name}`);
            await ssh.uploadContent(bridgeConfig, '/usr/local/etc/xray-bridge/config.json');
            await this._assertRemoteFileExists(ssh, '/usr/local/etc/xray-bridge/config.json', `Bridge config on ${bridgeNode.name}`);
            await ssh.uploadContent(serviceUnit, '/etc/systemd/system/xray-bridge.service');
            await this._execChecked(
                ssh,
                'systemctl daemon-reload && systemctl enable xray-bridge && systemctl restart xray-bridge',
                `xray-bridge restart on ${bridgeNode.name}`
            );
            await this._waitForServiceActive(ssh, ['xray-bridge'], {
                label: `xray-bridge on ${bridgeNode.name}`,
                timeoutMs: 25000,
                journalLines: 20,
            });

            logger.info(`[Cascade] ${isRelay ? 'Relay' : 'Bridge'} config deployed to ${bridgeNode.name}`);
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Open the tunnel port in the firewall on the Portal node.
     */
    async _openFirewallPort(node, port) {
        if (!node.ssh?.password && !node.ssh?.privateKey) return;

        const ssh = new NodeSSH(node);
        try {
            await ssh.connect();
            await ssh.exec(`
                if command -v ufw &>/dev/null; then
                    ufw allow ${port}/tcp 2>/dev/null
                elif command -v firewall-cmd &>/dev/null; then
                    firewall-cmd --permanent --add-port=${port}/tcp 2>/dev/null
                    firewall-cmd --reload 2>/dev/null
                fi
            `);
        } catch (err) {
            logger.warn(`[Cascade] Firewall open port ${port}: ${err.message}`);
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Check if there are ESTABLISHED connections on a given port (tunnel alive).
     */
    async _checkTunnel(node, port) {
        if (!node.ssh?.password && !node.ssh?.privateKey) return false;

        const ssh = new NodeSSH(node);
        try {
            await ssh.connect();
            // ss -tnH: -t=tcp, -n=numeric, -H=no header; count lines = count of ESTABLISHED connections
            const result = await ssh.exec(`ss -tnH state established '( sport = :${port} )' | wc -l`);
            const count = parseInt((result.stdout || '0').trim(), 10);
            return count > 0;
        } catch {
            return false;
        } finally {
            ssh.disconnect();
        }
    }

    /**
     * Recalculate cascadeRole for all nodes based on their active links.
     */
    async _updateNodeRoles() {
        const links = await CascadeLink.find({ active: true }).lean();

        const portalSet = new Set(links.map(l => String(l.portalNode)));
        const bridgeSet = new Set(links.map(l => String(l.bridgeNode)));

        const allNodes = await HyNode.find({ active: true }).select('_id cascadeRole').lean();

        const bulkOps = [];
        for (const node of allNodes) {
            const id = String(node._id);
            const isPortal = portalSet.has(id);
            const isBridge = bridgeSet.has(id);

            let role = 'standalone';
            if (isPortal && isBridge) role = 'relay';
            else if (isPortal) role = 'portal';
            else if (isBridge) role = 'bridge';

            if (node.cascadeRole !== role) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: node._id },
                        update: { $set: { cascadeRole: role } },
                    },
                });
            }
        }

        if (bulkOps.length > 0) {
            await HyNode.bulkWrite(bulkOps, { ordered: false });
        }
    }

    async _invalidateTopologyCache() {
        await cacheDel(TOPOLOGY_CACHE_KEY);
    }

    /**
     * Measure TCP handshake latency to host:port.
     * Returns latency in ms, or null on timeout/error.
     * @param {string} host
     * @param {number} port
     * @param {number} [timeoutMs=3000]
     * @returns {Promise<number|null>}
     */
    async _measureTcpLatency(host, port, timeoutMs = 3000) {
        return new Promise((resolve) => {
            const start  = Date.now();
            const socket = new net.Socket();
            socket.setTimeout(timeoutMs);

            socket.connect(port, host, function () {
                const latency = Date.now() - start;
                socket.destroy();
                resolve(latency);
            });

            socket.on('error', function () {
                socket.destroy();
                resolve(null);
            });

            socket.on('timeout', function () {
                socket.destroy();
                resolve(null);
            });
        });
    }
}

module.exports = new CascadeService();
