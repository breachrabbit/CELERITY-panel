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

function tFor(res, key, fallback, params = {}) {
    return typeof res?.locals?.t === 'function' ? res.locals.t(key, params) : fallback;
}

function localizeBuilderApiError(res, error) {
    const message = String(error?.message || error || '');

    if (message.startsWith('Hybrid cascade is disabled.')) {
        const linkTypeMatch = message.match(/Unsupported link type:\s+(.+?)\s+->\s+(.+)$/);
        if (linkTypeMatch) {
            return `${tFor(res, 'cascades.hybridDisabledError', 'Hybrid cascade is disabled. Enable FEATURE_CASCADE_HYBRID=true or turn it on in Settings > System.')} ${tFor(res, 'cascades.unsupportedLinkType', 'Unsupported link type: {src} -> {dst}', { src: linkTypeMatch[1], dst: linkTypeMatch[2] })}`;
        }
        return tFor(res, 'cascades.hybridDisabledError', 'Hybrid cascade is disabled. Enable FEATURE_CASCADE_HYBRID=true or turn it on in Settings > System.');
    }

    if (message.startsWith('Portal node not found for draft ')) {
        const name = message.replace('Portal node not found for draft ', '');
        return tFor(res, 'cascades.draftPortalMissing', 'Portal node was not found for draft {name}', { name });
    }

    if (message.startsWith('Bridge node not found for draft ')) {
        const name = message.replace('Bridge node not found for draft ', '');
        return tFor(res, 'cascades.draftBridgeMissing', 'Bridge node was not found for draft {name}', { name });
    }

    const portMatch = message.match(/^Port\s+(\d+)\s+is already used by link "(.+)" on the (.+) node$/);
    if (portMatch) {
        const sideLabel = portMatch[3] === 'portal'
            ? tFor(res, 'cascades.portSidePortal', 'portal')
            : tFor(res, 'cascades.portSideBridge', 'bridge/relay');
        return tFor(res, 'cascades.portAlreadyUsed', 'Port {port} is already used by link "{linkName}" on the {sideLabel} side', {
            port: portMatch[1],
            linkName: portMatch[2],
            sideLabel,
        });
    }

    if (message === 'Source or target node not found in builder state.') {
        return tFor(res, 'cascades.sourceOrTargetMissing', 'Source or target node was not found in the current builder state.');
    }

    if (message === 'No draft hops to commit.') {
        return tFor(res, 'cascades.noDraftsToCommit', 'There are no draft hops to commit right now');
    }

    return message;
}

function localizeValidationMessage(res, issue, nodeById, hopById) {
    const hop = hopById.get(String(issue?.hopId || ''));
    const sourceNode = hop ? nodeById.get(String(hop.sourceNodeId)) : null;
    const targetNode = hop ? nodeById.get(String(hop.targetNodeId)) : null;
    const node = nodeById.get(String(issue?.nodeId || ''));

    switch (issue?.code) {
    case 'missing-node':
        return tFor(res, 'cascades.validationMissingNode', 'Hop {hop} references a node that no longer exists.', {
            hop: hop?.name || issue?.hopId || issue?.message || '—',
        });
    case 'self-link':
        return tFor(res, 'cascades.validationSelfLink', 'Node {node} cannot connect to itself.', {
            node: sourceNode?.name || targetNode?.name || issue?.message || '—',
        });
    case 'duplicate-hop':
        return tFor(res, 'cascades.validationDuplicateHop', 'Duplicate hop detected between {source} and {target}.', {
            source: sourceNode?.name || '—',
            target: targetNode?.name || '—',
        });
    case 'hybrid-disabled':
        return tFor(res, 'cascades.validationHybridDisabledHop', 'Hybrid cascade is disabled, but hop {source} -> {target} requires it.', {
            source: sourceNode?.name || '—',
            target: targetNode?.name || '—',
        });
    case 'invalid-security-transport':
        return tFor(res, 'cascades.validationInvalidSecurityTransport', 'REALITY is not compatible with WebSocket for hop {source} -> {target}.', {
            source: sourceNode?.name || '—',
            target: targetNode?.name || '—',
        });
    case 'missing-ssh':
        return tFor(res, 'cascades.validationMissingSsh', 'SSH is not configured on one of the nodes in {source} -> {target}.', {
            source: sourceNode?.name || '—',
            target: targetNode?.name || '—',
        });
    case 'offline-hop-node':
        return tFor(res, 'cascades.validationOfflineHopNode', 'One of the nodes in {source} -> {target} is not online right now.', {
            source: sourceNode?.name || '—',
            target: targetNode?.name || '—',
        });
    case 'cycle': {
        const rawPath = String(issue?.message || '').replace(/^Cycle detected in flow:\s*/, '');
        return tFor(res, 'cascades.validationCycle', 'Cycle detected in flow: {path}', {
            path: rawPath,
        });
    }
    case 'multiple-upstreams':
        return tFor(res, 'cascades.validationMultipleUpstreams', '{node} has multiple upstream hops. This already requires an explicit routing policy.', {
            node: node?.name || '—',
        });
    case 'multiple-downstreams':
        return tFor(res, 'cascades.validationMultipleDownstreams', '{node} has multiple downstream hops. Treat this as an advanced routing scenario.', {
            node: node?.name || '—',
        });
    default:
        return issue?.message || '';
    }
}

function localizeValidation(res, flowState, validation) {
    if (!validation || typeof validation !== 'object') return validation;

    const nodes = Array.isArray(flowState?.nodes) ? flowState.nodes : [];
    const hops = Array.isArray(flowState?.hops) ? flowState.hops : [];
    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    const hopById = new Map(hops.map((hop) => [String(hop.id), hop]));

    return {
        ...validation,
        errors: Array.isArray(validation.errors)
            ? validation.errors.map((issue) => ({ ...issue, message: localizeValidationMessage(res, issue, nodeById, hopById) }))
            : [],
        warnings: Array.isArray(validation.warnings)
            ? validation.warnings.map((issue) => ({ ...issue, message: localizeValidationMessage(res, issue, nodeById, hopById) }))
            : [],
    };
}

function localizePlanMessage(res, message) {
    const text = String(message || '');
    let match = text.match(/^Port\s+(\d+)\s+is already used by legacy link "(.+)"\.$/);
    if (match) {
        return tFor(res, 'cascades.planPortUsedByLegacyLink', 'Port {port} is already used by legacy link "{linkName}".', {
            port: match[1],
            linkName: match[2],
        });
    }

    match = text.match(/^Port\s+(\d+)\s+is reused by multiple draft hops in the same batch\.$/);
    if (match) {
        return tFor(res, 'cascades.planPortReusedInBatch', 'Port {port} is reused by multiple draft hops in the same batch.', {
            port: match[1],
        });
    }

    if (text === 'Draft references a node that no longer exists.') return tFor(res, 'cascades.planDraftNodeMissing', text);
    if (text === 'Hybrid cascade is disabled for this panel instance.') return tFor(res, 'cascades.planHybridDisabledInstance', text);
    if (text === 'REALITY is not compatible with WebSocket.') return tFor(res, 'cascades.planRealityWsIncompatible', text);
    if (text === 'One of the affected nodes has no SSH credentials configured.') return tFor(res, 'cascades.planAffectedNodeMissingSsh', text);
    if (text === 'One of the affected nodes is offline.') return tFor(res, 'cascades.planAffectedNodeOffline', text);
    if (text === 'This draft belongs to a mixed-mode chain. Split reverse and forward hops before commit/deploy.') return tFor(res, 'cascades.planMixedModeDraft', text);
    if (text === 'Link name will be generated from source and target nodes.') return tFor(res, 'cascades.planAssumeGeneratedName', text);
    if (text === 'Commit bridge still uses legacy CascadeLink defaults such as priority 100 and pending status.') return tFor(res, 'cascades.planAssumeLegacyDefaults', text);
    if (text === 'No REALITY-specific key material is required for this draft in its current form.') return tFor(res, 'cascades.planAssumeNoRealityKeys', text);
    if (text === 'Transport-specific advanced fields (WS/gRPC/XHTTP paths) stay on their current defaults.') return tFor(res, 'cascades.planAssumeTransportDefaults', text);
    if (text === 'This connected chain mixes reverse and forward hops. Legacy deployChain cannot apply mixed modes together.') return tFor(res, 'cascades.planChainMixedModes', text);
    if (text === 'One or more affected nodes are not online right now.') return tFor(res, 'cascades.planChainOfflineNodes', text);
    if (text === 'One or more affected nodes have no SSH credentials configured.') return tFor(res, 'cascades.planChainMissingSsh', text);

    return text;
}

function localizePlanAction(res, action, nodeName = '') {
    const text = String(action || '');
    let match = text.match(/^.+: deploy forward-hop inbound config and open (\d+) port(?:s)?$/);
    if (match) return tFor(res, 'cascades.planActionForwardBridgeRelay', '{node}: deploy forward-hop inbound config and open ports: {count}', { node: nodeName, count: match[1] });

    match = text.match(/^.+: deploy portal config and open (\d+) port(?:s)?$/);
    if (match) return tFor(res, 'cascades.planActionReversePortal', '{node}: deploy portal config and open ports: {count}', { node: nodeName, count: match[1] });

    match = text.match(/^.+: deploy relay config and open (\d+) downstream port(?:s)?$/);
    if (match) return tFor(res, 'cascades.planActionReverseRelay', '{node}: deploy relay config and open downstream ports: {count}', { node: nodeName, count: match[1] });

    if (text.endsWith(': deploy portal outbound config')) return tFor(res, 'cascades.planActionForwardPortal', '{node}: deploy portal outbound config', { node: nodeName });
    if (text.endsWith(': deploy bridge runtime / sidecar')) return tFor(res, 'cascades.planActionBridgeRuntime', '{node}: deploy bridge runtime / sidecar', { node: nodeName });
    if (text.endsWith(': no runtime change')) return tFor(res, 'cascades.planActionNoRuntimeChange', '{node}: no runtime change', { node: nodeName });

    return text;
}

function localizePlan(res, plan) {
    if (!plan || typeof plan !== 'object') return plan;

    return {
        ...plan,
        hops: Array.isArray(plan.hops)
            ? plan.hops.map((hop) => ({
                ...hop,
                errors: Array.isArray(hop.errors) ? hop.errors.map((item) => localizePlanMessage(res, item)) : [],
                warnings: Array.isArray(hop.warnings) ? hop.warnings.map((item) => localizePlanMessage(res, item)) : [],
                assumptions: Array.isArray(hop.assumptions) ? hop.assumptions.map((item) => localizePlanMessage(res, item)) : [],
            }))
            : [],
        chains: Array.isArray(plan.chains)
            ? plan.chains.map((chain) => ({
                ...chain,
                deployWarnings: Array.isArray(chain.deployWarnings) ? chain.deployWarnings.map((item) => localizePlanMessage(res, item)) : [],
                nodeActions: Array.isArray(chain.nodeActions)
                    ? chain.nodeActions.map((item) => ({
                        ...item,
                        action: localizePlanAction(res, item.action, item.nodeName),
                    }))
                    : [],
            }))
            : [],
    };
}

function generateUuid() {
    return crypto.randomUUID();
}

function getHybridCompatibilityError(portalNode, bridgeNode, res) {
    const stack = resolveStack(portalNode?.type, bridgeNode?.type);
    if (stack !== 'hybrid') return '';
    if (config.FEATURE_CASCADE_HYBRID) return '';
    const src = portalNode?.type || 'unknown';
    const dst = bridgeNode?.type || 'unknown';
    return `${tFor(res, 'cascades.hybridDisabledError', 'Hybrid cascade is disabled. Enable FEATURE_CASCADE_HYBRID=true or turn it on in Settings > System.')} ${tFor(res, 'cascades.unsupportedLinkType', 'Unsupported link type: {src} -> {dst}', { src, dst })}`;
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

const ALLOWED_HOP_MODES = new Set(['reverse', 'forward']);
const ALLOWED_TUNNEL_PROTOCOLS = new Set(['vless', 'vmess']);
const ALLOWED_TUNNEL_TRANSPORTS = new Set(['tcp', 'ws', 'grpc', 'xhttp', 'splithttp']);
const ALLOWED_TUNNEL_SECURITIES = new Set(['none', 'tls', 'reality']);

function sanitizeDraftHopName(name, fallbackName) {
    const normalized = String(name ?? '').trim().slice(0, 120);
    return normalized || String(fallbackName || '').trim();
}

function normalizeDraftBoolean(value, fallback = false) {
    if (value === undefined || value === null) return !!fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return !!fallback;
}

function parseDraftPort(rawValue, fallback = 10086) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return Number.parseInt(fallback, 10) || 10086;
    return parsed;
}

async function getStoredDraft(req, flowId = 'legacy-topology') {
    return cacheService.getCascadeBuilderDraft(getBuilderActorKey(req), flowId);
}

async function saveStoredDraft(req, flowId = 'legacy-topology', draftState = {}) {
    return cacheService.setCascadeBuilderDraft(getBuilderActorKey(req), flowId, draftState);
}

async function createLegacyLinkFromDraft(draftHop, res) {
    const portalNodeId = draftHop.sourceNodeId;
    const bridgeNodeId = draftHop.targetNodeId;
    const linkMode = draftHop.mode || 'reverse';
    const port = parseInt(draftHop.tunnelPort, 10) || 10086;

    const [portalNode, bridgeNode] = await Promise.all([
        HyNode.findById(portalNodeId),
        HyNode.findById(bridgeNodeId),
    ]);

    if (!portalNode) {
        throw new Error(tFor(res, 'cascades.draftPortalMissing', 'Portal node was not found for draft {name}', { name: draftHop.name }));
    }
    if (!bridgeNode) {
        throw new Error(tFor(res, 'cascades.draftBridgeMissing', 'Bridge node was not found for draft {name}', { name: draftHop.name }));
    }

    const hybridError = getHybridCompatibilityError(portalNode, bridgeNode, res);
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
        const sideLabel = linkMode === 'forward'
            ? tFor(res, 'cascades.portSideBridge', 'bridge/relay')
            : tFor(res, 'cascades.portSidePortal', 'portal');
        throw new Error(tFor(res, 'cascades.portAlreadyUsed', 'Port {port} is already used by link "{linkName}" on the {sideLabel} side', {
            port,
            linkName: existingLink.name,
            sideLabel,
        }));
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
    state.validation = localizeValidation(req.res, state, validateBuilderState(state));
    return state;
}

async function buildCommitPreview(req) {
    const state = await buildState(req);
    const activeLinks = await CascadeLink.find({ active: true })
        .select('name mode portalNode bridgeNode tunnelPort status')
        .lean();

    const plan = localizePlan(req.res, buildCommitPlan({
        nodes: state.nodes,
        hops: state.hops,
        activeLinks,
    }));

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
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
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
        const validation = localizeValidation(res, state, validateBuilderState(state));
        res.json({
            validation,
            summary: validation.summary,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Validate error: ${error.message}`);
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
    }
});

async function handleCommitPreview(req, res) {
    try {
        const preview = await buildCommitPreview(req);
        res.json(preview);
    } catch (error) {
        logger.error(`[Cascade Builder API] Plan commit error: ${error.message}`);
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
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
            return res.status(404).json({ error: tFor(res, 'cascades.sourceOrTargetMissing', 'Source or target node was not found in the current builder state.') });
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
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
    }
});

router.patch('/drafts/:hopId', requireScope('nodes:write'), async (req, res) => {
    try {
        const hopId = String(req.params?.hopId || '');
        if (!hopId) {
            return res.status(400).json({ error: tFor(res, 'cascades.draftEditInvalidPayload', 'Draft update payload is invalid.') });
        }

        const state = await buildState(req);
        const storedDraft = await getStoredDraft(req, state.flowId);
        const draftHops = Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [];
        const draftIndex = draftHops.findIndex((hop) => String(hop?.id || '') === hopId);

        if (draftIndex < 0) {
            return res.status(404).json({ error: tFor(res, 'cascades.draftHopNotFound', 'Draft hop was not found.') });
        }

        const currentHop = draftHops[draftIndex] || {};
        const sourceNode = state.nodes.find((node) => String(node.id) === String(currentHop.sourceNodeId));
        const targetNode = state.nodes.find((node) => String(node.id) === String(currentHop.targetNodeId));
        if (!sourceNode || !targetNode) {
            return res.status(422).json({ error: tFor(res, 'cascades.planDraftNodeMissing', 'Draft references a node that no longer exists.') });
        }

        const payload = req.body && typeof req.body === 'object' ? req.body : {};

        const nextMode = payload.mode !== undefined ? String(payload.mode).trim().toLowerCase() : String(currentHop.mode || 'reverse').toLowerCase();
        if (!ALLOWED_HOP_MODES.has(nextMode)) {
            return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidMode', 'Unsupported draft mode.') });
        }

        const nextProtocol = payload.tunnelProtocol !== undefined ? String(payload.tunnelProtocol).trim().toLowerCase() : String(currentHop.tunnelProtocol || 'vless').toLowerCase();
        if (!ALLOWED_TUNNEL_PROTOCOLS.has(nextProtocol)) {
            return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidProtocol', 'Unsupported tunnel protocol for draft hop.') });
        }

        const nextTransport = payload.tunnelTransport !== undefined ? String(payload.tunnelTransport).trim().toLowerCase() : String(currentHop.tunnelTransport || 'tcp').toLowerCase();
        if (!ALLOWED_TUNNEL_TRANSPORTS.has(nextTransport)) {
            return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidTransport', 'Unsupported tunnel transport for draft hop.') });
        }

        const nextSecurity = payload.tunnelSecurity !== undefined ? String(payload.tunnelSecurity).trim().toLowerCase() : String(currentHop.tunnelSecurity || 'none').toLowerCase();
        if (!ALLOWED_TUNNEL_SECURITIES.has(nextSecurity)) {
            return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidSecurity', 'Unsupported tunnel security for draft hop.') });
        }

        const nextPort = payload.tunnelPort !== undefined
            ? parseDraftPort(payload.tunnelPort, currentHop.tunnelPort)
            : parseDraftPort(currentHop.tunnelPort, 10086);
        if (!Number.isFinite(nextPort) || nextPort < 1 || nextPort > 65535) {
            return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidPort', 'Tunnel port must be within 1-65535.') });
        }

        const nextHop = {
            ...currentHop,
            id: hopId,
            edgeId: String(currentHop.edgeId || hopId),
            sourceNodeId: String(currentHop.sourceNodeId),
            targetNodeId: String(currentHop.targetNodeId),
            name: sanitizeDraftHopName(payload.name, currentHop.name || `${sourceNode.name} -> ${targetNode.name}`),
            mode: nextMode,
            stack: resolveStack(sourceNode.type, targetNode.type),
            tunnelProtocol: nextProtocol,
            tunnelTransport: nextTransport,
            tunnelSecurity: nextSecurity,
            tunnelPort: nextPort,
            muxEnabled: normalizeDraftBoolean(payload.muxEnabled, currentHop.muxEnabled),
            status: 'draft',
            isDraft: true,
        };

        const tentativeHops = state.hops.map((hop) => (String(hop.id) === hopId ? nextHop : hop));
        const tentativeState = {
            ...state,
            hops: tentativeHops,
        };
        const validation = localizeValidation(res, tentativeState, validateBuilderState(tentativeState));
        if ((validation?.errors || []).length > 0) {
            return res.status(422).json({
                error: tFor(res, 'cascades.draftEditValidationFailed', 'Draft settings are invalid. Fix the validation issues and try again.'),
                validation,
            });
        }

        const nextDraftHops = [...draftHops];
        nextDraftHops[draftIndex] = nextHop;
        const nodePositions = storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
            ? storedDraft.nodePositions
            : {};

        await saveStoredDraft(req, state.flowId, {
            draftHops: nextDraftHops,
            nodePositions,
        });

        const nextState = await buildState(req);
        const persistedHop = (nextState.hops || []).find((hop) => hop.isDraft && String(hop.id) === hopId) || null;
        return res.json({
            success: true,
            hop: persistedHop,
            validation: nextState.validation,
            summary: nextState.validation.summary,
            draft: nextState.draft,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Update draft error: ${error.message}`);
        return res.status(500).json({ error: localizeBuilderApiError(res, error) });
    }
});

router.delete('/drafts/:hopId', requireScope('nodes:write'), async (req, res) => {
    try {
        const hopId = String(req.params?.hopId || '');
        const state = await buildState(req);
        const storedDraft = await getStoredDraft(req, state.flowId);
        const draftHops = Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [];
        const nextDraftHops = draftHops.filter((hop) => String(hop?.id || '') !== hopId);

        if (nextDraftHops.length === draftHops.length) {
            return res.status(404).json({ error: tFor(res, 'cascades.draftHopNotFound', 'Draft hop was not found.') });
        }

        await saveStoredDraft(req, state.flowId, {
            draftHops: nextDraftHops,
            nodePositions: storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
                ? storedDraft.nodePositions
                : {},
        });

        const nextState = await buildState(req);
        return res.json({
            success: true,
            validation: nextState.validation,
            summary: nextState.validation.summary,
            draft: nextState.draft,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Delete draft error: ${error.message}`);
        return res.status(500).json({ error: localizeBuilderApiError(res, error) });
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
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
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
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
    }
});

router.post('/commit-drafts', requireScope('nodes:write'), async (req, res) => {
    try {
        const deployAfterCommit = String(req.body?.deployAfterCommit || '').toLowerCase() === 'true'
            || req.body?.deployAfterCommit === true;
        const state = await buildState(req);
        const storedDraft = await getStoredDraft(req, state.flowId);
        const draftHops = Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [];

        if (!draftHops.length) {
            return res.status(400).json({ error: tFor(res, 'cascades.noDraftsToCommit', 'There are no draft hops to commit right now') });
        }

        const activeLinks = await CascadeLink.find({ active: true })
            .select('name mode portalNode bridgeNode tunnelPort status')
            .lean();
        const plan = localizePlan(res, buildCommitPlan({
            nodes: state.nodes,
            hops: state.hops,
            activeLinks,
        }));
        const planHopById = new Map(
            (Array.isArray(plan?.hops) ? plan.hops : [])
                .map((hop) => [String(hop.hopId || ''), hop]),
        );
        const planChainById = new Map(
            (Array.isArray(plan?.chains) ? plan.chains : [])
                .map((chain) => [String(chain.id || ''), chain]),
        );

        const results = [];
        const committedIds = [];
        const committedLinks = [];

        for (const draftHop of draftHops) {
            const hopId = String(draftHop.id || '');
            const planHop = planHopById.get(hopId);
            if (planHop && !planHop.canCommit) {
                const planErrors = Array.isArray(planHop.errors) ? planHop.errors.filter(Boolean) : [];
                const blockedReason = planErrors.length
                    ? planErrors.join(' ')
                    : tFor(res, 'cascades.draftBlockedByPlan', 'Draft hop is blocked by commit plan checks.');
                results.push({
                    hopId,
                    success: false,
                    error: blockedReason,
                    name: draftHop.name,
                    blockedByPlan: true,
                });
                continue;
            }

            try {
                const link = await createLegacyLinkFromDraft(draftHop, res);
                committedIds.push(hopId);
                committedLinks.push({
                    hopId,
                    linkId: String(link._id),
                    portalNodeId: String(link.portalNode || ''),
                    componentId: String(planHop?.componentId || ''),
                });
                results.push({
                    hopId,
                    success: true,
                    linkId: String(link._id),
                    name: link.name,
                });
            } catch (error) {
                results.push({
                    hopId,
                    success: false,
                    error: localizeBuilderApiError(res, error),
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

        let deployment = null;
        if (deployAfterCommit) {
            const touchedChainIds = new Set(
                committedLinks
                    .map((item) => item.componentId)
                    .filter(Boolean),
            );

            const fallbackNodeIds = new Set(
                committedLinks
                    .map((item) => item.portalNodeId)
                    .filter(Boolean),
            );

            const chainDeployTargets = [];

            for (const chainId of touchedChainIds) {
                const chain = planChainById.get(chainId);
                if (!chain) continue;
                const startNodeId = Array.isArray(chain.nodeIds) && chain.nodeIds.length
                    ? String(chain.nodeIds[0])
                    : String(chain.nodeActions?.[0]?.nodeId || '');
                if (!startNodeId) continue;
                chainDeployTargets.push({ chainId, startNodeId });
            }

            if (chainDeployTargets.length === 0) {
                for (const startNodeId of fallbackNodeIds) {
                    chainDeployTargets.push({ chainId: null, startNodeId });
                }
            }

            const deployResults = [];
            for (const target of chainDeployTargets) {
                try {
                    const deployResult = await cascadeService.deployChain(target.startNodeId);
                    if (deployResult?.success) {
                        deployResults.push({
                            chainId: target.chainId,
                            startNodeId: target.startNodeId,
                            success: true,
                            deployed: Number(deployResult.deployed || 0),
                            errors: [],
                        });
                    } else {
                        deployResults.push({
                            chainId: target.chainId,
                            startNodeId: target.startNodeId,
                            success: false,
                            deployed: Number(deployResult?.deployed || 0),
                            errors: Array.isArray(deployResult?.errors) ? deployResult.errors : [tFor(res, 'cascades.chainDeployFailed', 'Chain deploy failed')],
                        });
                    }
                } catch (error) {
                    deployResults.push({
                        chainId: target.chainId,
                        startNodeId: target.startNodeId,
                        success: false,
                        deployed: 0,
                        errors: [error.message || tFor(res, 'cascades.chainDeployFailed', 'Chain deploy failed')],
                    });
                }
            }

            const deployedChains = deployResults.filter((item) => item.success).length;
            const failedChains = deployResults.filter((item) => !item.success).length;

            deployment = {
                requested: true,
                chains: deployResults.length,
                deployedChains,
                failedChains,
                results: deployResults,
            };
        }

        const nextState = await buildState(req);
        const deploymentFailed = Number(deployment?.failedChains || 0) > 0;
        res.json({
            success: committedIds.length > 0 && !deploymentFailed,
            committed: committedIds.length,
            failed: results.filter((item) => !item.success).length,
            results,
            deployment,
            validation: nextState.validation,
            summary: nextState.validation.summary,
            draft: nextState.draft,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Commit drafts error: ${error.message}`);
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
    }
});

module.exports = router;
