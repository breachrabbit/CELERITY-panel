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

    if (message === 'invalid-reality-fingerprint') {
        return tFor(res, 'cascades.draftEditInvalidRealityFingerprint', 'Unsupported REALITY/TLS fingerprint for draft hop.');
    }
    if (message === 'invalid-reality-short-id') {
        return tFor(res, 'cascades.draftEditInvalidRealityShortId', 'REALITY shortId must be hex and up to 16 chars.');
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
    if (text === 'REALITY key pair/shortId will be generated automatically on commit if missing in draft settings.') return tFor(res, 'cascades.planAssumeRealityAutoKeys', text);
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
const ALLOWED_XHTTP_MODES = new Set(['auto', 'packet-up', 'stream-up', 'stream-one']);
const ALLOWED_REALITY_FINGERPRINTS = new Set(['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'randomized']);
const REALITY_KEY_RE = /^[A-Za-z0-9_\-+/]{43,44}=?$/;
const REALITY_SHORT_ID_RE = /^[0-9a-fA-F]{0,16}$/;

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

function sanitizeDraftText(rawValue, fallback = '', { max = 256 } = {}) {
    const value = String(rawValue ?? '').trim().slice(0, max);
    if (value) return value;
    return String(fallback ?? '').trim().slice(0, max);
}

function normalizeDraftList(rawValue, fallback = [], { maxItems = 6, itemMax = 128 } = {}) {
    const source = Array.isArray(rawValue)
        ? rawValue
        : String(rawValue ?? '')
            .split(/[\n,]+/)
            .map((value) => value.trim());

    const normalized = source
        .map((value) => String(value || '').trim().slice(0, itemMax))
        .filter(Boolean)
        .slice(0, maxItems);

    if (normalized.length > 0) return normalized;
    if (Array.isArray(fallback) && fallback.length > 0) {
        return fallback
            .map((value) => String(value || '').trim().slice(0, itemMax))
            .filter(Boolean)
            .slice(0, maxItems);
    }
    return [];
}

function resolveDraftRealityFields(payload = {}, currentHop = {}) {
    const fallbackSni = Array.isArray(currentHop.realitySni)
        ? currentHop.realitySni
        : (currentHop.realitySni ? [String(currentHop.realitySni)] : ['www.google.com']);
    const realitySni = normalizeDraftList(
        payload.realitySni !== undefined ? payload.realitySni : fallbackSni,
        fallbackSni.length > 0 ? fallbackSni : ['www.google.com'],
        { maxItems: 6, itemMax: 128 },
    );
    const realityDest = sanitizeDraftText(
        payload.realityDest !== undefined ? payload.realityDest : currentHop.realityDest,
        currentHop.realityDest || 'www.google.com:443',
        { max: 160 },
    );
    const realityFingerprint = String(
        payload.realityFingerprint !== undefined ? payload.realityFingerprint : (currentHop.realityFingerprint || 'chrome'),
    ).trim().toLowerCase();
    const resolvedFingerprint = realityFingerprint || 'chrome';
    if (!ALLOWED_REALITY_FINGERPRINTS.has(resolvedFingerprint)) {
        throw new Error('invalid-reality-fingerprint');
    }

    const rawShortId = String(
        payload.realityShortId !== undefined
            ? payload.realityShortId
            : (currentHop.realityShortId || (Array.isArray(currentHop.realityShortIds) ? (currentHop.realityShortIds.find((value) => String(value || '').trim()) || '') : '')),
    ).trim().toLowerCase().slice(0, 16);
    if (!REALITY_SHORT_ID_RE.test(rawShortId)) {
        throw new Error('invalid-reality-short-id');
    }

    return {
        realityDest: realityDest || 'www.google.com:443',
        realitySni: realitySni.length > 0 ? realitySni : ['www.google.com'],
        realityFingerprint: resolvedFingerprint,
        realityShortId: rawShortId,
    };
}

function generateRealityKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    const pub = publicKey.export({ format: 'jwk' });
    const priv = privateKey.export({ format: 'jwk' });

    if (!pub?.x || !priv?.d) {
        throw new Error('Failed to generate REALITY x25519 key pair');
    }

    return {
        realityPrivateKey: priv.d,
        realityPublicKey: pub.x,
    };
}

function resolveLegacyLinkSecurityFields(draftHop = {}) {
    const baseSni = normalizeDraftList(draftHop.realitySni, ['www.google.com'], { maxItems: 6, itemMax: 128 });
    const baseFingerprint = ALLOWED_REALITY_FINGERPRINTS.has(String(draftHop.realityFingerprint || '').trim().toLowerCase())
        ? String(draftHop.realityFingerprint || '').trim().toLowerCase()
        : 'chrome';
    const baseShortId = String(draftHop.realityShortId || '').trim().toLowerCase();

    if (String(draftHop.tunnelSecurity || 'none') !== 'reality') {
        return {
            realityDest: String(draftHop.realityDest || '').trim() || 'www.google.com:443',
            realitySni: baseSni,
            realityPrivateKey: '',
            realityPublicKey: '',
            realityShortIds: baseShortId ? [baseShortId] : [''],
            realityFingerprint: baseFingerprint,
        };
    }

    let realityPrivateKey = String(draftHop.realityPrivateKey || '').trim();
    let realityPublicKey = String(draftHop.realityPublicKey || '').trim();
    if (!REALITY_KEY_RE.test(realityPrivateKey) || !REALITY_KEY_RE.test(realityPublicKey)) {
        const generated = generateRealityKeyPair();
        realityPrivateKey = generated.realityPrivateKey;
        realityPublicKey = generated.realityPublicKey;
    }

    const shortIdFromList = Array.isArray(draftHop.realityShortIds)
        ? String(draftHop.realityShortIds.find((value) => String(value || '').trim()) || '').trim().toLowerCase()
        : '';
    let resolvedShortId = baseShortId || shortIdFromList;
    if (!resolvedShortId) {
        resolvedShortId = crypto.randomBytes(8).toString('hex');
    }
    if (!REALITY_SHORT_ID_RE.test(resolvedShortId)) {
        throw new Error('invalid-reality-short-id');
    }

    return {
        realityDest: String(draftHop.realityDest || '').trim() || 'www.google.com:443',
        realitySni: baseSni.length > 0 ? baseSni : ['www.google.com'],
        realityPrivateKey,
        realityPublicKey,
        realityShortIds: [resolvedShortId],
        realityFingerprint: baseFingerprint,
    };
}

function resolveDraftGeoRoutingFields(payload = {}, currentHop = {}) {
    const geoRoutingEnabled = normalizeDraftBoolean(
        payload.geoRoutingEnabled,
        currentHop.geoRoutingEnabled || currentHop.geoRouting?.enabled,
    );
    const geoDomains = normalizeDraftList(
        payload.geoDomains !== undefined ? payload.geoDomains : (currentHop.geoDomains || currentHop.geoRouting?.domains || []),
        [],
        { maxItems: 96, itemMax: 256 },
    );
    const geoIp = normalizeDraftList(
        payload.geoIp !== undefined ? payload.geoIp : (currentHop.geoIp || currentHop.geoRouting?.geoip || []),
        [],
        { maxItems: 96, itemMax: 64 },
    );

    return {
        geoRoutingEnabled,
        geoDomains,
        geoIp,
    };
}

async function getStoredDraft(req, flowId = 'legacy-topology') {
    return cacheService.getCascadeBuilderDraft(getBuilderActorKey(req), flowId);
}

async function saveStoredDraft(req, flowId = 'legacy-topology', draftState = {}) {
    const existingDraft = await getStoredDraft(req, flowId);
    const hasExplicitLastExecution = Object.prototype.hasOwnProperty.call(draftState || {}, 'lastExecution');
    const resolvedLastExecution = hasExplicitLastExecution
        ? ((draftState?.lastExecution && typeof draftState.lastExecution === 'object') ? draftState.lastExecution : null)
        : ((existingDraft?.lastExecution && typeof existingDraft.lastExecution === 'object') ? existingDraft.lastExecution : null);

    return cacheService.setCascadeBuilderDraft(getBuilderActorKey(req), flowId, {
        ...draftState,
        lastExecution: resolvedLastExecution,
    });
}

function localizeDeployErrorMessage(res, message) {
    const text = String(message || '').trim();
    if (!text) return tFor(res, 'network.chainDeployFailed', 'Chain deploy failed');
    if (text === 'Chain deploy failed') return tFor(res, 'network.chainDeployFailed', 'Chain deploy failed');
    return localizePlanMessage(res, text);
}

function buildNodeActionMatchers(nodeActions = []) {
    const byId = new Map();
    const byName = new Map();
    for (const action of Array.isArray(nodeActions) ? nodeActions : []) {
        const nodeId = String(action?.nodeId || '').trim();
        const nodeName = String(action?.nodeName || '').trim();
        if (nodeId) byId.set(nodeId, action);
        if (nodeName) byName.set(nodeName.toLowerCase(), action);
    }
    return { byId, byName };
}

function findRelatedHopNames(nodeName, hopNames = []) {
    const normalizedNodeName = String(nodeName || '').trim().toLowerCase();
    if (!normalizedNodeName) return [];
    return (Array.isArray(hopNames) ? hopNames : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((item) => item.toLowerCase().includes(normalizedNodeName))
        .slice(0, 3);
}

function classifyDeployErrorCode(rawText = '', messageText = '') {
    const source = `${String(rawText || '')} ${String(messageText || '')}`.toLowerCase();
    if (source.includes('no ssh credentials')) return 'missing-ssh';
    if (source.includes('timed out while waiting for handshake') || source.includes('connection timed out') || source.includes('operation timed out')) return 'ssh-timeout';
    if (source.includes('all configured authentication methods failed') || source.includes('permission denied') || source.includes('unable to authenticate')) return 'ssh-auth-failed';
    if (
        source.includes('connect econnrefused')
        || source.includes('connection refused')
        || source.includes('no route to host')
        || source.includes('ehostunreach')
        || source.includes('enetunreach')
        || source.includes('host is down')
    ) return 'ssh-connect-failed';
    if (source.includes('is not online right now') || source.includes('node is offline')) return 'node-offline';
    if (source.includes('hybrid cascade is disabled')) return 'hybrid-disabled';
    if (source.includes('sidecar is disabled')) return 'sidecar-disabled';
    if (source.includes('custom config is enabled')) return 'custom-config-enabled';
    if (source.includes('mixed reverse/forward links')) return 'mixed-chain-mode';
    if (source.includes('not listening after service start')) return 'service-port-not-listening';
    if (source.includes('failed (exit')) return 'remote-command-failed';
    if (source.includes('is missing from generated') || source.includes('is missing from /')) return 'generated-config-missing-marker';
    if (source.includes('node not found') || source.includes('link not found') || source.includes('not found')) return 'resource-not-found';
    return 'deploy-failed';
}

function localizeDeployRepairHint(res, code, { nodeName = '' } = {}) {
    switch (code) {
    case 'missing-ssh':
        return tFor(
            res,
            'cascades.executionHintMissingSsh',
            'SSH credentials are missing. Add SSH for this node, then run node repair and retry chain.',
            { nodeName },
        );
    case 'ssh-timeout':
        return tFor(
            res,
            'cascades.executionHintSshTimeout',
            'SSH timeout while connecting to node. Check node reachability/firewall and retry.',
            { nodeName },
        );
    case 'ssh-auth-failed':
        return tFor(
            res,
            'cascades.executionHintSshAuthFailed',
            'SSH authentication failed. Verify username/key/password and run node repair.',
            { nodeName },
        );
    case 'ssh-connect-failed':
        return tFor(
            res,
            'cascades.executionHintSshConnectFailed',
            'Panel cannot reach node over SSH. Check IP, port and network route.',
            { nodeName },
        );
    case 'node-offline':
        return tFor(
            res,
            'cascades.executionHintNodeOffline',
            'Node is offline right now. Bring it online first, then rerun chain deploy.',
            { nodeName },
        );
    case 'hybrid-disabled':
        return tFor(
            res,
            'cascades.executionHintHybridDisabled',
            'Hybrid cascade is disabled. Enable hybrid in Settings and retry chain.',
            { nodeName },
        );
    case 'sidecar-disabled':
        return tFor(
            res,
            'cascades.executionHintSidecarDisabled',
            'Cascade sidecar is disabled on this node. Enable sidecar and run node repair.',
            { nodeName },
        );
    case 'custom-config-enabled':
        return tFor(
            res,
            'cascades.executionHintCustomConfig',
            'Custom runtime config blocks cascade deploy. Disable custom config and rerun chain.',
            { nodeName },
        );
    case 'mixed-chain-mode':
        return tFor(
            res,
            'cascades.executionHintMixedMode',
            'This chain mixes forward and reverse hops. Split it by mode, then deploy again.',
        );
    case 'service-port-not-listening':
        return tFor(
            res,
            'cascades.executionHintPortNotListening',
            'Runtime service started but the expected port is not listening. Run node repair and check service logs.',
            { nodeName },
        );
    case 'remote-command-failed':
        return tFor(
            res,
            'cascades.executionHintRemoteCommandFailed',
            'A remote command failed on this node. Open node logs/terminal and rerun chain after fix.',
            { nodeName },
        );
    case 'generated-config-missing-marker':
        return tFor(
            res,
            'cascades.executionHintConfigMarkerMissing',
            'Generated config is missing an internal cascade marker. Run node repair and retry chain.',
            { nodeName },
        );
    case 'resource-not-found':
        return tFor(
            res,
            'cascades.executionHintResourceMissing',
            'A node or link resource was not found. Refresh topology and run deployment again.',
        );
    default:
        return tFor(
            res,
            'cascades.executionHintGeneric',
            'Review node logs, fix the issue, then retry chain deployment.',
        );
    }
}

function buildDeploySuggestedActions(code, { hasNodeId = false } = {}) {
    const actions = ['rerun-chain'];
    if (hasNodeId) actions.push('focus-node');
    if (['ssh-timeout', 'ssh-auth-failed', 'ssh-connect-failed'].includes(code)) {
        actions.push('check-ssh');
    }
    if (['ssh-timeout', 'ssh-connect-failed', 'node-offline'].includes(code)) {
        actions.push('check-network');
    }
    if (hasNodeId && ['missing-ssh', 'ssh-timeout', 'ssh-auth-failed', 'ssh-connect-failed', 'sidecar-disabled', 'service-port-not-listening', 'remote-command-failed', 'generated-config-missing-marker', 'deploy-failed'].includes(code)) {
        actions.push('repair-node');
    }
    if (['hybrid-disabled', 'mixed-chain-mode', 'custom-config-enabled', 'node-offline'].includes(code)) {
        actions.push('review-chain');
    }
    return [...new Set(actions)];
}

function buildDeployErrorDetails(res, rawErrors = [], displayErrors = [], nodeActions = [], hopNames = []) {
    const { byName } = buildNodeActionMatchers(nodeActions);
    const rawList = Array.isArray(rawErrors) ? rawErrors : [];
    const displayList = Array.isArray(displayErrors) ? displayErrors : [];
    return rawList
        .map((item, index) => ({
            raw: String(item || '').trim(),
            display: String(displayList[index] || item || '').trim(),
        }))
        .filter((item) => item.raw || item.display)
        .map((item) => {
            const rawText = item.raw || item.display;
            const displayText = item.display || item.raw;
            const nodeMatch = rawText.match(/^([^:]{1,180}):\s+(.+)$/) || displayText.match(/^([^:]{1,180}):\s+(.+)$/);
            if (nodeMatch) {
                const rawNodeName = String(nodeMatch[1] || '').trim();
                const rawMessage = String(nodeMatch[2] || '').trim();
                const action = byName.get(rawNodeName.toLowerCase()) || null;
                const displayMessage = displayText.startsWith(`${rawNodeName}:`)
                    ? String(displayText.slice(rawNodeName.length + 1)).trim()
                    : displayText;
                const message = displayMessage || rawMessage;
                const code = classifyDeployErrorCode(rawText, rawMessage || message);
                const nodeName = action?.nodeName || rawNodeName;
                return {
                    scope: 'node',
                    code,
                    severity: ['missing-ssh', 'ssh-auth-failed', 'hybrid-disabled', 'sidecar-disabled', 'custom-config-enabled', 'mixed-chain-mode'].includes(code) ? 'critical' : 'error',
                    nodeName,
                    nodeId: String(action?.nodeId || ''),
                    nodeStatus: String(action?.status || ''),
                    message: message || rawText,
                    hint: localizeDeployRepairHint(res, code, { nodeName }),
                    suggestedActions: buildDeploySuggestedActions(code, { hasNodeId: !!action?.nodeId }),
                    relatedHops: findRelatedHopNames(rawNodeName, hopNames),
                    raw: rawText,
                };
            }

            const code = classifyDeployErrorCode(rawText, displayText);
            return {
                scope: 'chain',
                code,
                severity: ['mixed-chain-mode', 'hybrid-disabled'].includes(code) ? 'critical' : 'error',
                nodeName: '',
                nodeId: '',
                message: displayText || rawText,
                hint: localizeDeployRepairHint(res, code),
                suggestedActions: buildDeploySuggestedActions(code, { hasNodeId: false }),
                relatedHops: [],
                raw: rawText,
            };
        });
}

function buildDeploymentResultEntry({
    res,
    target,
    chain,
    startNode,
    hopNames = [],
    deployResult = null,
    thrownError = null,
}) {
    const success = !thrownError && !!deployResult?.success;
    const rawErrors = thrownError
        ? [thrownError?.message || thrownError]
        : (success
            ? []
            : (Array.isArray(deployResult?.errors) ? deployResult.errors : [tFor(res, 'network.chainDeployFailed', 'Chain deploy failed')]));
    const localizedErrors = rawErrors.map((item) => localizeDeployErrorMessage(res, item));
    const nodeActions = Array.isArray(chain?.nodeActions) ? chain.nodeActions : [];
    const errorDetails = buildDeployErrorDetails(res, rawErrors, localizedErrors, nodeActions, hopNames);

    return {
        chainId: target.chainId,
        chainName: target.chainId || String(startNode?.name || target.startNodeId || 'adhoc-chain'),
        startNodeId: target.startNodeId,
        startNodeName: startNode?.name || String(target.startNodeId || ''),
        chainMode: chain?.chainMode || 'unknown',
        nodeCount: Number(chain?.nodeCount || chain?.nodeIds?.length || 1),
        draftHopCount: Number(chain?.draftHopCount || 0),
        liveHopCount: Number(chain?.liveHopCount || 0),
        nodeActions,
        deployWarnings: Array.isArray(chain?.deployWarnings) ? chain.deployWarnings : [],
        hopNames,
        success,
        deployed: Number(deployResult?.deployed || 0),
        errors: localizedErrors,
        errorDetails,
        primaryError: errorDetails[0]?.message || localizedErrors[0] || '',
    };
}

function sanitizeExecutionFailureItems(items = []) {
    return Array.isArray(items)
        ? items
            .filter((item) => item && item.success === false)
            .map((item) => ({
                hopId: String(item.hopId || ''),
                name: String(item.name || ''),
                error: String(item.error || ''),
                blockedByPlan: !!item.blockedByPlan,
            }))
        : [];
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

    const securityFields = resolveLegacyLinkSecurityFields(draftHop);

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
        wsPath: draftHop.wsPath || '/cascade',
        wsHost: draftHop.wsHost || '',
        grpcServiceName: draftHop.grpcServiceName || 'cascade',
        xhttpPath: draftHop.xhttpPath || '/cascade',
        xhttpHost: draftHop.xhttpHost || '',
        xhttpMode: draftHop.xhttpMode || 'auto',
        realityDest: securityFields.realityDest,
        realitySni: securityFields.realitySni,
        realityPrivateKey: securityFields.realityPrivateKey,
        realityPublicKey: securityFields.realityPublicKey,
        realityShortIds: securityFields.realityShortIds,
        realityFingerprint: securityFields.realityFingerprint,
        geoRouting: {
            enabled: !!draftHop.geoRoutingEnabled,
            domains: Array.isArray(draftHop.geoDomains) ? draftHop.geoDomains : [],
            geoip: Array.isArray(draftHop.geoIp) ? draftHop.geoIp : [],
        },
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
            wsPath: draftSuggestion.wsPath,
            wsHost: draftSuggestion.wsHost,
            grpcServiceName: draftSuggestion.grpcServiceName,
            xhttpPath: draftSuggestion.xhttpPath,
            xhttpHost: draftSuggestion.xhttpHost,
            xhttpMode: draftSuggestion.xhttpMode,
            realityDest: draftSuggestion.realityDest,
            realitySni: draftSuggestion.realitySni,
            realityFingerprint: draftSuggestion.realityFingerprint,
            realityShortId: draftSuggestion.realityShortId || '',
            geoRoutingEnabled: !!draftSuggestion.geoRoutingEnabled,
            geoDomains: Array.isArray(draftSuggestion.geoDomains) ? draftSuggestion.geoDomains : [],
            geoIp: Array.isArray(draftSuggestion.geoIp) ? draftSuggestion.geoIp : [],
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

        const nextWsPath = sanitizeDraftText(payload.wsPath, currentHop.wsPath || '/cascade', { max: 256 });
        const nextWsHost = sanitizeDraftText(payload.wsHost, currentHop.wsHost || '', { max: 128 });
        const nextGrpcServiceName = sanitizeDraftText(payload.grpcServiceName, currentHop.grpcServiceName || 'cascade', { max: 120 });
        const nextXhttpPath = sanitizeDraftText(payload.xhttpPath, currentHop.xhttpPath || '/cascade', { max: 256 });
        const nextXhttpHost = sanitizeDraftText(payload.xhttpHost, currentHop.xhttpHost || '', { max: 128 });
        const nextXhttpMode = payload.xhttpMode !== undefined
            ? String(payload.xhttpMode).trim().toLowerCase()
            : String(currentHop.xhttpMode || 'auto').toLowerCase();
        if (!ALLOWED_XHTTP_MODES.has(nextXhttpMode)) {
            return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidXhttpMode', 'Unsupported XHTTP mode for draft hop.') });
        }
        let realityDraftFields;
        const geoRoutingFields = resolveDraftGeoRoutingFields(payload, currentHop);
        try {
            realityDraftFields = resolveDraftRealityFields(payload, currentHop);
        } catch (error) {
            if (error?.message === 'invalid-reality-fingerprint') {
                return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidRealityFingerprint', 'Unsupported REALITY/TLS fingerprint for draft hop.') });
            }
            if (error?.message === 'invalid-reality-short-id') {
                return res.status(422).json({ error: tFor(res, 'cascades.draftEditInvalidRealityShortId', 'REALITY shortId must be hex and up to 16 chars.') });
            }
            throw error;
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
            wsPath: nextWsPath || '/cascade',
            wsHost: nextWsHost,
            grpcServiceName: nextGrpcServiceName || 'cascade',
            xhttpPath: nextXhttpPath || '/cascade',
            xhttpHost: nextXhttpHost,
            xhttpMode: nextXhttpMode,
            realityDest: realityDraftFields.realityDest,
            realitySni: realityDraftFields.realitySni,
            realityFingerprint: realityDraftFields.realityFingerprint,
            realityShortId: realityDraftFields.realityShortId,
            geoRoutingEnabled: geoRoutingFields.geoRoutingEnabled,
            geoDomains: geoRoutingFields.geoDomains,
            geoIp: geoRoutingFields.geoIp,
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
        const nodeById = new Map(
            (Array.isArray(state?.nodes) ? state.nodes : [])
                .map((node) => [String(node.id || ''), node]),
        );
        const hopNamesByChain = new Map();
        for (const hop of Array.isArray(plan?.hops) ? plan.hops : []) {
            const chainId = String(hop?.componentId || '');
            if (!chainId) continue;
            if (!hopNamesByChain.has(chainId)) hopNamesByChain.set(chainId, []);
            hopNamesByChain.get(chainId).push(hop.name || `${hop.sourceNodeName} -> ${hop.targetNodeName}`);
        }

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
        const failureItems = sanitizeExecutionFailureItems(results);
        const commitCompletedAt = new Date().toISOString();

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
                const chain = target.chainId ? planChainById.get(target.chainId) : null;
                const hopNames = target.chainId ? (hopNamesByChain.get(target.chainId) || []) : [];
                const startNode = nodeById.get(String(target.startNodeId || ''));
                try {
                    const deployResult = await cascadeService.deployChain(target.startNodeId);
                    deployResults.push(buildDeploymentResultEntry({
                        res,
                        target,
                        chain,
                        startNode,
                        hopNames,
                        deployResult,
                    }));
                } catch (error) {
                    deployResults.push(buildDeploymentResultEntry({
                        res,
                        target,
                        chain,
                        startNode,
                        hopNames,
                        thrownError: error,
                    }));
                }
            }

            const deployedChains = deployResults.filter((item) => item.success).length;
            const failedChains = deployResults.filter((item) => !item.success).length;

            deployment = {
                requested: true,
                mode: 'legacy-deploy-chain',
                chains: deployResults.length,
                deployedChains,
                failedChains,
                results: deployResults,
            };
        }

        const executionSnapshot = {
            type: deployAfterCommit ? 'commit-deploy' : 'commit-only',
            createdAt: commitCompletedAt,
            committed: committedIds.length,
            failed: failureItems.length,
            failureItems,
            deployment: deployment
                ? {
                    requested: true,
                    mode: deployment.mode || 'legacy-deploy-chain',
                    chains: Number(deployment.chains || 0),
                    deployedChains: Number(deployment.deployedChains || 0),
                    failedChains: Number(deployment.failedChains || 0),
                    results: Array.isArray(deployment.results) ? deployment.results : [],
                }
                : null,
        };

        await saveStoredDraft(req, state.flowId, {
            draftHops: remainingDrafts,
            nodePositions: storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
                ? storedDraft.nodePositions
                : {},
            lastExecution: executionSnapshot,
        });

        const nextState = await buildState(req);
        const deploymentFailed = Number(deployment?.failedChains || 0) > 0;
        res.json({
            success: committedIds.length > 0 && !deploymentFailed,
            committed: committedIds.length,
            failed: results.filter((item) => !item.success).length,
            results,
            deployment,
            execution: executionSnapshot,
            validation: nextState.validation,
            summary: nextState.validation.summary,
            draft: nextState.draft,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Commit drafts error: ${error.message}`);
        res.status(500).json({ error: localizeBuilderApiError(res, error) });
    }
});

router.post('/rerun-chain', requireScope('nodes:write'), async (req, res) => {
    try {
        const startNodeId = String(req.body?.startNodeId || '').trim();
        const requestedChainId = String(req.body?.chainId || '').trim();
        if (!startNodeId) {
            return res.status(400).json({
                success: false,
                error: tFor(res, 'cascades.executionRerunMissingStartNode', 'Start node is required to rerun a chain.'),
            });
        }

        const state = await buildState(req);
        const activeLinks = await CascadeLink.find({ active: true })
            .select('name mode portalNode bridgeNode tunnelPort status')
            .lean();
        const plan = localizePlan(res, buildCommitPlan({
            nodes: state.nodes,
            hops: state.hops,
            activeLinks,
        }));
        const chainById = new Map(
            (Array.isArray(plan?.chains) ? plan.chains : [])
                .map((chain) => [String(chain?.id || ''), chain]),
        );
        const nodeById = new Map(
            (Array.isArray(state?.nodes) ? state.nodes : [])
                .map((node) => [String(node.id || ''), node]),
        );
        const hopNamesByChain = new Map();
        for (const hop of Array.isArray(plan?.hops) ? plan.hops : []) {
            const chainId = String(hop?.componentId || '');
            if (!chainId) continue;
            if (!hopNamesByChain.has(chainId)) hopNamesByChain.set(chainId, []);
            hopNamesByChain.get(chainId).push(hop.name || `${hop.sourceNodeName} -> ${hop.targetNodeName}`);
        }

        const fallbackStartNode = await HyNode.findById(startNodeId).select('_id name').lean();
        const startNode = nodeById.get(startNodeId) || (fallbackStartNode
            ? { id: String(fallbackStartNode._id), name: fallbackStartNode.name }
            : null);
        const chain = requestedChainId ? chainById.get(requestedChainId) : null;
        const target = {
            chainId: requestedChainId || null,
            startNodeId,
        };
        const hopNames = requestedChainId ? (hopNamesByChain.get(requestedChainId) || []) : [];

        let result;
        try {
            const deployResult = await cascadeService.deployChain(startNodeId);
            result = buildDeploymentResultEntry({
                res,
                target,
                chain,
                startNode,
                hopNames,
                deployResult,
            });
        } catch (error) {
            result = buildDeploymentResultEntry({
                res,
                target,
                chain,
                startNode,
                hopNames,
                thrownError: error,
            });
        }

        const storedDraft = await getStoredDraft(req, state.flowId);
        const previousExecution = (storedDraft?.lastExecution && typeof storedDraft.lastExecution === 'object')
            ? storedDraft.lastExecution
            : null;
        if (previousExecution) {
            const rerunEntry = {
                at: new Date().toISOString(),
                chainId: result.chainId || '',
                startNodeId: result.startNodeId || '',
                success: !!result.success,
                deployed: Number(result.deployed || 0),
                errors: Array.isArray(result.errors) ? result.errors : [],
                errorDetails: Array.isArray(result.errorDetails) ? result.errorDetails : [],
            };
            const previousReruns = Array.isArray(previousExecution.reruns) ? previousExecution.reruns : [];
            previousExecution.reruns = [rerunEntry, ...previousReruns].slice(0, 20);
            if (previousExecution.deployment && Array.isArray(previousExecution.deployment.results)) {
                previousExecution.deployment.results = previousExecution.deployment.results.map((item) => {
                    const sameChain = result.chainId && item?.chainId && String(item.chainId) === String(result.chainId);
                    const sameStart = !result.chainId && String(item?.startNodeId || '') === String(result.startNodeId || '');
                    if (!sameChain && !sameStart) return item;
                    return {
                        ...item,
                        lastRerun: rerunEntry,
                    };
                });
            }
            await saveStoredDraft(req, state.flowId, {
                draftHops: Array.isArray(storedDraft?.draftHops) ? storedDraft.draftHops : [],
                nodePositions: storedDraft?.nodePositions && typeof storedDraft.nodePositions === 'object'
                    ? storedDraft.nodePositions
                    : {},
                lastExecution: previousExecution,
            });
        }

        return res.json({
            success: !!result.success,
            result,
        });
    } catch (error) {
        logger.error(`[Cascade Builder API] Rerun chain error: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: localizeBuilderApiError(res, error),
        });
    }
});

module.exports = router;
