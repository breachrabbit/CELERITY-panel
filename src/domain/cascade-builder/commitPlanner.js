const config = require('../../../config');
const { inferRole, resolveStack } = require('./flowValidator');

function toId(value) {
    return String(value || '');
}

function getPortScopeKey(hop) {
    const mode = hop.mode || 'reverse';
    const sideNodeId = mode === 'forward' ? hop.targetNodeId : hop.sourceNodeId;
    return `${mode}:${toId(sideNodeId)}:${Number(hop.tunnelPort) || 10086}`;
}

function buildComponentMap(nodes, hops) {
    const adjacency = new Map(nodes.map((node) => [toId(node.id), new Set()]));

    for (const hop of hops) {
        const sourceId = toId(hop.sourceNodeId);
        const targetId = toId(hop.targetNodeId);
        if (!adjacency.has(sourceId)) adjacency.set(sourceId, new Set());
        if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());
        adjacency.get(sourceId).add(targetId);
        adjacency.get(targetId).add(sourceId);
    }

    const componentByNodeId = new Map();
    const components = [];
    let componentIndex = 0;

    for (const node of nodes) {
        const nodeId = toId(node.id);
        if (componentByNodeId.has(nodeId)) continue;

        componentIndex += 1;
        const componentId = `chain:${componentIndex}`;
        const queue = [nodeId];
        const seen = new Set([nodeId]);
        const nodeIds = [];

        while (queue.length) {
            const currentId = queue.shift();
            nodeIds.push(currentId);
            componentByNodeId.set(currentId, componentId);

            for (const nextId of adjacency.get(currentId) || []) {
                if (seen.has(nextId)) continue;
                seen.add(nextId);
                queue.push(nextId);
            }
        }

        components.push({
            id: componentId,
            nodeIds,
            hopIds: [],
        });
    }

    for (const hop of hops) {
        const componentId = componentByNodeId.get(toId(hop.sourceNodeId)) || componentByNodeId.get(toId(hop.targetNodeId));
        const component = components.find((item) => item.id === componentId);
        if (component) component.hopIds.push(toId(hop.id));
    }

    return { components, componentByNodeId };
}

function describeNodeAction(node, role, chainMode, relatedHops) {
    const portCount = relatedHops.length;
    if (chainMode === 'forward') {
        if (role === 'portal') {
            return `${node.name}: deploy portal outbound config`;
        }
        if (role === 'relay' || role === 'bridge') {
            return `${node.name}: deploy forward-hop inbound config and open ${portCount} port${portCount === 1 ? '' : 's'}`;
        }
        return `${node.name}: no runtime change`;
    }

    if (role === 'portal') {
        return `${node.name}: deploy portal config and open ${portCount} port${portCount === 1 ? '' : 's'}`;
    }
    if (role === 'relay') {
        return `${node.name}: deploy relay config and open ${portCount} downstream port${portCount === 1 ? '' : 's'}`;
    }
    if (role === 'bridge') {
        return `${node.name}: deploy bridge runtime / sidecar`;
    }
    return `${node.name}: no runtime change`;
}

function buildPreviewPayload(hop, sourceNode, targetNode) {
    return {
        name: hop.name || `${sourceNode.name} -> ${targetNode.name}`,
        mode: hop.mode || 'reverse',
        portalNodeId: toId(sourceNode.id),
        bridgeNodeId: toId(targetNode.id),
        portalNodeName: sourceNode.name,
        bridgeNodeName: targetNode.name,
        stack: resolveStack(sourceNode.type, targetNode.type),
        tunnelProtocol: hop.tunnelProtocol || 'vless',
        tunnelTransport: hop.tunnelTransport || 'tcp',
        tunnelSecurity: hop.tunnelSecurity || 'none',
        tunnelPort: Number(hop.tunnelPort) || 10086,
        wsPath: hop.wsPath || '/cascade',
        wsHost: hop.wsHost || '',
        grpcServiceName: hop.grpcServiceName || 'cascade',
        xhttpPath: hop.xhttpPath || '/cascade',
        xhttpHost: hop.xhttpHost || '',
        xhttpMode: hop.xhttpMode || 'auto',
        realityDest: hop.realityDest || 'www.google.com:443',
        realitySni: Array.isArray(hop.realitySni) ? hop.realitySni : ['www.google.com'],
        realityFingerprint: hop.realityFingerprint || 'chrome',
        realityShortId: hop.realityShortId || '',
        muxEnabled: !!hop.muxEnabled,
        priority: 100,
        status: 'pending',
        autoDeploy: false,
    };
}

function buildCommitPlan({ nodes = [], hops = [], activeLinks = [] }) {
    const nodeById = new Map(nodes.map((node) => [toId(node.id), node]));
    const draftHops = hops.filter((hop) => hop.isDraft);
    const liveHops = hops.filter((hop) => !hop.isDraft);
    const validationWarnings = [];

    const activePortUsage = new Map();
    for (const link of activeLinks) {
        const mode = link.mode || 'reverse';
        const sideNodeId = mode === 'forward'
            ? toId(link.bridgeNode?._id || link.bridgeNode)
            : toId(link.portalNode?._id || link.portalNode);
        const key = `${mode}:${sideNodeId}:${Number(link.tunnelPort) || 10086}`;
        activePortUsage.set(key, link);
    }

    const batchPortUsage = new Map();
    for (const hop of draftHops) {
        const key = getPortScopeKey(hop);
        if (!batchPortUsage.has(key)) batchPortUsage.set(key, []);
        batchPortUsage.get(key).push(hop);
    }

    const { components, componentByNodeId } = buildComponentMap(nodes, hops);
    const componentMap = new Map();

    for (const component of components) {
        const componentNodes = component.nodeIds.map((id) => nodeById.get(id)).filter(Boolean);
        const componentHops = hops.filter((hop) => component.id === componentByNodeId.get(toId(hop.sourceNodeId)));
        const roles = Object.fromEntries(componentNodes.map((node) => [toId(node.id), inferRole(node.id, componentHops)]));
        const modeSet = new Set(componentHops.map((hop) => hop.mode || 'reverse'));
        const chainMode = modeSet.size === 1 ? [...modeSet][0] : 'mixed';

        const nodeActions = componentNodes.map((node) => {
            const nodeId = toId(node.id);
            const relatedHops = componentHops.filter((hop) => {
                return toId(hop.sourceNodeId) === nodeId || toId(hop.targetNodeId) === nodeId;
            });
            return {
                nodeId,
                nodeName: node.name,
                currentRole: node.currentRole || 'standalone',
                previewRole: roles[nodeId] || 'standalone',
                role: roles[nodeId] || 'standalone',
                status: node.status || 'offline',
                sshConfigured: !!node.capabilities?.sshConfigured,
                action: describeNodeAction(node, roles[nodeId] || 'standalone', chainMode, relatedHops),
            };
        });

        const draftHopCount = componentHops.filter((hop) => hop.isDraft).length;
        const liveHopCount = componentHops.length - draftHopCount;
        const deployWarnings = [];

        if (chainMode === 'mixed') {
            deployWarnings.push('This connected chain mixes reverse and forward hops. Legacy deployChain cannot apply mixed modes together.');
        }
        if (nodeActions.some((entry) => entry.status !== 'online')) {
            deployWarnings.push('One or more affected nodes are not online right now.');
        }
        if (nodeActions.some((entry) => !entry.sshConfigured)) {
            deployWarnings.push('One or more affected nodes have no SSH credentials configured.');
        }

        componentMap.set(component.id, {
            id: component.id,
            chainMode,
            roles,
            nodeActions,
            nodeIds: component.nodeIds,
            hopIds: component.hopIds,
            draftHopCount,
            liveHopCount,
            deployWarnings,
        });
    }

    const previewHops = draftHops.map((hop) => {
        const sourceNode = nodeById.get(toId(hop.sourceNodeId));
        const targetNode = nodeById.get(toId(hop.targetNodeId));
        const componentId = componentByNodeId.get(toId(hop.sourceNodeId)) || null;
        const component = componentId ? componentMap.get(componentId) : null;
        const errors = [];
        const warnings = [];
        const assumptions = [];

        if (!sourceNode || !targetNode) {
            errors.push('Draft references a node that no longer exists.');
        }

        const stack = resolveStack(sourceNode?.type, targetNode?.type);
        if (stack === 'hybrid' && !config.FEATURE_CASCADE_HYBRID) {
            errors.push('Hybrid cascade is disabled for this panel instance.');
        }

        if ((hop.tunnelSecurity || 'none') === 'reality' && (hop.tunnelTransport || 'tcp') === 'ws') {
            errors.push('REALITY is not compatible with WebSocket.');
        }

        const portScopeKey = getPortScopeKey(hop);
        const conflictingLink = activePortUsage.get(portScopeKey);
        if (conflictingLink) {
            errors.push(`Port ${Number(hop.tunnelPort) || 10086} is already used by legacy link "${conflictingLink.name}".`);
        }

        const batchConflicts = batchPortUsage.get(portScopeKey) || [];
        if (batchConflicts.length > 1) {
            errors.push(`Port ${Number(hop.tunnelPort) || 10086} is reused by multiple draft hops in the same batch.`);
        }

        if (sourceNode && targetNode && (!sourceNode.capabilities?.sshConfigured || !targetNode.capabilities?.sshConfigured)) {
            warnings.push('One of the affected nodes has no SSH credentials configured.');
        }
        if (sourceNode && targetNode && (sourceNode.status !== 'online' || targetNode.status !== 'online')) {
            warnings.push('One of the affected nodes is offline.');
        }

        if (component?.chainMode === 'mixed') {
            errors.push('This draft belongs to a mixed-mode chain. Split reverse and forward hops before commit/deploy.');
        }

        if (!hop.name) assumptions.push('Link name will be generated from source and target nodes.');
        assumptions.push('Commit bridge still uses legacy CascadeLink defaults such as priority 100 and pending status.');
        if ((hop.tunnelSecurity || 'none') !== 'reality') {
            assumptions.push('No REALITY-specific key material is required for this draft in its current form.');
        } else {
            assumptions.push('REALITY key pair/shortId will be generated automatically on commit if missing in draft settings.');
        }
        const advancedFieldsTouched = (hop.wsPath && hop.wsPath !== '/cascade')
            || (hop.wsHost && hop.wsHost !== '')
            || (hop.grpcServiceName && hop.grpcServiceName !== 'cascade')
            || (hop.xhttpPath && hop.xhttpPath !== '/cascade')
            || (hop.xhttpHost && hop.xhttpHost !== '')
            || (hop.xhttpMode && hop.xhttpMode !== 'auto')
            || (hop.realityDest && hop.realityDest !== 'www.google.com:443')
            || ((Array.isArray(hop.realitySni) && hop.realitySni.length > 0 && !(hop.realitySni.length === 1 && hop.realitySni[0] === 'www.google.com')))
            || (hop.realityFingerprint && hop.realityFingerprint !== 'chrome')
            || !!(hop.realityShortId && String(hop.realityShortId).trim());
        if (!advancedFieldsTouched) {
            assumptions.push('Transport-specific advanced fields (WS/gRPC/XHTTP paths) stay on their current defaults.');
        }

        warnings.push(...(component?.deployWarnings || []).filter((item) => !warnings.includes(item)));

        const canCommit = errors.length === 0;
        const canDeploy = canCommit && warnings.length === 0;
        const previewPayload = sourceNode && targetNode ? buildPreviewPayload(hop, sourceNode, targetNode) : null;

        return {
            hopId: toId(hop.id),
            edgeId: toId(hop.edgeId),
            name: hop.name,
            sourceNodeId: toId(hop.sourceNodeId),
            sourceNodeName: sourceNode?.name || toId(hop.sourceNodeId),
            targetNodeId: toId(hop.targetNodeId),
            targetNodeName: targetNode?.name || toId(hop.targetNodeId),
            stack,
            mode: hop.mode || 'reverse',
            tunnelPort: Number(hop.tunnelPort) || 10086,
            tunnelProtocol: hop.tunnelProtocol || 'vless',
            tunnelTransport: hop.tunnelTransport || 'tcp',
            tunnelSecurity: hop.tunnelSecurity || 'none',
            muxEnabled: !!hop.muxEnabled,
            requiresHybrid: stack === 'hybrid',
            currentSourceRole: sourceNode?.currentRole || 'standalone',
            currentTargetRole: targetNode?.currentRole || 'standalone',
            previewSourceRole: component?.roles?.[toId(hop.sourceNodeId)] || inferRole(hop.sourceNodeId, hops),
            previewTargetRole: component?.roles?.[toId(hop.targetNodeId)] || inferRole(hop.targetNodeId, hops),
            canCommit,
            canDeploy,
            errors,
            warnings,
            assumptions,
            componentId,
            affectedNodeIds: component?.nodeIds || [toId(hop.sourceNodeId), toId(hop.targetNodeId)],
            createLinkPayload: previewPayload,
        };
    });

    const chainPreviews = [...componentMap.values()]
        .filter((component) => component.draftHopCount > 0)
        .map((component) => ({
            id: component.id,
            chainMode: component.chainMode,
            nodeIds: component.nodeIds,
            nodeCount: component.nodeIds.length,
            liveHopCount: component.liveHopCount,
            draftHopCount: component.draftHopCount,
            deployWarnings: component.deployWarnings,
            nodeActions: component.nodeActions,
        }));

    const summary = {
        draftHops: draftHops.length,
        liveHops: liveHops.length,
        creatableHops: previewHops.filter((hop) => hop.canCommit).length,
        blockedHops: previewHops.filter((hop) => !hop.canCommit).length,
        deployableHops: previewHops.filter((hop) => hop.canDeploy).length,
        chainsTouched: chainPreviews.length,
        nodesTouched: new Set(chainPreviews.flatMap((component) => component.nodeActions.map((item) => item.nodeId))).size,
    };

    return {
        summary,
        hops: previewHops,
        chains: chainPreviews,
        warnings: validationWarnings,
    };
}

module.exports = {
    buildCommitPlan,
};
