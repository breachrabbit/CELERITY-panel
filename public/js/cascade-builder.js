(function () {
    'use strict';

    function showCanvasFallback(message) {
        const root = document.getElementById('builderCy');
        if (!root) return;
        root.innerHTML = `
            <div class="builder-canvas-fallback">
                <i class="ti ti-alert-circle"></i>
                <strong>${message}</strong>
            </div>
        `;
    }

    if (typeof cytoscape === 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            showCanvasFallback((window._cascadeBuilderI18n || {}).cyUnavailable || 'Builder canvas is unavailable right now.');
        });
        return;
    }
    if (typeof cytoscapeDagre !== 'undefined') cytoscape.use(cytoscapeDagre);
    if (typeof cytoscapeEdgehandles !== 'undefined') cytoscape.use(cytoscapeEdgehandles);

    const i18n = window._cascadeBuilderI18n || {};
    const state = {
        flow: null,
        cy: null,
        edgehandles: null,
    };

    function toast(message, kind = 'info') {
        if (window.showToast) return window.showToast(message, kind);
        console[kind === 'error' ? 'error' : 'log'](message);
    }

    function getStatusLabel(status) {
        if (status === 'ok') return i18n.validateOk || 'OK';
        if (status === 'warning') return i18n.validateWarning || 'Warning';
        if (status === 'error') return i18n.validateError || 'Error';
        return status || '—';
    }

    async function requestJson(url, options) {
        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `${response.status}`);
        }
        return data;
    }

    function getBuilderStyle() {
        return [
            {
                selector: 'node',
                style: {
                    'shape': 'round-rectangle',
                    'width': 156,
                    'height': 58,
                    'background-color': '#ffffff',
                    'border-width': 1.5,
                    'border-style': 'dashed',
                    'border-color': '#d7deec',
                    'label': 'data(label)',
                    'text-wrap': 'wrap',
                    'text-max-width': '136px',
                    'font-size': 11,
                    'font-family': 'Lilex, Inter, sans-serif',
                    'font-weight': 600,
                    'color': '#050A3C',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'padding': '12px',
                    'overlay-opacity': 0,
                },
            },
            {
                selector: 'node[nodeType = "xray"]',
                style: {
                    'background-color': '#eefbfd',
                    'border-color': '#08C5CB',
                },
            },
            {
                selector: 'node[nodeType = "hysteria"]',
                style: {
                    'background-color': '#f4f6fb',
                    'border-color': '#182463',
                },
            },
            {
                selector: 'node[status = "online"]',
                style: {
                    'border-width': 2,
                    'shadow-blur': 14,
                    'shadow-color': '#08C5CB',
                    'shadow-opacity': 0.18,
                },
            },
            {
                selector: 'node:selected',
                style: {
                    'border-color': '#08C5CB',
                    'border-width': 2,
                    'shadow-blur': 20,
                    'shadow-color': '#08C5CB',
                    'shadow-opacity': 0.22,
                },
            },
            {
                selector: 'edge',
                style: {
                    'curve-style': 'bezier',
                    'width': 3,
                    'line-color': '#182463',
                    'target-arrow-color': '#182463',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 0.9,
                    'line-style': 'solid',
                    'overlay-opacity': 0,
                    'label': 'data(label)',
                    'font-size': 9,
                    'font-family': 'Lilex, Inter, sans-serif',
                    'text-background-color': '#ffffff',
                    'text-background-opacity': 0.9,
                    'text-background-padding': '3px',
                    'text-background-shape': 'round-rectangle',
                    'text-rotation': 'autorotate',
                    'color': '#64748b',
                },
            },
            {
                selector: 'edge[status = "online"]',
                style: {
                    'line-color': '#08C5CB',
                    'target-arrow-color': '#08C5CB',
                },
            },
            {
                selector: 'edge[isDraft = 1]',
                style: {
                    'line-style': 'dashed',
                    'line-color': '#08C5CB',
                    'target-arrow-color': '#08C5CB',
                    'width': 3,
                },
            },
            {
                selector: 'edge[selected], edge:selected',
                style: {
                    'width': 4,
                    'line-color': '#02A8AD',
                    'target-arrow-color': '#02A8AD',
                },
            },
            {
                selector: '.eh-handle',
                style: {
                    'background-color': '#08C5CB',
                    'width': 10,
                    'height': 10,
                    'shape': 'ellipse',
                    'overlay-opacity': 0,
                },
            },
            {
                selector: '.eh-preview, .eh-ghost-edge',
                style: {
                    'line-color': '#08C5CB',
                    'target-arrow-color': '#08C5CB',
                    'line-style': 'dashed',
                    'width': 3,
                },
            },
        ];
    }

    function buildNodeLabel(node) {
        const prefix = node.flag ? `${node.flag} ` : '';
        return `${prefix}${node.name}`;
    }

    function flowToElements(flow) {
        const elements = [];
        for (const node of flow.nodes) {
            elements.push({
                group: 'nodes',
                data: {
                    id: node.id,
                    label: buildNodeLabel(node),
                    nodeType: node.type,
                    status: node.status,
                },
                position: node.position || undefined,
            });
        }

        for (const hop of flow.hops) {
            elements.push({
                group: 'edges',
                data: {
                    id: hop.edgeId || hop.id,
                    hopId: hop.id,
                    source: hop.sourceNodeId,
                    target: hop.targetNodeId,
                    label: hop.isDraft ? (i18n.draftTag || 'Draft') : `${hop.mode.toUpperCase()} · ${hop.stack.toUpperCase()}`,
                    status: hop.status,
                    isDraft: hop.isDraft ? 1 : 0,
                },
            });
        }

        return elements;
    }

    function renderLibrary(flow) {
        const root = document.getElementById('builderNodeLibrary');
        if (!root) return;
        root.innerHTML = '';

        flow.nodes.forEach((node) => {
            const inferredRole = flow.validation?.inferredRoles?.[String(node.id)] || node.currentRole || 'standalone';
            const el = document.createElement('div');
            el.className = 'builder-node-chip';
            el.innerHTML = `
                <div class="builder-node-chip-main">
                    <strong>${node.flag ? `${node.flag} ` : ''}${node.name}</strong>
                    <span>${node.ip || node.country || node.type || '—'}</span>
                </div>
                <div class="builder-node-chip-meta">${inferredRole}</div>
            `;
            el.addEventListener('click', () => {
                if (state.cy) {
                    state.cy.elements().unselect();
                    const nodeEle = state.cy.getElementById(node.id);
                    if (nodeEle.length) {
                        nodeEle.select();
                        state.cy.center(nodeEle);
                    }
                    renderNodeInspector(node);
                }
            });
            root.appendChild(el);
        });
    }

    function renderSummary(flow, validation) {
        document.getElementById('summaryNodes').textContent = String(flow.summary.nodes || 0);
        document.getElementById('summaryHops').textContent = String(flow.hops.length || 0);
        document.getElementById('summaryStatus').textContent = getStatusLabel(validation.status);
        document.getElementById('summaryWarnings').textContent = String(validation.warnings.length || 0);
        document.getElementById('builderValidationBadge').textContent = getStatusLabel(validation.status);
        const sourceMeta = document.getElementById('builderSourceMeta');
        if (sourceMeta) {
            const mode = flow.sourceOfTruth?.mode || 'legacy-backed';
            const drafts = flow.draft?.draftHopCount || 0;
            sourceMeta.textContent = `${mode} · ${drafts} ${i18n.draftTag || 'draft'}`;
        }
    }

    function renderValidation(validation) {
        const box = document.getElementById('builderValidationList');
        if (!box) return;
        const items = [];

        (validation.errors || []).forEach((item) => items.push({ kind: 'error', text: item.message }));
        (validation.warnings || []).forEach((item) => items.push({ kind: 'warning', text: item.message }));

        box.innerHTML = '';
        if (!items.length) {
            box.innerHTML = `<p class="builder-validation-empty">${i18n.noIssues || 'No issues detected yet.'}</p>`;
            return;
        }

        items.forEach((item) => {
            const el = document.createElement('div');
            el.className = `builder-validation-item ${item.kind}`;
            el.textContent = item.text;
            box.appendChild(el);
        });
    }

    function renderNodeInspector(node) {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-data-list">
                    <div class="builder-data-row"><span>${i18n.nodeType}</span><strong>${node.type || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.status}</span><strong>${node.status || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.role}</span><strong>${node.inferredRole || node.currentRole || 'standalone'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.country}</span><strong>${node.country || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.onlineUsers}</span><strong>${node.onlineUsers ?? 0}</strong></div>
                    <div class="builder-data-row"><span>${i18n.ssh}</span><strong>${node.capabilities?.sshConfigured ? (i18n.configured || 'configured') : (i18n.missing || 'missing')}</strong></div>
                </div>
            </div>
        `;
    }

    function renderHopInspector(hop) {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        const sourceNode = state.flow.nodes.find((item) => String(item.id) === String(hop.sourceNodeId));
        const targetNode = state.flow.nodes.find((item) => String(item.id) === String(hop.targetNodeId));
        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-data-list">
                    <div class="builder-data-row"><span>${i18n.source}</span><strong>${sourceNode?.name || hop.sourceNodeId}</strong></div>
                    <div class="builder-data-row"><span>${i18n.target}</span><strong>${targetNode?.name || hop.targetNodeId}</strong></div>
                    <div class="builder-data-row"><span>${i18n.mode}</span><strong>${hop.mode}</strong></div>
                    <div class="builder-data-row"><span>${i18n.stack}</span><strong>${hop.stack}</strong></div>
                    <div class="builder-data-row"><span>${i18n.protocol}</span><strong>${hop.tunnelProtocol}</strong></div>
                    <div class="builder-data-row"><span>${i18n.transport}</span><strong>${hop.tunnelTransport}</strong></div>
                    <div class="builder-data-row"><span>${i18n.security}</span><strong>${hop.tunnelSecurity}</strong></div>
                    <div class="builder-data-row"><span>${i18n.status}</span><strong>${hop.status}</strong></div>
                </div>
            </div>
        `;
    }

    function renderConnectInspector(payload) {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        const suggestion = payload.suggestion || {};
        const validation = payload.validation || {};
        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-data-list">
                    <div class="builder-data-row"><span>${i18n.mode}</span><strong>${suggestion.mode || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.stack}</span><strong>${suggestion.stack || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.protocol}</span><strong>${suggestion.tunnelProtocol || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.transport}</span><strong>${suggestion.tunnelTransport || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.security}</span><strong>${suggestion.tunnelSecurity || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.role}</span><strong>${suggestion.sourceRole || '—'} -> ${suggestion.targetRole || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.requiresHybrid}</span><strong>${suggestion.requiresHybrid ? 'yes' : 'no'}</strong></div>
                </div>
            </div>
        `;
        renderValidation(validation);
    }

    function initCy(flow) {
        state.cy = cytoscape({
            container: document.getElementById('builderCy'),
            style: getBuilderStyle(),
            elements: flowToElements(flow),
            layout: { name: 'preset' },
            minZoom: 0.2,
            maxZoom: 4,
            wheelSensitivity: 0.25,
        });

        const hasPositions = flow.nodes.some((node) => node.position && typeof node.position.x === 'number');
        if (!hasPositions) {
            state.cy.layout({
                name: 'dagre',
                rankDir: 'LR',
                nodeSep: 48,
                rankSep: 96,
                animate: true,
                animationDuration: 320,
            }).run();
        } else {
            state.cy.fit(undefined, 48);
        }

        state.cy.on('select', 'node', (event) => {
            const nodeId = event.target.id();
            const node = state.flow.nodes.find((item) => String(item.id) === String(nodeId));
            if (node) renderNodeInspector(node);
        });

        state.cy.on('select', 'edge', (event) => {
            const hopId = event.target.data('hopId');
            const hop = state.flow.hops.find((item) => String(item.id) === String(hopId));
            if (hop) renderHopInspector(hop);
        });

        state.cy.on('tap', (event) => {
            if (event.target === state.cy) {
                const root = document.getElementById('builderInspectorBody');
                if (root) {
                    root.innerHTML = `<div class="builder-empty-state"><i class="ti ti-pointer"></i><p>${i18n.loading || 'Select a node or hop.'}</p></div>`;
                }
            }
        });

        if (typeof state.cy.edgehandles === 'function') {
            state.edgehandles = state.cy.edgehandles({
                handleNodes: 'node',
                preview: true,
                hoverDelay: 80,
                noEdgeEventsInDraw: true,
                disableBrowserGestures: true,
                complete: async (sourceNode, targetNode, addedEles) => {
                    if (addedEles && addedEles.remove) addedEles.remove();
                    await handleDraftConnect(sourceNode.id(), targetNode.id());
                },
            });
        }
    }

    async function handleDraftConnect(sourceNodeId, targetNodeId) {
        try {
            const payload = await requestJson('/api/cascade-builder/connect', {
                method: 'POST',
                body: JSON.stringify({ sourceNodeId, targetNodeId }),
            });

            renderConnectInspector(payload);
            if (!payload.accepted) {
                toast(i18n.rejectedDraft || 'Draft connection is invalid.', 'error');
                return;
            }

            const draftHop = payload.draftHop;
            state.flow.hops.push(draftHop);
            state.flow.validation = payload.validation;
            state.flow.draft = {
                ...(state.flow.draft || {}),
                draftHopCount: (state.flow.draft?.draftHopCount || 0) + 1,
            };
            state.cy.add({
                group: 'edges',
                data: {
                    id: draftHop.edgeId,
                    hopId: draftHop.id,
                    source: draftHop.sourceNodeId,
                    target: draftHop.targetNodeId,
                    label: i18n.draftTag || 'Draft',
                    status: 'draft',
                    isDraft: 1,
                },
            });
            renderSummary(state.flow, state.flow.validation);
            renderValidation(state.flow.validation);
            toast(i18n.acceptedDraft || 'Draft hop added.');
        } catch (error) {
            toast(`${i18n.connectFailed || 'Connect failed'}: ${error.message}`, 'error');
        }
    }

    function collectCurrentStateForValidation() {
        return {
            nodes: state.flow.nodes.map((node) => ({
                ...node,
                position: state.cy ? state.cy.getElementById(node.id).position() : node.position,
            })),
            hops: state.flow.hops,
        };
    }

    async function validateCurrentDraft() {
        try {
            const payload = collectCurrentStateForValidation();
            const result = await requestJson('/api/cascade-builder/validate', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            state.flow.validation = result.validation;
            renderSummary(state.flow, result.validation);
            renderValidation(result.validation);
        } catch (error) {
            toast(`${i18n.validationFailed || 'Validation failed'}: ${error.message}`, 'error');
        }
    }

    async function saveLayout() {
        try {
            const positions = state.cy.nodes().toArray().map((node) => ({
                id: node.id(),
                x: node.position('x'),
                y: node.position('y'),
            }));
            await requestJson('/api/cascade-builder/layout', {
                method: 'POST',
                body: JSON.stringify({ positions }),
            });
            toast(i18n.layoutSaved || 'Layout saved.');
        } catch (error) {
            toast(`${i18n.layoutSaveFailed || 'Layout save failed'}: ${error.message}`, 'error');
        }
    }

    function resetDrafts() {
        requestJson('/api/cascade-builder/drafts', {
            method: 'DELETE',
        })
            .then((result) => {
                state.flow.hops = state.flow.hops.filter((hop) => !hop.isDraft);
                state.flow.validation = result.validation || state.flow.validation;
                state.flow.draft = result.draft || { draftHopCount: 0 };
                state.cy.edges().filter((edge) => edge.data('isDraft') === 1).remove();
                renderSummary(state.flow, state.flow.validation);
                renderValidation(state.flow.validation);
                toast(i18n.draftsReset || 'Drafts cleared.');
            })
            .catch((error) => {
                toast(`${i18n.resetDraftsFailed || 'Draft reset failed'}: ${error.message}`, 'error');
            });
    }

    async function loadState() {
        try {
            const flow = await requestJson('/api/cascade-builder/state');
            state.flow = flow;
            renderLibrary(flow);
            renderSummary(flow, flow.validation);
            renderValidation(flow.validation);
            initCy(flow);
        } catch (error) {
            toast(`${i18n.stateFailed || 'State load failed'}: ${error.message}`, 'error');
        }
    }

    function bindUi() {
        document.getElementById('builderValidate')?.addEventListener('click', validateCurrentDraft);
        document.getElementById('builderSaveLayout')?.addEventListener('click', saveLayout);
        document.getElementById('builderResetDrafts')?.addEventListener('click', resetDrafts);
        document.getElementById('builderFitView')?.addEventListener('click', () => state.cy && state.cy.fit(undefined, 48));
        document.getElementById('builderAutoLayout')?.addEventListener('click', () => {
            if (!state.cy) return;
            state.cy.layout({
                name: 'dagre',
                rankDir: 'LR',
                nodeSep: 48,
                rankSep: 96,
                animate: true,
                animationDuration: 320,
            }).run();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindUi();
        loadState();
    });
})();
