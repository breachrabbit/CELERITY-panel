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

function buildUndirectedComponents(nodes, hops) {
    const nodeIds = nodes.map((node) => String(node.id));
    const adjacency = new Map(nodeIds.map((id) => [id, new Set()]));

    for (const hop of hops) {
        const sourceId = String(hop.sourceNodeId);
        const targetId = String(hop.targetNodeId);
        if (!adjacency.has(sourceId)) adjacency.set(sourceId, new Set());
        if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());
        adjacency.get(sourceId).add(targetId);
        adjacency.get(targetId).add(sourceId);
    }

    const visited = new Set();
    const components = [];

    for (const nodeId of nodeIds) {
        if (visited.has(nodeId)) continue;
        const queue = [nodeId];
        const componentNodeIds = [];
        visited.add(nodeId);

        while (queue.length) {
            const current = queue.shift();
            componentNodeIds.push(current);
            for (const next of adjacency.get(current) || []) {
                if (visited.has(next)) continue;
                visited.add(next);
                queue.push(next);
            }
        }

        components.push(componentNodeIds);
    }

    return components;
}

function validateBuilderState(flowState) {
    const nodes = Array.isArray(flowState?.nodes) ? flowState.nodes : [];
    const hops = Array.isArray(flowState?.hops) ? flowState.hops : [];
    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    const incomingByNodeId = new Map(nodes.map((node) => [String(node.id), 0]));
    const outgoingByNodeId = new Map(nodes.map((node) => [String(node.id), 0]));

    const errors = [];
    const warnings = [];

    const seenPairs = new Set();
    const seenBidirectionalPairs = new Set();
    for (const hop of hops) {
        const sourceId = String(hop.sourceNodeId);
        const targetId = String(hop.targetNodeId);
        const mode = String(hop.mode || 'reverse');
        const pairKey = `${sourceId}:${targetId}:${mode}`;

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

        const reversePairKey = `${targetId}:${sourceId}:${mode}`;
        if (seenPairs.has(reversePairKey)) {
            const canonicalPair = [sourceId, targetId].sort().join(':');
            const bidirectionalKey = `${mode}:${canonicalPair}`;
            if (!seenBidirectionalPairs.has(bidirectionalKey)) {
                seenBidirectionalPairs.add(bidirectionalKey);
                errors.push({
                    code: 'bidirectional-hop',
                    hopId: hop.id,
                    message: `Bidirectional hop detected between ${nodeById.get(sourceId).name} and ${nodeById.get(targetId).name}. Choose one direction only for this chain.`,
                });
            }
        }

        const sourceNode = nodeById.get(sourceId);
        const targetNode = nodeById.get(targetId);

        outgoingByNodeId.set(sourceId, Number(outgoingByNodeId.get(sourceId) || 0) + 1);
        incomingByNodeId.set(targetId, Number(incomingByNodeId.get(targetId) || 0) + 1);

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

    const components = buildUndirectedComponents(nodes, hops);
    for (const componentNodeIds of components) {
        const componentNodeSet = new Set(componentNodeIds);
        const componentHops = hops.filter((hop) => (
            componentNodeSet.has(String(hop.sourceNodeId))
            && componentNodeSet.has(String(hop.targetNodeId))
        ));
        if (!componentHops.length) continue;

        const modeSet = new Set(componentHops.map((hop) => String(hop.mode || 'reverse')));
        if (modeSet.size > 1) {
            const componentNodeNames = componentNodeIds
                .map((id) => nodeById.get(id)?.name || id)
                .slice(0, 5)
                .join(' -> ');
            errors.push({
                code: 'mixed-mode-component',
                message: `Mixed reverse/forward modes detected in one chain segment (${componentNodeNames}). Split it into separate chains.`,
            });
        }

        const connectedNodeIds = componentNodeIds.filter((nodeId) => (
            Number(outgoingByNodeId.get(nodeId) || 0) > 0
            || Number(incomingByNodeId.get(nodeId) || 0) > 0
        ));
        const exitNodeIds = connectedNodeIds.filter((nodeId) => Number(outgoingByNodeId.get(nodeId) || 0) === 0);
        const exitNodeNames = exitNodeIds.map((id) => nodeById.get(id)?.name || id);

        if (connectedNodeIds.length > 0 && exitNodeIds.length === 0) {
            errors.push({
                code: 'no-internet-egress',
                message: 'Chain has no Internet egress node. At least one terminal node without downstream hops is required.',
            });
        } else if (exitNodeIds.length > 1) {
            warnings.push({
                code: 'multiple-internet-egress',
                message: `Chain has multiple Internet exits (${exitNodeNames.join(', ')}). Traffic can leave from different nodes.`,
            });
        }
    }

    for (const node of nodes) {
        const role = inferRole(node.id, hops);
        const nodeId = String(node.id);
        const outgoing = Number(outgoingByNodeId.get(nodeId) || 0);
        const incoming = Number(incomingByNodeId.get(nodeId) || 0);

        if (incoming > 1) {
            errors.push({
                code: 'multiple-upstreams-not-supported',
                nodeId: node.id,
                message: `${node.name} has multiple upstream hops. Current builder supports one upstream per node.`,
            });
        }

        if (outgoing > 1) {
            errors.push({
                code: 'multiple-downstreams-not-supported',
                nodeId: node.id,
                message: `${node.name} has multiple downstream hops. Current builder supports one downstream per node.`,
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
            internetExitNodes: nodes.filter((node) => Number(outgoingByNodeId.get(String(node.id)) || 0) === 0 && (
                Number(incomingByNodeId.get(String(node.id)) || 0) > 0
                || Number(outgoingByNodeId.get(String(node.id)) || 0) > 0
            )).length,
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
        geoRoutingEnabled: false,
        geoDomains: [],
        geoIp: [],
        requiresHybrid: stack === 'hybrid',
    };
}

module.exports = {
    validateBuilderState,
    buildDraftHopSuggestion,
    inferRole,
    resolveStack,
};
