const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const config = require('../../config');

const { requireScope } = require('../middleware/auth');
const cascadeService = require('../services/cascadeService');
const cacheService = require('../services/cacheService');
const CascadeLink = require('../models/cascadeLinkModel');
const HyNode = require('../models/hyNodeModel');
const logger = require('../utils/logger');
const { normalizeTopologyToBuilderState, mergeDraftIntoBuilderState } = require('../domain/cascade-builder/flowNormalizer');
const { validateBuilderState, buildDraftHopSuggestion, resolveStack } = require('../domain/cascade-builder/flowValidator');
const { buildCommitPlan } = require('../domain/cascade-builder/commitPlanner');

const HYBRID_DISABLED_ERROR = 'Hybrid cascade is disabled. Enable FEATURE_CASCADE_HYBRID=true or turn it on in Settings > System';

function generateUuid() {
    return crypto.randomUUID();
}

function getHybridCompatibilityError(portalNode, bridgeNode) {
    const stack = resolveStack(portalNode?.type, bridgeNode?.type);
    if (stack !== 'hybrid') return '';
    if (config.FEATURE_CASCADE_HYBRID) return '';
    const src = portalNode?.type || 'unknown';
    const dst = bridgeNode?.type || 'unknown';
    return `${HYBRID_DISABLED_ERROR}. Unsupported link type: ${src} -> ${dst}`;
}

async function invalidateCascadeCache() {
    await cacheService.invalidateAllSubscriptions();
}

function getBuilderActorKey(req) {
    if (req.session?.authenticated) {
        return `admin:${String(req.session.adminUsername || 'admin').trim().toLowerCase()}`;
    }
    if (req.apiKey?.keyPrefix) {
        return `api:${String(req.apiKey.keyPrefix).trim().toLowerCase()}`;
    }
    return 'anonymous:panel';
}

function sanitizeNodePositions(positions) {
    const result = {};
    for (const entry of Array.isArray(positions) ? positions : []) {
        const id = String(entry?.id || '');
        const x = Number(entry?.x);
        const y = Number(entry?.y);
        if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        result[id] = { x, y };
    }
    return result;
}

async function getStoredDraft(req, flowId = 'legacy-topology') {
    return cacheService.getCascadeBuilderDraft(getBuilderActorKey(req), flowId);
}

async function saveStoredDraft(req, flowId = 'legacy-topology', draftState = {}) {
    return cacheService.setCascadeBuilderDraft(getBuilderActorKey(req), flowId, draftState);
}

async function createLegacyLinkFromDraft(draftHop) {
    const portalNodeId = draftHop.sourceNodeId;
    const bridgeNodeId = draftHop.targetNodeId;
    const linkMode = draftHop.mode || 'reverse';
    const port = parseInt(draftHop.tunnelPort, 10) || 10086;

    const [portalNode, bridgeNode] = await Promise.all([
        HyNode.findById(portalNodeId),
        HyNode.findById(bridgeNodeId),
    ]);

    if (!portalNode) {
        throw new Error(`Portal node not found for draft ${draftHop.name}`);
    }
    if (!bridgeNode) {
        throw new Error(`Bridge node not found for draft ${draftHop.name}`);
    }

    const hybridError = getHybridCompatibilityError(portalNode, bridgeNode);
    if (hybridError) {
        throw new Error(hybridError);
    }

    const portCheckField = linkMode === 'forward' ? 'bridgeNode' : 'portalNode';
    const portCheckId = linkMode === 'forward' ? bridgeNodeId : portalNodeId;
    const existingLink = await CascadeLink.findOne({
        [portCheckField]: portCheckId,
        tunnelPort: port,
        active: true,
    });
    if (existingLink) {
        const sideLabel = linkMode === 'forward' ? 'bridge/relay' : 'portal';
        throw new Error(`Port ${port} is already used by link "${existingLink.name}" on the ${sideLabel} node`);
    }

    const link = await CascadeLink.create({
        name: draftHop.name || `${portalNode.name} -> ${bridgeNode.name}`,
        mode: linkMode,
        portalNode: portalNodeId,
        bridgeNode: bridgeNodeId,
        tunnelUuid: generateUuid(),
        tunnelPort: port,
        tunnelDomain: 'reverse.tunnel.internal',
        tunnelProtocol: draftHop.tunnelProtocol || 'vless',
        tunnelSecurity: draftHop.tunnelSecurity || 'none',
        tunnelTransport: draftHop.tunnelTransport || 'tcp',
        tcpFastOpen: true,
        tcpKeepAlive: 100,
        tcpNoDelay: true,
        wsPath: '/cascade',
        wsHost: '',
        grpcServiceName: 'cascade',
        xhttpPath: '/cascade',
        xhttpHost: '',
        xhttpMode: 'auto',
        muxEnabled: !!draftHop.muxEnabled,
        muxConcurrency: 8,
        priority: 100,
        active: true,
        status: 'pending',
    });

    return link;
}

async function buildState(req) {
    const topology = await cascadeService.getTopology();
    const baseState = normalizeTopologyToBuilderState(topology);
    const draftState = await getStoredDraft(req, baseState.flowId);
    const state = mergeDraftIntoBuilderState(baseState, draftState);
    state.sourceOfTruth = {
        topology: 'cascadeService.getTopology()',
        draft: 'cacheService.getCascadeBuilderDraft()',
        mode: 'legacy-backed',
    };
    state.validation = validateBuilderState(state);
    return state;
}

async function buildCommitPreview(req) {
    const state = await buildState(req);
    const activeLinks = await CascadeLink.find({ active: true })
        .select('name mode portalNode bridgeNode tunnelPort status')
        .lean();

    const plan = buildCommitPlan({
        nodes: state.nodes,
        hops: state.hops,
        activeLinks,
    });

    return {
        flowId: state.flowId,
        draft: state.draft,
        validation: state.validation,
        plan,
    };
}

router.get('/state', requireScope('nodes:read'), async (req, res) => {
    try {
        const state = await buildState(req);
        res.json(state);
    } catch (error) {
        logger.error(`[Cascade Builder API] State error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.post('/validate', requireScope('nodes:read'), async (req, res) => {
    try {
        const baseState = await buildState(req);
        const payloadNodes = Array.isArray(req.body?.nodes) ? req.body.nodes : baseState.nodes;
        const payloadHops = Array.isArray(req.body?.hops) ? req.body.hops : baseState.hops;
        const state = {
            ...baseState,
            nodes: payloadNodes,
            hops: payloadHops,
        };
        const validation = validateBuilderState(state);
        res.json({
            validation,
            summary: validation.summary,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Validate error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

async function handleCommitPreview(req, res) {
    try {
        const preview = await buildCommitPreview(req);
        res.json(preview);
    } catch (error) {
        logger.error(`[Cascade Builder API] Plan commit error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
}

router.get('/plan-commit', requireScope('nodes:read'), handleCommitPreview);
router.get('/deploy-preview', requireScope('nodes:read'), handleCommitPreview);

router.post('/connect', requireScope('nodes:write'), async (req, res) => {
    try {
        const { sourceNodeId, targetNodeId, mode = 'reverse' } = req.body || {};
        const state = await buildState(req);
        const sourceNode = state.nodes.find((node) => String(node.id) === String(sourceNodeId));
        const targetNode = state.nodes.find((node) => String(node.id) === String(targetNodeId));

        if (!sourceNode || !targetNode) {
            return res.status(404).json({ error: 'Source or target node not found in builder state.' });
        }

        const draftSuggestion = buildDraftHopSuggestion({ sourceNode, targetNode, mode });
        const draftHop = {
            id: `draft:${sourceNode.id}:${targetNode.id}:${Date.now()}`,
            edgeId: `draft:${sourceNode.id}:${targetNode.id}:${Date.now()}`,
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            name: `${sourceNode.name} -> ${targetNode.name}`,
            mode: draftSuggestion.mode,
            stack: draftSuggestion.stack,
            tunnelProtocol: draftSuggestion.tunnelProtocol,
            tunnelTransport: draftSuggestion.tunnelTransport,
            tunnelSecurity: draftSuggestion.tunnelSecurity,
            tunnelPort: draftSuggestion.tunnelPort,
            muxEnabled: false,
            latencyMs: null,
            status: 'draft',
            isDraft: true,
        };

        const validation = validateBuilderState({
            ...state,
            hops: state.hops.concat(draftHop),
        });

        if (validation.errors.length === 0) {
            const storedDraft = await getStoredDraft(req, state.flowId);
            const draftHops = Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [];
            const nodePositions = storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
                ? storedDraft.nodePositions
                : {};

            await saveStoredDraft(req, state.flowId, {
                draftHops: draftHops.concat(draftHop),
                nodePositions,
            });
        }

        res.json({
            suggestion: draftSuggestion,
            draftHop,
            validation,
            accepted: validation.errors.length === 0,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Connect error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.post('/layout', requireScope('nodes:write'), async (req, res) => {
    try {
        const state = await buildState(req);
        const storedDraft = await getStoredDraft(req, state.flowId);
        const draftHops = Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [];
        const nodePositions = sanitizeNodePositions(req.body?.positions);

        await saveStoredDraft(req, state.flowId, {
            draftHops,
            nodePositions,
        });

        res.json({
            success: true,
            flowId: state.flowId,
            savedPositions: Object.keys(nodePositions).length,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Layout error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/drafts', requireScope('nodes:write'), async (req, res) => {
    try {
        const state = await buildState(req);
        const storedDraft = await getStoredDraft(req, state.flowId);

        await saveStoredDraft(req, state.flowId, {
            draftHops: [],
            nodePositions: storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
                ? storedDraft.nodePositions
                : {},
        });

        const nextState = await buildState(req);
        res.json({
            success: true,
            validation: nextState.validation,
            summary: nextState.validation.summary,
            draft: nextState.draft,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Reset drafts error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.post('/commit-drafts', requireScope('nodes:write'), async (req, res) => {
    try {
        const state = await buildState(req);
        const storedDraft = await getStoredDraft(req, state.flowId);
        const draftHops = Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [];

        if (!draftHops.length) {
            return res.status(400).json({ error: 'No draft hops to commit.' });
        }

        const results = [];
        const committedIds = [];

        for (const draftHop of draftHops) {
            try {
                const link = await createLegacyLinkFromDraft(draftHop);
                committedIds.push(String(draftHop.id));
                results.push({
                    hopId: String(draftHop.id),
                    success: true,
                    linkId: String(link._id),
                    name: link.name,
                });
            } catch (error) {
                results.push({
                    hopId: String(draftHop.id),
                    success: false,
                    error: error.message,
                    name: draftHop.name,
                });
            }
        }

        const remainingDrafts = draftHops.filter((hop) => !committedIds.includes(String(hop.id)));
        await saveStoredDraft(req, state.flowId, {
            draftHops: remainingDrafts,
            nodePositions: storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
                ? storedDraft.nodePositions
                : {},
        });

        if (committedIds.length > 0) {
            await invalidateCascadeCache();
        }

        const nextState = await buildState(req);
        res.json({
            success: committedIds.length > 0,
            committed: committedIds.length,
            failed: results.filter((item) => !item.success).length,
            results,
            validation: nextState.validation,
            summary: nextState.summary,
            draft: nextState.draft,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Commit drafts error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
