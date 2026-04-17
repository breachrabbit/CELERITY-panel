const ROLE_LABEL_BY_MODE = {
    standalone: 'standalone',
    portal: 'portal',
    relay: 'relay',
    bridge: 'bridge',
};

function buildNodeCapabilities(nodeData) {
    const nodeType = String(nodeData?.type || '').toLowerCase();
    return {
        supportsXray: nodeType === 'xray',
        supportsHysteria: nodeType === 'hysteria',
        supportsHybrid: nodeType === 'xray' || nodeType === 'hysteria',
        sshConfigured: !!nodeData?.sshConfigured,
    };
}

function normalizeTopologyToBuilderState(topology) {
    const sourceNodes = Array.isArray(topology?.nodes) ? topology.nodes : [];
    const sourceEdges = Array.isArray(topology?.edges) ? topology.edges : [];

    const nodes = sourceNodes
        .filter((entry) => entry?.data?.id && entry.data.id !== 'internet')
        .map((entry) => {
            const data = entry.data || {};
            return {
                id: String(data.id),
                name: data.label || data.ip || data.id,
                ip: data.ip || '',
                domain: data.domain || '',
                flag: data.flag || '',
                country: data.country || '',
                type: data.type || '',
                status: data.status || 'offline',
                rawStatus: data.rawStatus || data.status || 'offline',
                onlineUsers: Number(data.onlineUsers || 0),
                currentRole: ROLE_LABEL_BY_MODE[data.cascadeRole] || 'standalone',
                capabilities: buildNodeCapabilities(data),
                position: entry.position && typeof entry.position.x === 'number' && typeof entry.position.y === 'number'
                    ? { x: entry.position.x, y: entry.position.y }
                    : null,
            };
        });

    const nodeIds = new Set(nodes.map((node) => node.id));

    const hops = sourceEdges
        .filter((entry) => entry?.data?.linkId && !entry.data.isInternetEdge)
        .filter((entry) => nodeIds.has(String(entry.data.source)) && nodeIds.has(String(entry.data.target)))
        .map((entry) => {
            const data = entry.data || {};
            return {
                id: String(data.linkId || data.id),
                edgeId: String(data.id || data.linkId),
                sourceNodeId: String(data.source),
                targetNodeId: String(data.target),
                name: data.label || '',
                mode: data.mode || 'reverse',
                stack: data.cascadeStack || 'unknown',
                tunnelProtocol: data.tunnelProtocol || 'vless',
                tunnelTransport: data.tunnelTransport || 'tcp',
                tunnelSecurity: data.tunnelSecurity || 'none',
                tunnelPort: data.tunnelPort || null,
                wsPath: data.wsPath || '/cascade',
                wsHost: data.wsHost || '',
                grpcServiceName: data.grpcServiceName || 'cascade',
                xhttpPath: data.xhttpPath || '/cascade',
                xhttpHost: data.xhttpHost || '',
                xhttpMode: data.xhttpMode || 'auto',
                realityDest: data.realityDest || 'www.google.com:443',
                realitySni: Array.isArray(data.realitySni)
                    ? data.realitySni.filter(Boolean)
                    : (data.realitySni ? [String(data.realitySni)] : ['www.google.com']),
                realityFingerprint: data.realityFingerprint || 'chrome',
                realityShortId: Array.isArray(data.realityShortIds)
                    ? (data.realityShortIds.find((value) => String(value || '').trim()) || '')
                    : (data.realityShortId || ''),
                geoRoutingEnabled: !!(data.geoRouting?.enabled || data.geoRoutingEnabled),
                geoDomains: Array.isArray(data.geoRouting?.domains)
                    ? data.geoRouting.domains.filter(Boolean)
                    : (Array.isArray(data.geoDomains) ? data.geoDomains.filter(Boolean) : []),
                geoIp: Array.isArray(data.geoRouting?.geoip)
                    ? data.geoRouting.geoip.filter(Boolean)
                    : (Array.isArray(data.geoIp) ? data.geoIp.filter(Boolean) : []),
                muxEnabled: !!data.muxEnabled,
                latencyMs: data.latencyMs ?? null,
                status: data.status || 'pending',
                isDraft: false,
            };
        });

    const summary = {
        nodes: nodes.length,
        hops: hops.length,
        onlineNodes: nodes.filter((node) => node.status === 'online').length,
        xrayNodes: nodes.filter((node) => node.type === 'xray').length,
        hysteriaNodes: nodes.filter((node) => node.type === 'hysteria').length,
        portalNodes: nodes.filter((node) => node.currentRole === 'portal').length,
        relayNodes: nodes.filter((node) => node.currentRole === 'relay').length,
        bridgeNodes: nodes.filter((node) => node.currentRole === 'bridge').length,
    };

    return {
        flowId: 'legacy-topology',
        mode: 'legacy-backed',
        source: 'cascade-topology',
        nodes,
        hops,
        summary,
        validation: {
            status: 'unknown',
            errors: [],
            warnings: [],
        },
    };
}

function sanitizeDraftHop(rawHop, nodeIds) {
    if (!rawHop || typeof rawHop !== 'object') return null;

    const sourceNodeId = String(rawHop.sourceNodeId || '');
    const targetNodeId = String(rawHop.targetNodeId || '');
    if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) return null;

    return {
        id: String(rawHop.id || `draft:${sourceNodeId}:${targetNodeId}`),
        edgeId: String(rawHop.edgeId || rawHop.id || `draft:${sourceNodeId}:${targetNodeId}`),
        sourceNodeId,
        targetNodeId,
        name: String(rawHop.name || `${sourceNodeId} -> ${targetNodeId}`),
        mode: rawHop.mode || 'reverse',
        stack: rawHop.stack || 'unknown',
        tunnelProtocol: rawHop.tunnelProtocol || 'vless',
        tunnelTransport: rawHop.tunnelTransport || 'tcp',
        tunnelSecurity: rawHop.tunnelSecurity || 'none',
        tunnelPort: Number(rawHop.tunnelPort) || 10086,
        wsPath: String(rawHop.wsPath || '/cascade'),
        wsHost: String(rawHop.wsHost || ''),
        grpcServiceName: String(rawHop.grpcServiceName || 'cascade'),
        xhttpPath: String(rawHop.xhttpPath || '/cascade'),
        xhttpHost: String(rawHop.xhttpHost || ''),
        xhttpMode: String(rawHop.xhttpMode || 'auto'),
        realityDest: String(rawHop.realityDest || 'www.google.com:443'),
        realitySni: Array.isArray(rawHop.realitySni)
            ? rawHop.realitySni.map((value) => String(value || '').trim()).filter(Boolean)
            : String(rawHop.realitySni || 'www.google.com')
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean),
        realityFingerprint: String(rawHop.realityFingerprint || 'chrome').trim() || 'chrome',
        realityShortId: String(rawHop.realityShortId || '').trim().slice(0, 16),
        geoRoutingEnabled: !!rawHop.geoRoutingEnabled,
        geoDomains: Array.isArray(rawHop.geoDomains)
            ? rawHop.geoDomains.map((value) => String(value || '').trim()).filter(Boolean)
            : String(rawHop.geoDomains || '')
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean),
        geoIp: Array.isArray(rawHop.geoIp)
            ? rawHop.geoIp.map((value) => String(value || '').trim()).filter(Boolean)
            : String(rawHop.geoIp || '')
                .split(/[\n,]+/)
                .map((value) => value.trim())
                .filter(Boolean),
        muxEnabled: !!rawHop.muxEnabled,
        latencyMs: rawHop.latencyMs ?? null,
        status: rawHop.status || 'draft',
        isDraft: true,
    };
}

function mergeDraftIntoBuilderState(baseState, draftState = {}) {
    const nodeIds = new Set((baseState?.nodes || []).map((node) => String(node.id)));
    const nodePositions = draftState?.nodePositions && typeof draftState.nodePositions === 'object'
        ? draftState.nodePositions
        : {};

    const nodes = (baseState?.nodes || []).map((node) => {
        const draftPosition = nodePositions[String(node.id)];
        if (!draftPosition || typeof draftPosition.x !== 'number' || typeof draftPosition.y !== 'number') {
            return node;
        }
        return {
            ...node,
            position: { x: draftPosition.x, y: draftPosition.y },
        };
    });

    const draftHops = Array.isArray(draftState?.draftHops)
        ? draftState.draftHops.map((hop) => sanitizeDraftHop(hop, nodeIds)).filter(Boolean)
        : [];

    const hops = (baseState?.hops || []).concat(draftHops);

    return {
        ...baseState,
        nodes,
        hops,
        draft: {
            flowId: baseState?.flowId || 'legacy-topology',
            draftHopCount: draftHops.length,
            hasDraftLayout: Object.keys(nodePositions).length > 0,
            lastExecution: draftState?.lastExecution && typeof draftState.lastExecution === 'object'
                ? draftState.lastExecution
                : null,
            updatedAt: draftState?.updatedAt || null,
        },
        summary: {
            ...(baseState?.summary || {}),
            hops: hops.length,
            draftHops: draftHops.length,
        },
    };
}

module.exports = {
    normalizeTopologyToBuilderState,
    mergeDraftIntoBuilderState,
};
