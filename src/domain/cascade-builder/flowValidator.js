const config = require('../../../config');

function inferRole(nodeId, hops) {
    let incoming = 0;
    let outgoing = 0;

    for (const hop of hops) {
        if (String(hop.sourceNodeId) === String(nodeId)) outgoing += 1;
        if (String(hop.targetNodeId) === String(nodeId)) incoming += 1;
    }

    if (incoming > 0 && outgoing > 0) return 'relay';
    if (outgoing > 0) return 'portal';
    if (incoming > 0) return 'bridge';
    return 'standalone';
}

function resolveStack(sourceType, targetType) {
    const src = String(sourceType || '').toLowerCase();
    const dst = String(targetType || '').toLowerCase();
    if (src === 'xray' && dst === 'xray') return 'xray';
    if (src === 'hysteria' && dst === 'hysteria') return 'hysteria2';
    return 'hybrid';
}

function detectCycles(nodes, hops) {
    const nodeIds = nodes.map((node) => String(node.id));
    const adjacency = new Map(nodeIds.map((id) => [id, []]));

    for (const hop of hops) {
        const sourceId = String(hop.sourceNodeId);
        const targetId = String(hop.targetNodeId);
        if (!adjacency.has(sourceId)) adjacency.set(sourceId, []);
        adjacency.get(sourceId).push(targetId);
    }

    const visited = new Set();
    const stack = new Set();
    const cycles = [];

    function dfs(nodeId, path) {
        if (stack.has(nodeId)) {
            const cycleStart = path.indexOf(nodeId);
            cycles.push(path.slice(cycleStart).concat(nodeId));
            return;
        }
        if (visited.has(nodeId)) return;

        visited.add(nodeId);
        stack.add(nodeId);

        for (const nextId of adjacency.get(nodeId) || []) {
            dfs(nextId, path.concat(nextId));
        }

        stack.delete(nodeId);
    }

    for (const nodeId of nodeIds) {
        dfs(nodeId, [nodeId]);
    }

    return cycles;
}

function validateBuilderState(flowState) {
    const nodes = Array.isArray(flowState?.nodes) ? flowState.nodes : [];
    const hops = Array.isArray(flowState?.hops) ? flowState.hops : [];
    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));

    const errors = [];
    const warnings = [];

    const seenPairs = new Set();
    for (const hop of hops) {
        const sourceId = String(hop.sourceNodeId);
        const targetId = String(hop.targetNodeId);
        const pairKey = `${sourceId}:${targetId}:${hop.mode || 'reverse'}`;

        if (!nodeById.has(sourceId) || !nodeById.has(targetId)) {
            errors.push({
                code: 'missing-node',
                hopId: hop.id,
                message: `Hop ${hop.name || hop.id} references a missing node.`,
            });
            continue;
        }

        if (sourceId === targetId) {
            errors.push({
                code: 'self-link',
                hopId: hop.id,
                message: `Node ${nodeById.get(sourceId).name} cannot connect to itself.`,
            });
        }

        if (seenPairs.has(pairKey)) {
            errors.push({
                code: 'duplicate-hop',
                hopId: hop.id,
                message: `Duplicate hop detected between ${nodeById.get(sourceId).name} and ${nodeById.get(targetId).name}.`,
            });
        } else {
            seenPairs.add(pairKey);
        }

        const sourceNode = nodeById.get(sourceId);
        const targetNode = nodeById.get(targetId);
        const stack = resolveStack(sourceNode.type, targetNode.type);
        if (stack === 'hybrid' && !config.FEATURE_CASCADE_HYBRID) {
            errors.push({
                code: 'hybrid-disabled',
                hopId: hop.id,
                message: `Hybrid cascade is disabled, but hop ${sourceNode.name} -> ${targetNode.name} requires it.`,
            });
        }

        if (hop.tunnelSecurity === 'reality' && hop.tunnelTransport === 'ws') {
            errors.push({
                code: 'invalid-security-transport',
                hopId: hop.id,
                message: `REALITY is not compatible with WebSocket on hop ${sourceNode.name} -> ${targetNode.name}.`,
            });
        }

        if (!sourceNode.capabilities?.sshConfigured || !targetNode.capabilities?.sshConfigured) {
            warnings.push({
                code: 'missing-ssh',
                hopId: hop.id,
                message: `SSH is not configured on one of the nodes for ${sourceNode.name} -> ${targetNode.name}.`,
            });
        }

        if (sourceNode.status !== 'online' || targetNode.status !== 'online') {
            warnings.push({
                code: 'offline-hop-node',
                hopId: hop.id,
                message: `One of the nodes in ${sourceNode.name} -> ${targetNode.name} is not online right now.`,
            });
        }
    }

    const cycles = detectCycles(nodes, hops);
    for (const cycle of cycles) {
        errors.push({
            code: 'cycle',
            message: `Cycle detected in flow: ${cycle.join(' -> ')}`,
        });
    }

    for (const node of nodes) {
        const role = inferRole(node.id, hops);
        const outgoing = hops.filter((hop) => String(hop.sourceNodeId) === String(node.id)).length;
        const incoming = hops.filter((hop) => String(hop.targetNodeId) === String(node.id)).length;

        if (incoming > 1) {
            warnings.push({
                code: 'multiple-upstreams',
                nodeId: node.id,
                message: `${node.name} has multiple upstream hops. This may require explicit routing policy.`,
            });
        }

        if (outgoing > 1) {
            warnings.push({
                code: 'multiple-downstreams',
                nodeId: node.id,
                message: `${node.name} has multiple downstream hops. Treat this as an advanced routing scenario.`,
            });
        }

        node.inferredRole = role;
    }

    let status = 'ok';
    if (errors.length > 0) status = 'error';
    else if (warnings.length > 0) status = 'warning';

    return {
        status,
        errors,
        warnings,
        inferredRoles: Object.fromEntries(nodes.map((node) => [String(node.id), node.inferredRole || 'standalone'])),
        summary: {
            nodes: nodes.length,
            hops: hops.length,
            draftHops: hops.filter((hop) => hop.isDraft).length,
            errors: errors.length,
            warnings: warnings.length,
        },
    };
}

function buildDraftHopSuggestion({ sourceNode, targetNode, mode = 'reverse' }) {
    const stack = resolveStack(sourceNode?.type, targetNode?.type);
    const sourceRole = 'portal';
    const targetRole = 'bridge';

    return {
        mode,
        stack,
        sourceRole,
        targetRole,
        tunnelProtocol: 'vless',
        tunnelTransport: 'tcp',
        tunnelSecurity: 'none',
        tunnelPort: 10086,
        wsPath: '/cascade',
        wsHost: '',
        grpcServiceName: 'cascade',
        xhttpPath: '/cascade',
        xhttpHost: '',
        xhttpMode: 'auto',
        realityDest: 'www.google.com:443',
        realitySni: ['www.google.com'],
        realityFingerprint: 'chrome',
        realityShortId: '',
        requiresHybrid: stack === 'hybrid',
    };
}

module.exports = {
    validateBuilderState,
    buildDraftHopSuggestion,
    inferRole,
    resolveStack,
};
