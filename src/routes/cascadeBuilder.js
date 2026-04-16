const express = require('express');
const router = express.Router();

const { requireScope } = require('../middleware/auth');
const cascadeService = require('../services/cascadeService');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');
const { normalizeTopologyToBuilderState, mergeDraftIntoBuilderState } = require('../domain/cascade-builder/flowNormalizer');
const { validateBuilderState, buildDraftHopSuggestion } = require('../domain/cascade-builder/flowValidator');

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

module.exports = router;
