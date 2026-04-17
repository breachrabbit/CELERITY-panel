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
        execution: null,
        executionReruns: {},
        executionFilter: 'all',
        selection: { type: null, id: null },
    };
    const HOP_MODE_OPTIONS = ['reverse', 'forward'];
    const HOP_PROTOCOL_OPTIONS = ['vless', 'vmess'];
    const HOP_TRANSPORT_OPTIONS = ['tcp', 'ws', 'grpc', 'xhttp', 'splithttp'];
    const HOP_SECURITY_OPTIONS = ['none', 'tls', 'reality'];
    const REALITY_FINGERPRINT_OPTIONS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'randomized'];

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(message, kind = 'info') {
        if (window.showToast) return window.showToast(message, kind);
        console[kind === 'error' ? 'error' : 'log'](message);
    }

    function t(key, fallback) {
        return i18n[key] || fallback;
    }

    function formatRole(role) {
        const value = String(role || 'standalone').toLowerCase();
        return t(`role_${value}`, value);
    }

    function formatMode(mode) {
        const value = String(mode || 'reverse').toLowerCase();
        return t(`mode_${value}`, value);
    }

    function formatBoolean(value) {
        return value ? t('yes', 'Yes') : t('no', 'No');
    }

    function getExecutionSuggestedActionLabel(action) {
        const normalized = String(action || '').trim().toLowerCase();
        if (normalized === 'rerun-chain') return t('executionSuggestedActionRerunChain', 'Retry chain');
        if (normalized === 'repair-rerun-chain') return t('executionSuggestedActionRepairRerunChain', 'Repair + rerun');
        if (normalized === 'repair-hop-nodes') return t('executionSuggestedActionRepairHopNodes', 'Repair hop nodes + rerun');
        if (normalized === 'open-hop-nodes') return t('executionSuggestedActionOpenHopNodes', 'Open hop nodes');
        if (normalized === 'focus-hop') return t('executionSuggestedActionFocusHop', 'Focus hop');
        if (normalized === 'focus-node') return t('executionSuggestedActionFocusNode', 'Focus node');
        if (normalized === 'repair-node') return t('executionSuggestedActionRepairNode', 'Repair node');
        if (normalized === 'review-chain') return t('executionSuggestedActionReviewChain', 'Review chain settings');
        if (normalized === 'check-ssh') return t('executionSuggestedActionCheckSsh', 'Check SSH access');
        if (normalized === 'check-network') return t('executionSuggestedActionCheckNetwork', 'Check node reachability');
        if (normalized === 'check-logs') return t('executionSuggestedActionCheckLogs', 'Check node logs');
        if (normalized === 'open-node') return t('executionSuggestedActionOpenNode', 'Open node card');
        return normalized || t('executionSuggestedActionFallback', 'Review details');
    }

    function buildExecutionDetailActionButtons(detail, item, chainKey) {
        const suggested = Array.isArray(detail?.suggestedActions) ? detail.suggestedActions : [];
        if (!suggested.length) return '';

        const chainId = String(item?.chainId || '').trim();
        const startNodeId = String(item?.startNodeId || '').trim();
        const detailNodeId = String(detail?.nodeId || '').trim();
        const detailHopId = String(detail?.hopId || '').trim();
        const detailHopSourceNodeId = String(detail?.hopSourceNodeId || '').trim();
        const detailHopTargetNodeId = String(detail?.hopTargetNodeId || '').trim();
        const detailHopSourceNodeName = String(detail?.hopSourceNodeName || '').trim();
        const detailHopTargetNodeName = String(detail?.hopTargetNodeName || '').trim();
        const candidateNodeId = detailNodeId || startNodeId;
        const uniqueActions = [...new Set(suggested.map((action) => String(action || '').trim().toLowerCase()).filter(Boolean))];

        const buttons = uniqueActions.map((action) => {
            const label = escapeHtml(getExecutionSuggestedActionLabel(action));
            if (action === 'rerun-chain') {
                if (!startNodeId) return '';
                return `
                    <button class="btn btn-secondary btn-sm" type="button"
                        data-execution-action="rerun-chain"
                        data-chain-id="${escapeHtml(chainId)}"
                        data-start-node-id="${escapeHtml(startNodeId)}"
                        data-chain-key="${escapeHtml(chainKey)}">
                        ${label}
                    </button>
                `;
            }
            if (action === 'focus-hop') {
                if (!detailHopId) return '';
                return `
                    <button class="btn btn-secondary btn-sm" type="button"
                        data-execution-action="focus-hop"
                        data-hop-id="${escapeHtml(detailHopId)}">
                        ${label}
                    </button>
                `;
            }
            if (action === 'focus-node' || action === 'review-chain') {
                if (!candidateNodeId) return '';
                return `
                    <button class="btn btn-secondary btn-sm" type="button"
                        data-execution-action="focus-node"
                        data-start-node-id="${escapeHtml(candidateNodeId)}">
                        ${label}
                    </button>
                `;
            }
            if (action === 'repair-node') {
                if (!candidateNodeId) return '';
                return `
                    <button class="btn btn-secondary btn-sm" type="button"
                        data-execution-action="repair-node"
                        data-node-id="${escapeHtml(candidateNodeId)}">
                        ${label}
                    </button>
                `;
            }
            if (action === 'repair-rerun-chain') {
                if (!candidateNodeId || !startNodeId) return '';
                return `
                    <button class="btn btn-secondary btn-sm" type="button"
                        data-execution-action="repair-rerun-chain"
                        data-node-id="${escapeHtml(candidateNodeId)}"
                        data-chain-id="${escapeHtml(chainId)}"
                        data-start-node-id="${escapeHtml(startNodeId)}"
                        data-chain-key="${escapeHtml(chainKey)}">
                        ${label}
                    </button>
                `;
            }
            if (action === 'repair-hop-nodes') {
                if (!startNodeId || !detailHopSourceNodeId || !detailHopTargetNodeId) return '';
                return `
                    <button class="btn btn-secondary btn-sm" type="button"
                        data-execution-action="repair-hop-nodes"
                        data-hop-source-node-id="${escapeHtml(detailHopSourceNodeId)}"
                        data-hop-target-node-id="${escapeHtml(detailHopTargetNodeId)}"
                        data-chain-id="${escapeHtml(chainId)}"
                        data-start-node-id="${escapeHtml(startNodeId)}"
                        data-chain-key="${escapeHtml(chainKey)}">
                        ${label}
                    </button>
                `;
            }
            if (action === 'open-hop-nodes') {
                if (!detailHopSourceNodeId || !detailHopTargetNodeId) return '';
                const sourceLabel = escapeHtml(detailHopSourceNodeName || t('executionOpenSourceNode', 'Source node'));
                const targetLabel = escapeHtml(detailHopTargetNodeName || t('executionOpenTargetNode', 'Target node'));
                return `
                    <a class="btn btn-secondary btn-sm" href="/panel/nodes/${escapeHtml(detailHopSourceNodeId)}">
                        ${sourceLabel}
                    </a>
                    <a class="btn btn-secondary btn-sm" href="/panel/nodes/${escapeHtml(detailHopTargetNodeId)}">
                        ${targetLabel}
                    </a>
                `;
            }
            if (['open-node', 'check-logs', 'check-ssh', 'check-network'].includes(action)) {
                if (!candidateNodeId) return '';
                return `
                    <a class="btn btn-secondary btn-sm" href="/panel/nodes/${escapeHtml(candidateNodeId)}">
                        ${label}
                    </a>
                `;
            }
            return '';
        }).filter(Boolean);

        if (!buttons.length) return '';
        return `<div class="builder-execution-detail-actions">${buttons.join('')}</div>`;
    }

    function getNodeById(nodeId) {
        return state.flow?.nodes?.find((node) => String(node.id) === String(nodeId)) || null;
    }

    function getHopById(hopId) {
        return state.flow?.hops?.find((hop) => String(hop.id) === String(hopId)) || null;
    }

    function renderSelectOptions(values, selectedValue) {
        const selected = String(selectedValue || '').toLowerCase();
        return values.map((value) => {
            const optionValue = String(value);
            const isSelected = optionValue.toLowerCase() === selected;
            return `<option value="${escapeHtml(optionValue)}"${isSelected ? ' selected' : ''}>${escapeHtml(optionValue.toUpperCase())}</option>`;
        }).join('');
    }

    function setSelection(type = null, id = null) {
        state.selection = { type, id: id ? String(id) : null };
    }

    function isDarkTheme() {
        return document.documentElement?.dataset?.theme === 'dark';
    }

    function getBuilderPalette() {
        if (isDarkTheme()) {
            return {
                nodeBackground: '#162463',
                nodeBorder: '#2a8aad',
                nodeLabel: '#f8fafc',
                nodeXrayBackground: '#0f2946',
                nodeXrayBorder: '#08C5CB',
                nodeHysteriaBackground: '#17214f',
                nodeHysteriaBorder: '#44EFF4',
                edgeColor: '#44EFF4',
                edgeTextBackground: '#101948',
                edgeTextColor: '#dbeafe',
            };
        }

        return {
            nodeBackground: '#ffffff',
            nodeBorder: '#d7deec',
            nodeLabel: '#050A3C',
            nodeXrayBackground: '#eefbfd',
            nodeXrayBorder: '#08C5CB',
            nodeHysteriaBackground: '#f4f6fb',
            nodeHysteriaBorder: '#182463',
            edgeColor: '#182463',
            edgeTextBackground: '#ffffff',
            edgeTextColor: '#64748b',
        };
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
            const error = new Error(data.error || `${response.status}`);
            error.data = data;
            throw error;
        }
        return data;
    }

    function getBuilderStyle() {
        const palette = getBuilderPalette();
        return [
            {
                selector: 'node',
                style: {
                    'shape': 'round-rectangle',
                    'width': 156,
                    'height': 58,
                    'background-color': palette.nodeBackground,
                    'border-width': 1.5,
                    'border-style': 'dashed',
                    'border-color': palette.nodeBorder,
                    'label': 'data(label)',
                    'text-wrap': 'wrap',
                    'text-max-width': '136px',
                    'font-size': 11,
                    'font-family': 'Lilex, Inter, sans-serif',
                    'font-weight': 600,
                    'color': palette.nodeLabel,
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'padding': '12px',
                    'overlay-opacity': 0,
                },
            },
            {
                selector: 'node[nodeType = "xray"]',
                style: {
                    'background-color': palette.nodeXrayBackground,
                    'border-color': palette.nodeXrayBorder,
                },
            },
            {
                selector: 'node[nodeType = "hysteria"]',
                style: {
                    'background-color': palette.nodeHysteriaBackground,
                    'border-color': palette.nodeHysteriaBorder,
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
                    'line-color': palette.edgeColor,
                    'target-arrow-color': palette.edgeColor,
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 0.9,
                    'line-style': 'solid',
                    'overlay-opacity': 0,
                    'label': 'data(label)',
                    'font-size': 9,
                    'font-family': 'Lilex, Inter, sans-serif',
                    'text-background-color': palette.edgeTextBackground,
                    'text-background-opacity': 0.9,
                    'text-background-padding': '3px',
                    'text-background-shape': 'round-rectangle',
                    'text-rotation': 'autorotate',
                    'color': palette.edgeTextColor,
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

    function syncCyTheme() {
        if (!state.cy) return;
        state.cy.style(getBuilderStyle());
        state.cy.resize();
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
                <div class="builder-node-chip-meta">${escapeHtml(formatRole(inferredRole))}</div>
            `;
            el.addEventListener('click', () => {
                if (state.cy) {
                    state.cy.elements().unselect();
                    const nodeEle = state.cy.getElementById(node.id);
                    if (nodeEle.length) {
                        nodeEle.select();
                        state.cy.center(nodeEle);
                    }
                }
                setSelection('node', node.id);
                renderNodeInspector(node);
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
            const drafts = flow.draft?.draftHopCount || 0;
            sourceMeta.textContent = `${t('builderSourceMeta', 'legacy-backed draft over live topology')} · ${drafts} ${t('draftTag', 'draft')}`;
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

    function renderCommitPlan(plan) {
        const root = document.getElementById('builderPlanList');
        const badge = document.getElementById('builderPlanBadge');
        if (!root || !badge) return;

        const summary = plan?.summary || {};
        const hops = Array.isArray(plan?.hops) ? plan.hops : [];
        const chains = Array.isArray(plan?.chains) ? plan.chains : [];

        if (!summary.draftHops) {
            badge.textContent = '—';
            root.innerHTML = `<p class="builder-validation-empty">${escapeHtml(i18n.deployPreviewEmpty || 'Add draft hops to see deploy preview.')}</p>`;
            return;
        }

        const blocked = Number(summary.blockedHops || 0);
        badge.textContent = blocked > 0
            ? escapeHtml(i18n.previewBlocked || 'Blocked')
            : escapeHtml(i18n.previewReady || 'Ready');

        const summaryBlock = `
            <div class="builder-plan-summary">
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.summaryHops || 'Hops')}</span>
                    <strong>${summary.draftHops}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.previewCanCommit || 'Can commit')}</span>
                    <strong>${summary.creatableHops || 0}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.previewCanDeploy || 'Can deploy')}</span>
                    <strong>${summary.deployableHops || 0}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.previewChain || 'Chains')}</span>
                    <strong>${summary.chainsTouched || 0}</strong>
                </div>
            </div>
        `;

        const chainsBlock = chains.map((chain) => {
            const warnings = Array.isArray(chain.deployWarnings) ? chain.deployWarnings : [];
            const actions = Array.isArray(chain.nodeActions) ? chain.nodeActions : [];
            return `
                <div class="builder-plan-card">
                    <div class="builder-plan-card-head">
                        <strong>${escapeHtml(chain.id)}</strong>
                        <span>${escapeHtml(formatMode(chain.chainMode || 'unknown'))}</span>
                    </div>
                    <div class="builder-plan-card-meta">
                        ${escapeHtml(i18n.summaryNodes || 'Nodes')}: ${chain.nodeCount} · ${escapeHtml(i18n.summaryHops || 'Hops')}: ${chain.liveHopCount}+${chain.draftHopCount}
                    </div>
                    ${warnings.length ? `
                        <div class="builder-plan-message-list">
                            ${warnings.map((item) => `<div class="builder-validation-item warning">${escapeHtml(item)}</div>`).join('')}
                        </div>
                    ` : ''}
                    <div class="builder-plan-actions-title">${escapeHtml(i18n.previewActions || 'Actions')}</div>
                    <div class="builder-plan-actions-list">
                        ${actions.map((item) => `
                            <div class="builder-plan-action">
                                <strong>${escapeHtml(item.nodeName)}</strong>
                                <span>${escapeHtml(i18n.previewCurrentRole || 'Current role')}: ${escapeHtml(formatRole(item.currentRole))}</span>
                                <span>${escapeHtml(i18n.previewNextRole || 'Next role')}: ${escapeHtml(formatRole(item.previewRole))}</span>
                                <p>${escapeHtml(item.action)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        const hopsBlock = hops.map((hop) => {
            const errors = Array.isArray(hop.errors) ? hop.errors : [];
            const warnings = Array.isArray(hop.warnings) ? hop.warnings : [];
            const assumptions = Array.isArray(hop.assumptions) ? hop.assumptions : [];
            return `
                <div class="builder-plan-card">
                    <div class="builder-plan-card-head">
                        <strong>${escapeHtml(hop.name || `${hop.sourceNodeName} -> ${hop.targetNodeName}`)}</strong>
                        <span>${escapeHtml(formatMode(hop.mode))} · ${escapeHtml(hop.stack)}</span>
                    </div>
                    <div class="builder-data-list builder-plan-inline-list">
                        <div class="builder-data-row"><span>${escapeHtml(i18n.source || 'Source')}</span><strong>${escapeHtml(hop.sourceNodeName)}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.target || 'Target')}</span><strong>${escapeHtml(hop.targetNodeName)}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.previewCurrentRole || 'Current role')}</span><strong>${escapeHtml(formatRole(hop.currentSourceRole))} -> ${escapeHtml(formatRole(hop.currentTargetRole))}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.previewNextRole || 'Next role')}</span><strong>${escapeHtml(formatRole(hop.previewSourceRole))} -> ${escapeHtml(formatRole(hop.previewTargetRole))}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.protocol || 'Protocol')}</span><strong>${escapeHtml(hop.tunnelProtocol)} / ${escapeHtml(hop.tunnelTransport)} / ${escapeHtml(hop.tunnelSecurity)}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.status || 'Status')}</span><strong>${hop.canCommit ? escapeHtml(i18n.previewCanCommit || 'Can commit') : escapeHtml(i18n.previewBlocked || 'Blocked')}</strong></div>
                    </div>
                    ${errors.length ? `<div class="builder-plan-message-list">${errors.map((item) => `<div class="builder-validation-item error">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
                    ${warnings.length ? `<div class="builder-plan-message-list">${warnings.map((item) => `<div class="builder-validation-item warning">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
                    ${assumptions.length ? `
                        <div class="builder-plan-actions-title">${escapeHtml(i18n.previewAssumptions || 'Assumptions')}</div>
                        <div class="builder-plan-message-list">
                            ${assumptions.map((item) => `<div class="builder-validation-item">${escapeHtml(item)}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        root.innerHTML = `${summaryBlock}${chainsBlock}${hopsBlock}`;
    }

    function formatExecutionTime(value) {
        const raw = String(value || '').trim();
        if (!raw) return '—';
        const timestamp = new Date(raw);
        if (Number.isNaN(timestamp.getTime())) return raw;
        return timestamp.toLocaleString();
    }

    function normalizeExecutionFilter(value) {
        const normalized = String(value || 'all').trim().toLowerCase();
        if (normalized === 'failed' || normalized === 'success') return normalized;
        return 'all';
    }

    function getExecutionDeployResults(execution) {
        const deployment = execution?.deployment && typeof execution.deployment === 'object'
            ? execution.deployment
            : null;
        const results = deployment && Array.isArray(deployment.results)
            ? deployment.results
            : [];
        return { deployment, results };
    }

    function applyExecutionFilter(results, filter) {
        const activeFilter = normalizeExecutionFilter(filter);
        if (activeFilter === 'failed') return results.filter((item) => !item?.success);
        if (activeFilter === 'success') return results.filter((item) => !!item?.success);
        return results;
    }

    function syncExecutionFilterUi(execution) {
        const filterGroup = document.getElementById('builderExecutionFilterGroup');
        if (!filterGroup) return;
        const { deployment, results } = getExecutionDeployResults(execution);
        const disabled = !deployment || results.length === 0;
        filterGroup.querySelectorAll('[data-execution-filter]').forEach((button) => {
            const filterValue = normalizeExecutionFilter(button.getAttribute('data-execution-filter'));
            const active = filterValue === normalizeExecutionFilter(state.executionFilter);
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            button.disabled = disabled;
        });
    }

    function renderExecutionResult(execution) {
        const root = document.getElementById('builderExecutionList');
        const badge = document.getElementById('builderExecutionBadge');
        if (!root || !badge) return;

        if (!execution || typeof execution !== 'object') {
            state.execution = null;
            state.executionReruns = {};
            badge.textContent = '—';
            syncExecutionFilterUi(null);
            root.innerHTML = `<p class="builder-validation-empty">${escapeHtml(i18n.executionEmpty || 'No execution runs yet.')}</p>`;
            return;
        }

        const previousExecutionCreatedAt = String(state.execution?.createdAt || '');
        const nextExecutionCreatedAt = String(execution.createdAt || '');
        if (previousExecutionCreatedAt && nextExecutionCreatedAt && previousExecutionCreatedAt !== nextExecutionCreatedAt) {
            state.executionReruns = {};
        }

        state.execution = execution;
        state.executionFilter = normalizeExecutionFilter(state.executionFilter);

        const deployment = execution.deployment && typeof execution.deployment === 'object'
            ? execution.deployment
            : null;
        const failureItems = Array.isArray(execution.failureItems) ? execution.failureItems : [];
        const deployResults = deployment && Array.isArray(deployment.results)
            ? deployment.results
            : [];
        const deploymentFailures = deployResults.filter((entry) => !entry.success);
        const hasIssues = failureItems.length > 0 || deploymentFailures.length > 0;
        const filteredResults = applyExecutionFilter(deployResults, state.executionFilter);

        syncExecutionFilterUi(execution);

        badge.textContent = hasIssues
            ? escapeHtml(i18n.previewBlocked || 'Blocked')
            : escapeHtml(i18n.previewReady || 'Ready');

        const summaryBlock = `
            <div class="builder-plan-summary">
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionTitle || 'Last execution')}</span>
                    <strong>${escapeHtml(execution.type === 'commit-deploy' ? (i18n.executionCommitDeploy || 'Commit + deploy') : (i18n.executionCommitOnly || 'Commit only'))}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionCreatedAt || 'Completed at')}</span>
                    <strong>${escapeHtml(formatExecutionTime(execution.createdAt))}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionCommitted || 'Committed')}</span>
                    <strong>${Number(execution.committed || 0)}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionFailed || 'Failed')}</span>
                    <strong>${Number(execution.failed || 0)}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionChains || 'Chains')}</span>
                    <strong>${deployment ? Number(deployment.chains || 0) : 0}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionDeployedChains || 'Chains deployed')}</span>
                    <strong>${deployment ? Number(deployment.deployedChains || 0) : 0}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.executionFailedChains || 'Chains failed')}</span>
                    <strong>${deployment ? Number(deployment.failedChains || 0) : 0}</strong>
                </div>
                <div class="builder-plan-stat">
                    <span>${escapeHtml(i18n.status || 'Status')}</span>
                    <strong>${deployment ? escapeHtml(i18n.executionChainResult || 'Chain run') : escapeHtml(i18n.executionDeploySkipped || 'Deploy skipped')}</strong>
                </div>
            </div>
        `;

        const commitFailuresBlock = failureItems.length
            ? `
                <div class="builder-plan-card">
                    <div class="builder-plan-card-head">
                        <strong>${escapeHtml(i18n.executionFailed || 'Failed')}</strong>
                        <span>${failureItems.length}</span>
                    </div>
                    <div class="builder-plan-message-list">
                        ${failureItems.map((item) => `
                            <div class="builder-validation-item error">
                                <strong>${escapeHtml(item.name || item.hopId || 'draft')}</strong>
                                <span>${escapeHtml(item.error || '—')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `
            : '';

        const chainResultsBlock = deployment && deployResults.length
            ? (filteredResults.length
                ? filteredResults.map((item, index) => {
                const warnings = Array.isArray(item.deployWarnings) ? item.deployWarnings : [];
                const errors = Array.isArray(item.errors) ? item.errors : [];
                const errorDetails = Array.isArray(item.errorDetails) ? item.errorDetails : [];
                const nodeActions = Array.isArray(item.nodeActions) ? item.nodeActions : [];
                const hopNames = Array.isArray(item.hopNames) ? item.hopNames : [];
                const chainKey = String(item.chainId || item.startNodeId || item.chainName || `chain-${index + 1}`);
                const repairNodeId = String(
                    errorDetails.find((detail) => String(detail?.nodeId || '').trim())?.nodeId
                    || item.startNodeId
                    || '',
                ).trim();
                const rerunResult = state.executionReruns[chainKey] || item.lastRerun || null;
                const rerunErrors = Array.isArray(rerunResult?.errors) ? rerunResult.errors : [];
                return `
                    <div class="builder-plan-card">
                        <div class="builder-plan-card-head">
                            <strong>${escapeHtml(item.chainName || item.chainId || item.startNodeName || item.startNodeId || 'chain')}</strong>
                            <span>${escapeHtml(formatMode(item.chainMode || 'unknown'))}</span>
                        </div>
                        <div class="builder-data-list builder-plan-inline-list">
                            <div class="builder-data-row"><span>${escapeHtml(i18n.executionStartNode || 'Start node')}</span><strong>${escapeHtml(item.startNodeName || item.startNodeId || '—')}</strong></div>
                            <div class="builder-data-row"><span>${escapeHtml(i18n.summaryNodes || 'Nodes')}</span><strong>${Number(item.nodeCount || 0)}</strong></div>
                            <div class="builder-data-row"><span>${escapeHtml(i18n.summaryHops || 'Hops')}</span><strong>${Number(item.liveHopCount || 0)}+${Number(item.draftHopCount || 0)}</strong></div>
                            <div class="builder-data-row"><span>${escapeHtml(i18n.executionChainResult || 'Chain result')}</span><strong>${item.success ? escapeHtml(i18n.previewReady || 'Ready') : escapeHtml(i18n.previewBlocked || 'Blocked')}</strong></div>
                        </div>
                        ${hopNames.length ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionHopNames || 'Hop set')}</div>
                            <div class="builder-plan-message-list">
                                ${hopNames.map((hopName) => `<div class="builder-validation-item">${escapeHtml(hopName)}</div>`).join('')}
                            </div>
                        ` : ''}
                        ${warnings.length ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionWarnings || 'Warnings')}</div>
                            <div class="builder-plan-message-list">
                                ${warnings.map((warning) => `<div class="builder-validation-item warning">${escapeHtml(warning)}</div>`).join('')}
                            </div>
                        ` : ''}
                        ${errors.length ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionErrors || 'Errors')}</div>
                            <div class="builder-plan-message-list">
                                ${errors.map((err) => `<div class="builder-validation-item error">${escapeHtml(err)}</div>`).join('')}
                            </div>
                        ` : ''}
                        ${errorDetails.length ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionErrorDetails || 'Error details')}</div>
                            <div class="builder-plan-message-list">
                                ${errorDetails.map((detail) => {
                                    const scope = String(detail.scope || '').toLowerCase();
                                    const detailPrefix = scope === 'hop'
                                        ? `${i18n.executionHop || 'Hop'} ${detail.hopName || '—'}: `
                                        : (scope === 'node'
                                            ? `${detail.nodeName || detail.nodeId || (i18n.executionNodeActions || 'Node')}: `
                                            : '');
                                    const detailCode = String(detail.code || '').trim();
                                    const detailHint = String(detail.hint || '').trim();
                                    const detailNodeStatus = String(detail.nodeStatus || '').trim();
                                    const detailHopSourceNodeName = String(detail.hopSourceNodeName || '').trim();
                                    const detailHopTargetNodeName = String(detail.hopTargetNodeName || '').trim();
                                    const detailHopSourceNodeStatus = String(detail.hopSourceNodeStatus || '').trim();
                                    const detailHopTargetNodeStatus = String(detail.hopTargetNodeStatus || '').trim();
                                    const detailFailedStep = String(detail.failedStep || '').trim();
                                    const detailServiceState = String(detail.serviceState || '').trim();
                                    const detailSuggestedActions = Array.isArray(detail.suggestedActions)
                                        ? detail.suggestedActions.map((action) => String(action || '').trim()).filter(Boolean)
                                        : [];
                                    const hopHint = Array.isArray(detail.relatedHops) && detail.relatedHops.length
                                        ? ` (${(i18n.executionHopNames || 'Hop set')}: ${detail.relatedHops.join(', ')})`
                                        : '';
                                    const detailActionButtons = buildExecutionDetailActionButtons(detail, item, chainKey);
                                    const hopSourceStatusLabel = detailHopSourceNodeStatus || (i18n.statusUnknown || 'unknown');
                                    const hopTargetStatusLabel = detailHopTargetNodeStatus || (i18n.statusUnknown || 'unknown');
                                    const hopEndpointsLabel = (detailHopSourceNodeName || detailHopTargetNodeName)
                                        ? `${detailHopSourceNodeName || (i18n.executionOpenSourceNode || 'Source node')} (${hopSourceStatusLabel}) -> ${detailHopTargetNodeName || (i18n.executionOpenTargetNode || 'Target node')} (${hopTargetStatusLabel})`
                                        : '';
                                    return `
                                        <div class="builder-validation-item ${detail.severity === 'critical' ? 'critical' : 'error'}">
                                            ${detailCode ? `<strong>${escapeHtml(`[${detailCode}]`)}</strong>` : ''}
                                            <span>${escapeHtml(`${detailPrefix}${detail.message || detail.raw || '—'}${hopHint}`)}</span>
                                            ${detailNodeStatus ? `<small>${escapeHtml(`${i18n.status || 'Status'}: ${detailNodeStatus}`)}</small>` : ''}
                                            ${hopEndpointsLabel ? `<small>${escapeHtml(`${i18n.executionHopEndpoints || 'Hop endpoints'}: ${hopEndpointsLabel}`)}</small>` : ''}
                                            ${detailServiceState ? `<small>${escapeHtml(`${i18n.executionServiceState || 'Service state'}: ${detailServiceState}`)}</small>` : ''}
                                            ${detailFailedStep ? `<small>${escapeHtml(`${i18n.executionFailedStep || 'Failed step'}: ${detailFailedStep}`)}</small>` : ''}
                                            ${detailHint ? `<small>${escapeHtml(detailHint)}</small>` : ''}
                                            ${detailSuggestedActions.length ? `<small>${escapeHtml(i18n.executionSuggestedActions || 'Suggested actions')}: ${escapeHtml(detailSuggestedActions.map((action) => getExecutionSuggestedActionLabel(action)).join(' · '))}</small>` : ''}
                                            ${detailActionButtons}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : ''}
                        ${!item.success ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionActions || 'Actions')}</div>
                            <div class="builder-execution-chain-actions">
                                <button class="btn btn-secondary btn-sm" type="button" data-execution-action="focus-node" data-start-node-id="${escapeHtml(item.startNodeId || '')}">
                                    <i class="ti ti-focus-2"></i>
                                    <span>${escapeHtml(i18n.executionFocusNode || 'Focus node')}</span>
                                </button>
                                <button class="btn btn-secondary btn-sm" type="button" data-execution-action="rerun-chain" data-chain-id="${escapeHtml(item.chainId || '')}" data-start-node-id="${escapeHtml(item.startNodeId || '')}" data-chain-key="${escapeHtml(chainKey)}">
                                    <i class="ti ti-refresh"></i>
                                    <span>${escapeHtml(i18n.executionRetryChain || 'Retry chain')}</span>
                                </button>
                                ${repairNodeId ? `
                                    <button class="btn btn-secondary btn-sm" type="button" data-execution-action="repair-node" data-node-id="${escapeHtml(repairNodeId)}">
                                        <i class="ti ti-stethoscope"></i>
                                        <span>${escapeHtml(i18n.executionRepairNode || 'Repair node')}</span>
                                    </button>
                                    <button class="btn btn-secondary btn-sm" type="button" data-execution-action="repair-rerun-chain" data-node-id="${escapeHtml(repairNodeId)}" data-chain-id="${escapeHtml(item.chainId || '')}" data-start-node-id="${escapeHtml(item.startNodeId || '')}" data-chain-key="${escapeHtml(chainKey)}">
                                        <i class="ti ti-refresh"></i>
                                        <span>${escapeHtml(i18n.executionRepairRerunChain || 'Repair + rerun')}</span>
                                    </button>
                                    <a class="btn btn-secondary btn-sm" href="/panel/nodes/${escapeHtml(repairNodeId)}">
                                        <i class="ti ti-external-link"></i>
                                        <span>${escapeHtml(i18n.executionOpenNode || 'Open node')}</span>
                                    </a>
                                ` : ''}
                            </div>
                        ` : ''}
                        ${rerunResult ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionLastRerun || 'Last rerun')}</div>
                            <div class="builder-plan-message-list">
                                <div class="builder-validation-item ${rerunResult.success ? '' : 'error'}">
                                    <strong>${escapeHtml(formatExecutionTime(rerunResult.at || rerunResult.createdAt || ''))}</strong>
                                    <span>${escapeHtml(rerunResult.success ? (i18n.previewReady || 'Ready') : (i18n.previewBlocked || 'Blocked'))}${rerunErrors.length ? ` · ${escapeHtml(rerunErrors[0])}` : ''}</span>
                                </div>
                            </div>
                        ` : ''}
                        ${nodeActions.length ? `
                            <div class="builder-plan-actions-title">${escapeHtml(i18n.executionNodeActions || 'Node actions')}</div>
                            <div class="builder-plan-actions-list">
                                ${nodeActions.map((action) => `
                                    <div class="builder-plan-action">
                                        <strong>${escapeHtml(action.nodeName || action.nodeId || 'node')}</strong>
                                        <span>${escapeHtml(i18n.previewCurrentRole || 'Current role')}: ${escapeHtml(formatRole(action.currentRole || 'standalone'))}</span>
                                        <span>${escapeHtml(i18n.previewNextRole || 'Next role')}: ${escapeHtml(formatRole(action.previewRole || 'standalone'))}</span>
                                        <p>${escapeHtml(action.action || '—')}</p>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')
                : `<p class="builder-validation-empty">${escapeHtml(i18n.executionFilterEmpty || 'No chains match the selected filter.')}</p>`)
            : `<p class="builder-validation-empty">${escapeHtml(i18n.executionDeploySkipped || 'Deploy was not requested in this run.')}</p>`;

        root.innerHTML = `${summaryBlock}${commitFailuresBlock}${chainResultsBlock}`;
    }

    function buildExecutionDiagnosticsText(execution) {
        if (!execution || typeof execution !== 'object') {
            return i18n.executionEmpty || 'No execution runs yet.';
        }

        const lines = [];
        const title = execution.type === 'commit-deploy'
            ? (i18n.executionCommitDeploy || 'Commit + deploy')
            : (i18n.executionCommitOnly || 'Commit only');
        lines.push(`${i18n.executionTitle || 'Last execution result'}: ${title}`);
        lines.push(`${i18n.executionCreatedAt || 'Completed at'}: ${formatExecutionTime(execution.createdAt)}`);
        lines.push(`${i18n.executionCommitted || 'Committed'}: ${Number(execution.committed || 0)}`);
        lines.push(`${i18n.executionFailed || 'Failed'}: ${Number(execution.failed || 0)}`);

        const failureItems = Array.isArray(execution.failureItems) ? execution.failureItems : [];
        if (failureItems.length) {
            lines.push('');
            lines.push(`${i18n.executionErrors || 'Errors'}:`);
            failureItems.forEach((item) => {
                const name = item.name || item.hopId || 'draft';
                lines.push(`- ${name}: ${item.error || '—'}`);
            });
        }

        const deployment = execution.deployment && typeof execution.deployment === 'object'
            ? execution.deployment
            : null;
        if (!deployment) {
            lines.push('');
            lines.push(i18n.executionDeploySkipped || 'Deploy was not requested in this run');
            return lines.join('\n');
        }

        lines.push('');
        lines.push(`${i18n.executionChains || 'Chains'}: ${Number(deployment.chains || 0)}`);
        lines.push(`${i18n.executionDeployedChains || 'Chains deployed'}: ${Number(deployment.deployedChains || 0)}`);
        lines.push(`${i18n.executionFailedChains || 'Chains failed'}: ${Number(deployment.failedChains || 0)}`);

        const deployResults = Array.isArray(deployment.results) ? deployment.results : [];
        if (deployResults.length) {
            lines.push('');
            lines.push(`${i18n.executionChainResult || 'Chain result'}:`);
            deployResults.forEach((item, index) => {
                const chainName = item.chainName || item.chainId || item.startNodeName || item.startNodeId || `chain-${index + 1}`;
                lines.push(`- ${chainName}: ${item.success ? (i18n.previewReady || 'Ready') : (i18n.previewBlocked || 'Blocked')}`);
                lines.push(`  ${i18n.executionStartNode || 'Start node'}: ${item.startNodeName || item.startNodeId || '—'}`);
                lines.push(`  ${i18n.summaryHops || 'Hops'}: ${Number(item.liveHopCount || 0)}+${Number(item.draftHopCount || 0)}`);
                const warnings = Array.isArray(item.deployWarnings) ? item.deployWarnings : [];
                const errors = Array.isArray(item.errors) ? item.errors : [];
                if (warnings.length) {
                    lines.push(`  ${i18n.executionWarnings || 'Warnings'}: ${warnings.join(' | ')}`);
                }
                if (errors.length) {
                    lines.push(`  ${i18n.executionErrors || 'Errors'}: ${errors.join(' | ')}`);
                }
            });
        }

        return lines.join('\n');
    }

    function buildExecutionDiagnosticsPayload(execution) {
        if (!execution || typeof execution !== 'object') {
            return {
                exportType: 'cascade-execution-diagnostics',
                exportedAt: new Date().toISOString(),
                hasExecution: false,
                message: i18n.executionEmpty || 'No execution runs yet.',
            };
        }

        const deployment = execution.deployment && typeof execution.deployment === 'object'
            ? execution.deployment
            : null;

        return {
            exportType: 'cascade-execution-diagnostics',
            exportedAt: new Date().toISOString(),
            hasExecution: true,
            execution: {
                type: execution.type || 'commit-only',
                createdAt: execution.createdAt || null,
                committed: Number(execution.committed || 0),
                failed: Number(execution.failed || 0),
                failureItems: Array.isArray(execution.failureItems) ? execution.failureItems : [],
                deployment: deployment
                    ? {
                        chains: Number(deployment.chains || 0),
                        deployedChains: Number(deployment.deployedChains || 0),
                        failedChains: Number(deployment.failedChains || 0),
                        results: Array.isArray(deployment.results) ? deployment.results : [],
                    }
                    : null,
            },
        };
    }

    function buildExecutionFailedCompactText(execution) {
        if (!execution || typeof execution !== 'object') {
            return i18n.executionEmpty || 'No execution runs yet.';
        }

        const { deployment, results: deployResults } = getExecutionDeployResults(execution);

        if (!deployment) {
            return i18n.executionCopyFailedOnlyEmpty || 'No failed chains in the last execution.';
        }

        const failedItems = deployResults.filter((item) => !item?.success);

        if (!failedItems.length) {
            return i18n.executionCopyFailedOnlyEmpty || 'No failed chains in the last execution.';
        }

        const lines = [];
        const title = execution.type === 'commit-deploy'
            ? (i18n.executionCommitDeploy || 'Commit + deploy')
            : (i18n.executionCommitOnly || 'Commit only');

        lines.push(`${i18n.executionTitle || 'Last execution result'}: ${title}`);
        lines.push(`${i18n.executionCreatedAt || 'Completed at'}: ${formatExecutionTime(execution.createdAt)}`);
        lines.push(`${i18n.executionFailedChains || 'Chains failed'}: ${failedItems.length}/${Number(deployment.chains || 0)}`);
        lines.push('');
        lines.push(`${i18n.executionErrors || 'Errors'}:`);

        failedItems.forEach((item, index) => {
            const chainName = item.chainName || item.chainId || item.startNodeName || item.startNodeId || `chain-${index + 1}`;
            const errorList = Array.isArray(item.errors) ? item.errors.filter(Boolean) : [];
            const firstError = errorList[0] || (i18n.chainDeployFailed || 'Chain deploy failed');
            lines.push(`- ${chainName}: ${firstError}`);
        });

        return lines.join('\n');
    }

    function buildExecutionFailedOnlyPayload(execution) {
        const emptyPayload = {
            exportType: 'cascade-execution-failed-only',
            exportedAt: new Date().toISOString(),
            hasExecution: false,
            hasFailedChains: false,
            message: i18n.executionEmpty || 'No execution runs yet.',
        };

        if (!execution || typeof execution !== 'object') {
            return emptyPayload;
        }

        const { deployment, results } = getExecutionDeployResults(execution);
        const failedItems = results.filter((item) => !item?.success);
        const title = execution.type === 'commit-deploy'
            ? 'commit-deploy'
            : 'commit-only';

        if (!deployment) {
            return {
                ...emptyPayload,
                hasExecution: true,
                message: i18n.executionCopyFailedOnlyEmpty || 'No failed chains in the last execution.',
                execution: {
                    type: title,
                    createdAt: execution.createdAt || null,
                    committed: Number(execution.committed || 0),
                    failed: Number(execution.failed || 0),
                    chains: 0,
                    failedChains: 0,
                },
                failedChains: [],
            };
        }

        return {
            exportType: 'cascade-execution-failed-only',
            exportedAt: new Date().toISOString(),
            hasExecution: true,
            hasFailedChains: failedItems.length > 0,
            execution: {
                type: title,
                createdAt: execution.createdAt || null,
                committed: Number(execution.committed || 0),
                failed: Number(execution.failed || 0),
                chains: Number(deployment.chains || 0),
                failedChains: Number(deployment.failedChains || failedItems.length),
            },
            failedChains: failedItems.map((item, index) => ({
                chainName: item.chainName || item.chainId || item.startNodeName || item.startNodeId || `chain-${index + 1}`,
                chainId: item.chainId || null,
                startNodeName: item.startNodeName || null,
                startNodeId: item.startNodeId || null,
                mode: item.chainMode || null,
                liveHopCount: Number(item.liveHopCount || 0),
                draftHopCount: Number(item.draftHopCount || 0),
                hopNames: Array.isArray(item.hopNames) ? item.hopNames : [],
                errors: Array.isArray(item.errors) ? item.errors : [],
                errorDetails: Array.isArray(item.errorDetails) ? item.errorDetails : [],
                warnings: Array.isArray(item.deployWarnings) ? item.deployWarnings : [],
                nodeActions: Array.isArray(item.nodeActions) ? item.nodeActions : [],
            })),
        };
    }

    async function copyTextToClipboard(text, successMessage) {
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            toast(successMessage || (i18n.executionCopyDone || 'Execution diagnostics copied.'), 'success');
        } catch (error) {
            toast(i18n.executionCopyFailed || 'Failed to copy diagnostics.', 'error');
        }
    }

    async function copyExecutionDiagnosticsText() {
        const text = buildExecutionDiagnosticsText(state.execution);
        await copyTextToClipboard(text, i18n.executionCopyDone || 'Execution diagnostics copied.');
    }

    async function copyExecutionDiagnosticsFailedCompact() {
        const text = buildExecutionFailedCompactText(state.execution);
        await copyTextToClipboard(
            text,
            i18n.executionCopyFailedOnlyDone || 'Failed chains diagnostics copied.',
        );
    }

    async function copyExecutionDiagnosticsFailedJson() {
        const payload = buildExecutionFailedOnlyPayload(state.execution);
        const jsonText = JSON.stringify(payload, null, 2);
        await copyTextToClipboard(
            jsonText,
            i18n.executionCopyFailedJsonDone || 'Failed chains diagnostics JSON copied.',
        );
    }

    async function copyExecutionDiagnosticsJson() {
        const payload = buildExecutionDiagnosticsPayload(state.execution);
        const jsonText = JSON.stringify(payload, null, 2);
        await copyTextToClipboard(jsonText, i18n.executionCopyJsonDone || 'Execution diagnostics JSON copied.');
    }

    async function rerunExecutionChain({ chainId = '', startNodeId = '', chainKey = '', showToast = true } = {}) {
        if (!startNodeId) {
            if (showToast) {
                toast(i18n.executionRerunMissingStartNode || 'Start node is required to rerun this chain.', 'error');
            }
            return { success: false, error: i18n.executionRerunMissingStartNode || 'Start node is required to rerun this chain.' };
        }
        try {
            const response = await requestJson('/api/cascade-builder/rerun-chain', {
                method: 'POST',
                body: JSON.stringify({
                    chainId: chainId || undefined,
                    startNodeId,
                }),
            });
            const result = response?.result && typeof response.result === 'object'
                ? response.result
                : null;
            if (result) {
                const resolvedKey = String(chainKey || result.chainId || result.startNodeId || '');
                if (resolvedKey) {
                    state.executionReruns[resolvedKey] = {
                        at: new Date().toISOString(),
                        ...result,
                    };
                }
            }
            renderExecutionResult(state.execution);
            if (showToast) {
                toast(
                    response?.success
                        ? (i18n.executionRerunDone || 'Chain rerun completed.')
                        : (i18n.executionRerunFailed || 'Chain rerun failed.'),
                    response?.success ? 'success' : 'error',
                );
            }
            return {
                success: !!response?.success,
                result: result || null,
            };
        } catch (error) {
            if (showToast) {
                toast(`${i18n.executionRerunFailed || 'Chain rerun failed.'} ${error.message}`, 'error');
            }
            return { success: false, error: error.message };
        }
    }

    async function rerunFailedExecutionChains() {
        const execution = state.execution && typeof state.execution === 'object' ? state.execution : null;
        const deployment = execution?.deployment && typeof execution.deployment === 'object'
            ? execution.deployment
            : null;
        const results = Array.isArray(deployment?.results) ? deployment.results : [];
        const failedItems = results.filter((item) => item && item.success === false);

        if (!failedItems.length) {
            toast(i18n.executionRerunFailedChainsEmpty || 'No failed chains to rerun.', 'warning');
            return;
        }

        let successCount = 0;
        let failedCount = 0;

        for (const item of failedItems) {
            const chainKey = String(item.chainId || item.startNodeId || item.chainName || '').trim();
            const rerunResult = await rerunExecutionChain({
                chainId: String(item.chainId || '').trim(),
                startNodeId: String(item.startNodeId || '').trim(),
                chainKey,
                showToast: false,
            });
            if (rerunResult.success) successCount += 1;
            else failedCount += 1;
        }

        if (failedCount > 0) {
            toast(
                `${i18n.executionRerunFailedChainsFailed || 'Failed chain rerun finished with errors'} (${successCount}/${failedItems.length})`,
                'error',
            );
            return;
        }

        toast(
            `${i18n.executionRerunFailedChainsDone || 'Failed chain rerun completed'} (${successCount}/${failedItems.length})`,
            'success',
        );
    }

    async function repairExecutionNode(nodeId = '', options = {}) {
        const { showToast = true } = options;
        const normalizedNodeId = String(nodeId || '').trim();
        if (!normalizedNodeId) {
            const errorMessage = i18n.executionRepairNodeMissing || 'Node ID is required for repair.';
            if (showToast) toast(errorMessage, 'error');
            return { success: false, error: errorMessage };
        }
        try {
            const response = await requestJson(`/panel/nodes/${encodeURIComponent(normalizedNodeId)}/onboarding/repair`, {
                method: 'POST',
            });
            const message = response?.message
                || i18n.executionRepairNodeStarted
                || 'Node repair started in background.';
            if (showToast) toast(message, 'success');
            return { success: true, response };
        } catch (error) {
            const errorMessage = `${i18n.executionRepairNodeFailed || 'Failed to start node repair.'} ${error.message}`;
            if (showToast) toast(errorMessage, 'error');
            return { success: false, error: error.message };
        }
    }

    async function waitForRepairCompletion(nodeId = '', options = {}) {
        const normalizedNodeId = String(nodeId || '').trim();
        if (!normalizedNodeId) {
            return { success: false, error: i18n.executionRepairNodeMissing || 'Node ID is required for repair.' };
        }
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 180000;
        const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 5000;
        const deadline = Date.now() + timeoutMs;
        let lastState = '';
        let lastError = '';

        while (Date.now() <= deadline) {
            let status;
            try {
                status = await requestJson(`/panel/nodes/${encodeURIComponent(normalizedNodeId)}/setup-status`);
            } catch (error) {
                return { success: false, error: error.message || 'setup-status request failed' };
            }
            lastState = String(status?.state || '').trim().toLowerCase();
            lastError = String(status?.error || status?.lastError || '').trim();
            if (lastState === 'success') {
                return { success: true, status };
            }
            if (lastState === 'error') {
                return { success: false, error: lastError || (i18n.executionRepairRerunWaitFailed || 'Repair finished with error.'), status };
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        return {
            success: false,
            timeout: true,
            state: lastState || 'timeout',
            error: i18n.executionRepairRerunWaitTimeout || 'Repair did not finish in time.',
        };
    }

    async function repairAndRerunExecutionChain({ nodeId = '', chainId = '', startNodeId = '', chainKey = '' } = {}) {
        const normalizedNodeId = String(nodeId || '').trim();
        const normalizedStartNodeId = String(startNodeId || '').trim();
        if (!normalizedNodeId) {
            toast(i18n.executionRepairNodeMissing || 'Node ID is required for repair.', 'error');
            return;
        }
        if (!normalizedStartNodeId) {
            toast(i18n.executionRerunMissingStartNode || 'Start node is required to rerun this chain.', 'error');
            return;
        }

        const repairStart = await repairExecutionNode(normalizedNodeId, { showToast: false });
        if (!repairStart.success) {
            toast(`${i18n.executionRepairNodeFailed || 'Failed to start node repair.'} ${repairStart.error || ''}`.trim(), 'error');
            return;
        }
        toast(
            repairStart?.response?.message
                || i18n.executionRepairRerunStarted
                || 'Node repair started. Waiting for completion before rerun...',
            'success',
        );

        const waitResult = await waitForRepairCompletion(normalizedNodeId, {
            timeoutMs: 180000,
            intervalMs: 5000,
        });
        if (!waitResult.success) {
            if (waitResult.timeout) {
                toast(i18n.executionRepairRerunWaitTimeout || 'Repair did not finish in time.', 'error');
            } else {
                toast(`${i18n.executionRepairRerunWaitFailed || 'Repair finished with error.'} ${waitResult.error || ''}`.trim(), 'error');
            }
            return;
        }

        await rerunExecutionChain({
            chainId,
            startNodeId: normalizedStartNodeId,
            chainKey,
        });
    }

    async function repairHopNodesAndRerun({
        sourceNodeId = '',
        targetNodeId = '',
        chainId = '',
        startNodeId = '',
        chainKey = '',
    } = {}) {
        const normalizedStartNodeId = String(startNodeId || '').trim();
        const candidates = [String(sourceNodeId || '').trim(), String(targetNodeId || '').trim()]
            .filter(Boolean);
        const uniqueNodeIds = [...new Set(candidates)];

        if (!normalizedStartNodeId) {
            toast(i18n.executionRerunMissingStartNode || 'Start node is required to rerun this chain.', 'error');
            return;
        }
        if (!uniqueNodeIds.length) {
            toast(i18n.executionRepairHopNodesMissing || 'Hop node IDs are required for hop repair.', 'error');
            return;
        }

        toast(
            i18n.executionRepairHopNodesStarted
                || 'Hop node repair started. Waiting for completion before rerun...',
            'success',
        );

        for (const nodeId of uniqueNodeIds) {
            const repairStart = await repairExecutionNode(nodeId, { showToast: false });
            if (!repairStart.success) {
                toast(`${i18n.executionRepairNodeFailed || 'Failed to start node repair.'} ${repairStart.error || ''}`.trim(), 'error');
                return;
            }

            const waitResult = await waitForRepairCompletion(nodeId, {
                timeoutMs: 180000,
                intervalMs: 5000,
            });
            if (!waitResult.success) {
                if (waitResult.timeout) {
                    toast(i18n.executionRepairRerunWaitTimeout || 'Repair did not finish in time.', 'error');
                } else {
                    toast(`${i18n.executionRepairRerunWaitFailed || 'Repair finished with error.'} ${waitResult.error || ''}`.trim(), 'error');
                }
                return;
            }
        }

        await rerunExecutionChain({
            chainId,
            startNodeId: normalizedStartNodeId,
            chainKey,
        });
    }

    function renderNodeInspector(node) {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        setSelection('node', node.id);
        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-data-list">
                    <div class="builder-data-row"><span>${i18n.nodeType}</span><strong>${node.type || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.status}</span><strong>${node.status || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.role}</span><strong>${formatRole(node.inferredRole || node.currentRole || 'standalone')}</strong></div>
                    <div class="builder-data-row"><span>${i18n.country}</span><strong>${node.country || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.onlineUsers}</span><strong>${node.onlineUsers ?? 0}</strong></div>
                    <div class="builder-data-row"><span>${i18n.ssh}</span><strong>${node.capabilities?.sshConfigured ? (i18n.configured || 'configured') : (i18n.missing || 'missing')}</strong></div>
                </div>
            </div>
        `;
    }

    function renderInspectorEmpty() {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        setSelection(null, null);
        root.innerHTML = `<div class="builder-empty-state"><i class="ti ti-pointer"></i><p>${i18n.loading || 'Select a node or hop.'}</p></div>`;
    }

    function bindDraftInspectorActions(hopId) {
        const form = document.getElementById('builderDraftSettingsForm');
        const deleteButton = document.getElementById('builderDraftDelete');

        if (form) {
            const toggleTransportGroups = () => {
                const selectedTransport = String(form.elements.namedItem('tunnelTransport')?.value || 'tcp').toLowerCase();
                const groups = form.querySelectorAll('[data-transport-group]');
                groups.forEach((group) => {
                    const groupTransports = String(group.getAttribute('data-transport-group') || '')
                        .split(',')
                        .map((item) => item.trim().toLowerCase())
                        .filter(Boolean);
                    const isVisible = groupTransports.includes(selectedTransport);
                    group.hidden = !isVisible;
                });
            };

            const toggleSecurityGroups = () => {
                const selectedSecurity = String(form.elements.namedItem('tunnelSecurity')?.value || 'none').toLowerCase();
                const groups = form.querySelectorAll('[data-security-group]');
                groups.forEach((group) => {
                    const allowed = String(group.getAttribute('data-security-group') || '')
                        .split(',')
                        .map((item) => item.trim().toLowerCase())
                        .filter(Boolean);
                    group.hidden = !allowed.includes(selectedSecurity);
                });
            };

            form.elements.namedItem('tunnelTransport')?.addEventListener('change', toggleTransportGroups);
            form.elements.namedItem('tunnelSecurity')?.addEventListener('change', toggleSecurityGroups);
            toggleTransportGroups();
            toggleSecurityGroups();

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const payload = {
                    name: form.elements.namedItem('name')?.value || '',
                    mode: form.elements.namedItem('mode')?.value || 'reverse',
                    tunnelProtocol: form.elements.namedItem('tunnelProtocol')?.value || 'vless',
                    tunnelTransport: form.elements.namedItem('tunnelTransport')?.value || 'tcp',
                    tunnelSecurity: form.elements.namedItem('tunnelSecurity')?.value || 'none',
                    tunnelPort: form.elements.namedItem('tunnelPort')?.value || '10086',
                    muxEnabled: !!form.elements.namedItem('muxEnabled')?.checked,
                    wsPath: form.elements.namedItem('wsPath')?.value || '',
                    wsHost: form.elements.namedItem('wsHost')?.value || '',
                    grpcServiceName: form.elements.namedItem('grpcServiceName')?.value || '',
                    xhttpPath: form.elements.namedItem('xhttpPath')?.value || '',
                    xhttpHost: form.elements.namedItem('xhttpHost')?.value || '',
                    xhttpMode: form.elements.namedItem('xhttpMode')?.value || 'auto',
                    realityDest: form.elements.namedItem('realityDest')?.value || '',
                    realitySni: form.elements.namedItem('realitySni')?.value || '',
                    realityFingerprint: form.elements.namedItem('realityFingerprint')?.value || 'chrome',
                    realityShortId: form.elements.namedItem('realityShortId')?.value || '',
                    geoRoutingEnabled: !!form.elements.namedItem('geoRoutingEnabled')?.checked,
                    geoDomains: form.elements.namedItem('geoDomains')?.value || '',
                    geoIp: form.elements.namedItem('geoIp')?.value || '',
                };
                try {
                    await requestJson(`/api/cascade-builder/drafts/${encodeURIComponent(hopId)}`, {
                        method: 'PATCH',
                        body: JSON.stringify(payload),
                    });
                    toast(i18n.draftUpdated || 'Draft hop updated.', 'success');
                    await loadState({ selectHopId: hopId });
                } catch (error) {
                    if (error?.data?.validation) {
                        renderValidation(error.data.validation);
                    }
                    toast(`${i18n.draftUpdateFailed || 'Failed to update draft hop'}: ${error.message}`, 'error');
                }
            });
        }

        if (deleteButton) {
            deleteButton.addEventListener('click', async () => {
                try {
                    await requestJson(`/api/cascade-builder/drafts/${encodeURIComponent(hopId)}`, {
                        method: 'DELETE',
                    });
                    toast(i18n.draftRemoved || 'Draft hop removed.', 'success');
                    await loadState();
                } catch (error) {
                    toast(`${i18n.draftRemoveFailed || 'Failed to remove draft hop'}: ${error.message}`, 'error');
                }
            });
        }
    }

    function renderHopInspector(hop) {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        setSelection('hop', hop.id);
        const sourceNode = getNodeById(hop.sourceNodeId);
        const targetNode = getNodeById(hop.targetNodeId);

        if (hop.isDraft) {
            const realitySni = Array.isArray(hop.realitySni)
                ? hop.realitySni.join(', ')
                : String(hop.realitySni || 'www.google.com');
            const realityShortId = String(hop.realityShortId || '');
            const geoDomains = Array.isArray(hop.geoDomains) ? hop.geoDomains.join('\n') : String(hop.geoDomains || '');
            const geoIp = Array.isArray(hop.geoIp) ? hop.geoIp.join('\n') : String(hop.geoIp || '');
            root.innerHTML = `
                <div class="builder-inspector-card">
                    <div class="builder-inspector-head">
                        <strong>${escapeHtml(i18n.draftTag || 'Draft')}</strong>
                        <span class="builder-validation-badge">${escapeHtml(i18n.draftTag || 'Draft')}</span>
                    </div>
                    <div class="builder-data-list">
                        <div class="builder-data-row"><span>${escapeHtml(i18n.source || 'Source')}</span><strong>${escapeHtml(sourceNode?.name || hop.sourceNodeId)}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.target || 'Target')}</span><strong>${escapeHtml(targetNode?.name || hop.targetNodeId)}</strong></div>
                        <div class="builder-data-row"><span>${escapeHtml(i18n.stack || 'Stack')}</span><strong>${escapeHtml(hop.stack || 'unknown')}</strong></div>
                    </div>
                </div>
                <div class="builder-inspector-card">
                    <div class="builder-inspector-head">
                        <strong>${escapeHtml(i18n.draftSettingsTitle || 'Hop settings')}</strong>
                    </div>
                    <form id="builderDraftSettingsForm" class="builder-form">
                        <label class="builder-field">
                            <span>${escapeHtml(i18n.name || 'Name')}</span>
                            <input class="builder-form-control" type="text" name="name" maxlength="120" value="${escapeHtml(hop.name || '')}">
                        </label>
                        <div class="builder-field-grid">
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.mode || 'Mode')}</span>
                                <select class="builder-form-control" name="mode">
                                    ${renderSelectOptions(HOP_MODE_OPTIONS, hop.mode || 'reverse')}
                                </select>
                            </label>
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.protocol || 'Protocol')}</span>
                                <select class="builder-form-control" name="tunnelProtocol">
                                    ${renderSelectOptions(HOP_PROTOCOL_OPTIONS, hop.tunnelProtocol || 'vless')}
                                </select>
                            </label>
                        </div>
                        <div class="builder-field-grid">
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.transport || 'Transport')}</span>
                                <select class="builder-form-control" name="tunnelTransport">
                                    ${renderSelectOptions(HOP_TRANSPORT_OPTIONS, hop.tunnelTransport || 'tcp')}
                                </select>
                            </label>
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.security || 'Security')}</span>
                                <select class="builder-form-control" name="tunnelSecurity">
                                    ${renderSelectOptions(HOP_SECURITY_OPTIONS, hop.tunnelSecurity || 'none')}
                                </select>
                            </label>
                        </div>
                        <div class="builder-field-grid">
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.port || 'Port')}</span>
                                <input class="builder-form-control" type="number" min="1" max="65535" name="tunnelPort" value="${escapeHtml(hop.tunnelPort || 10086)}">
                            </label>
                            <label class="builder-field builder-checkbox-field">
                                <span>${escapeHtml(i18n.mux || 'MUX')}</span>
                                <input type="checkbox" name="muxEnabled" ${hop.muxEnabled ? 'checked' : ''}>
                            </label>
                        </div>
                        <div class="builder-transport-settings" data-transport-group="ws">
                            <div class="builder-transport-title">${escapeHtml(i18n.wsSettings || 'WebSocket')}</div>
                            <div class="builder-field-grid">
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.wsPath || 'WS path')}</span>
                                    <input class="builder-form-control" type="text" name="wsPath" maxlength="256" value="${escapeHtml(hop.wsPath || '/cascade')}">
                                </label>
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.wsHost || 'WS host')}</span>
                                    <input class="builder-form-control" type="text" name="wsHost" maxlength="128" value="${escapeHtml(hop.wsHost || '')}">
                                </label>
                            </div>
                        </div>
                        <div class="builder-transport-settings" data-transport-group="grpc">
                            <div class="builder-transport-title">${escapeHtml(i18n.grpcSettings || 'gRPC')}</div>
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.grpcServiceName || 'Service name')}</span>
                                <input class="builder-form-control" type="text" name="grpcServiceName" maxlength="120" value="${escapeHtml(hop.grpcServiceName || 'cascade')}">
                            </label>
                        </div>
                        <div class="builder-transport-settings" data-transport-group="xhttp,splithttp">
                            <div class="builder-transport-title">${escapeHtml(i18n.xhttpSettings || 'XHTTP')}</div>
                            <div class="builder-field-grid">
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.xhttpPath || 'XHTTP path')}</span>
                                    <input class="builder-form-control" type="text" name="xhttpPath" maxlength="256" value="${escapeHtml(hop.xhttpPath || '/cascade')}">
                                </label>
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.xhttpHost || 'XHTTP host')}</span>
                                    <input class="builder-form-control" type="text" name="xhttpHost" maxlength="128" value="${escapeHtml(hop.xhttpHost || '')}">
                                </label>
                            </div>
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.xhttpMode || 'XHTTP mode')}</span>
                                <select class="builder-form-control" name="xhttpMode">
                                    <option value="auto"${String(hop.xhttpMode || 'auto').toLowerCase() === 'auto' ? ' selected' : ''}>AUTO</option>
                                    <option value="packet-up"${String(hop.xhttpMode || 'auto').toLowerCase() === 'packet-up' ? ' selected' : ''}>PACKET-UP</option>
                                    <option value="stream-up"${String(hop.xhttpMode || 'auto').toLowerCase() === 'stream-up' ? ' selected' : ''}>STREAM-UP</option>
                                    <option value="stream-one"${String(hop.xhttpMode || 'auto').toLowerCase() === 'stream-one' ? ' selected' : ''}>STREAM-ONE</option>
                                </select>
                            </label>
                        </div>
                        <div class="builder-transport-settings" data-security-group="tls,reality">
                            <div class="builder-transport-title">${escapeHtml(i18n.securitySettings || 'Security')}</div>
                            <div class="builder-field-grid">
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.realitySni || 'SNI / server names')}</span>
                                    <input class="builder-form-control" type="text" name="realitySni" maxlength="256" value="${escapeHtml(realitySni)}" placeholder="www.google.com, chat.deepseek.com">
                                </label>
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.realityFingerprint || 'Fingerprint')}</span>
                                    <select class="builder-form-control" name="realityFingerprint">
                                        ${renderSelectOptions(REALITY_FINGERPRINT_OPTIONS, hop.realityFingerprint || 'chrome')}
                                    </select>
                                </label>
                            </div>
                        </div>
                        <div class="builder-transport-settings" data-security-group="reality">
                            <div class="builder-transport-title">${escapeHtml(i18n.realitySettings || 'REALITY')}</div>
                            <div class="builder-field-grid">
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.realityDest || 'Reality dest')}</span>
                                    <input class="builder-form-control" type="text" name="realityDest" maxlength="160" value="${escapeHtml(hop.realityDest || 'www.google.com:443')}">
                                </label>
                                <label class="builder-field">
                                    <span>${escapeHtml(i18n.realityShortId || 'Reality shortId')}</span>
                                    <input class="builder-form-control" type="text" name="realityShortId" maxlength="16" value="${escapeHtml(realityShortId)}" placeholder="26387fbfd98556ca">
                                </label>
                            </div>
                        </div>
                        <div class="builder-transport-settings">
                            <div class="builder-transport-title">${escapeHtml(i18n.policySettings || 'Policy')}</div>
                            <label class="builder-field builder-checkbox-field">
                                <span>${escapeHtml(i18n.geoRouting || 'Geo routing')}</span>
                                <input type="checkbox" name="geoRoutingEnabled" ${hop.geoRoutingEnabled ? 'checked' : ''}>
                            </label>
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.geoDomains || 'Domains')}</span>
                                <textarea class="builder-form-control" name="geoDomains" rows="3" placeholder="google.com&#10;gemini.google.com">${escapeHtml(geoDomains)}</textarea>
                            </label>
                            <label class="builder-field">
                                <span>${escapeHtml(i18n.geoIp || 'GeoIP')}</span>
                                <textarea class="builder-form-control" name="geoIp" rows="2" placeholder="geoip:google&#10;geoip:telegram">${escapeHtml(geoIp)}</textarea>
                            </label>
                        </div>
                        <div class="builder-form-actions">
                            <button class="btn btn-primary btn-sm" type="submit">
                                <i class="ti ti-device-floppy"></i>
                                <span>${escapeHtml(i18n.draftUpdate || 'Save draft settings')}</span>
                            </button>
                            <button class="btn btn-secondary btn-sm" type="button" id="builderDraftDelete">
                                <i class="ti ti-trash"></i>
                                <span>${escapeHtml(i18n.removeDraft || 'Remove draft')}</span>
                            </button>
                        </div>
                    </form>
                </div>
            `;
            bindDraftInspectorActions(hop.id);
            return;
        }

        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-data-list">
                    <div class="builder-data-row"><span>${escapeHtml(i18n.source || 'Source')}</span><strong>${escapeHtml(sourceNode?.name || hop.sourceNodeId)}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.target || 'Target')}</span><strong>${escapeHtml(targetNode?.name || hop.targetNodeId)}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.mode || 'Mode')}</span><strong>${escapeHtml(formatMode(hop.mode))}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.stack || 'Stack')}</span><strong>${escapeHtml(hop.stack || 'unknown')}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.protocol || 'Protocol')}</span><strong>${escapeHtml(hop.tunnelProtocol || '—')}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.transport || 'Transport')}</span><strong>${escapeHtml(hop.tunnelTransport || '—')}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.security || 'Security')}</span><strong>${escapeHtml(hop.tunnelSecurity || '—')}</strong></div>
                    <div class="builder-data-row"><span>${escapeHtml(i18n.status || 'Status')}</span><strong>${escapeHtml(hop.status || '—')}</strong></div>
                </div>
            </div>
        `;
    }

    function renderConnectInspector(payload) {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        setSelection(null, null);
        const suggestion = payload.suggestion || {};
        const validation = payload.validation || {};
        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-data-list">
                    <div class="builder-data-row"><span>${i18n.mode}</span><strong>${formatMode(suggestion.mode || '—')}</strong></div>
                    <div class="builder-data-row"><span>${i18n.stack}</span><strong>${suggestion.stack || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.protocol}</span><strong>${suggestion.tunnelProtocol || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.transport}</span><strong>${suggestion.tunnelTransport || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.security}</span><strong>${suggestion.tunnelSecurity || '—'}</strong></div>
                    <div class="builder-data-row"><span>${i18n.role}</span><strong>${formatRole(suggestion.sourceRole || '—')} -> ${formatRole(suggestion.targetRole || '—')}</strong></div>
                    <div class="builder-data-row"><span>${i18n.requiresHybrid}</span><strong>${formatBoolean(suggestion.requiresHybrid)}</strong></div>
                </div>
            </div>
        `;
        renderValidation(validation);
    }

    function initCy(flow) {
        if (state.cy) {
            state.cy.destroy();
            state.cy = null;
            state.edgehandles = null;
        }

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
            const node = getNodeById(nodeId);
            if (node) renderNodeInspector(node);
        });

        state.cy.on('select', 'edge', (event) => {
            const hopId = event.target.data('hopId');
            const hop = getHopById(hopId);
            if (hop) renderHopInspector(hop);
        });

        state.cy.on('tap', (event) => {
            if (event.target === state.cy) {
                renderInspectorEmpty();
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

    function focusNodeById(nodeId) {
        if (!state.cy) return false;
        const node = getNodeById(nodeId);
        if (!node) return false;
        const nodeEle = state.cy.getElementById(node.id);
        if (!nodeEle.length) return false;
        state.cy.elements().unselect();
        nodeEle.select();
        state.cy.center(nodeEle);
        renderNodeInspector(node);
        return true;
    }

    function focusHopById(hopId) {
        if (!state.cy) return false;
        const hop = getHopById(hopId);
        if (!hop) return false;
        const edgeCollection = state.cy.edges().filter((edge) => String(edge.data('hopId')) === String(hop.id));
        if (!edgeCollection.length) return false;
        state.cy.elements().unselect();
        edgeCollection.first().select();
        state.cy.center(edgeCollection.first());
        renderHopInspector(hop);
        return true;
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
            focusHopById(draftHop.id);
            previewCommitPlan({ silent: true });
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

    async function commitDrafts({ deployAfterCommit = false } = {}) {
        const draftCount = state.flow?.draft?.draftHopCount || 0;
        if (!draftCount) {
            toast(i18n.noDraftsToCommit || 'No draft hops to commit.', 'error');
            return;
        }

        try {
            const result = await requestJson('/api/cascade-builder/commit-drafts', {
                method: 'POST',
                body: JSON.stringify({ deployAfterCommit }),
            });
            renderExecutionResult(result.execution || null);

            const failures = Array.isArray(result.results)
                ? result.results.filter((item) => !item.success)
                : [];
            const deployment = result.deployment || null;
            const deploymentFailures = Array.isArray(deployment?.results)
                ? deployment.results.filter((item) => !item.success)
                : [];

            if (failures.length || deploymentFailures.length) {
                const warningItems = [];
                failures.forEach((item) => {
                    warningItems.push({ message: `${item.name}: ${item.error}` });
                });
                deploymentFailures.forEach((item) => {
                    const label = item.chainId || item.startNodeId;
                    const reason = Array.isArray(item.errors) && item.errors.length
                        ? item.errors.join('; ')
                        : (i18n.chainDeployFailed || 'Chain deploy failed');
                    warningItems.push({ message: `${label}: ${reason}` });
                });
                renderValidation({
                    status: 'warning',
                    errors: [],
                    warnings: warningItems,
                });
                if (deployAfterCommit) {
                    toast(`${i18n.commitAndDeployFailed || 'Commit + deploy finished with issues'}: ${result.committed}`, 'info');
                } else {
                    toast(`${i18n.commitDraftsDone || 'Drafts committed'}: ${result.committed}`, 'info');
                }
            } else {
                if (deployAfterCommit) {
                    const deployedChains = Number(deployment?.deployedChains || 0);
                    toast(`${i18n.commitAndDeployDone || 'Drafts committed and chain deployed'}: ${deployedChains}`, 'success');
                } else {
                    toast(`${i18n.commitDraftsDone || 'Drafts committed'}: ${result.committed}`, 'success');
                }
            }

            await loadState();
        } catch (error) {
            const message = deployAfterCommit
                ? (i18n.commitAndDeployFailed || 'Commit + deploy failed')
                : (i18n.commitDraftsFailed || 'Draft commit failed');
            toast(`${message}: ${error.message}`, 'error');
        }
    }

    async function previewCommitPlan({ silent = false } = {}) {
        try {
            const result = await requestJson('/api/cascade-builder/deploy-preview');
            state.flow.planPreview = result.plan;
            renderCommitPlan(result.plan);
            if (!silent) {
                const blocked = Number(result.plan?.summary?.blockedHops || 0);
                toast(blocked > 0
                    ? (i18n.previewBlocked || 'Preview has blockers')
                    : (i18n.previewReady || 'Preview is ready'), blocked > 0 ? 'info' : 'success');
            }
        } catch (error) {
            renderCommitPlan(null);
            if (!silent) {
                toast(`${i18n.deployPreviewFailed || 'Deploy preview failed'}: ${error.message}`, 'error');
            }
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
                renderExecutionResult(state.flow?.draft?.lastExecution || null);
                renderInspectorEmpty();
                previewCommitPlan({ silent: true });
                toast(i18n.draftsReset || 'Drafts cleared.');
            })
            .catch((error) => {
                toast(`${i18n.resetDraftsFailed || 'Draft reset failed'}: ${error.message}`, 'error');
            });
    }

    async function loadState({ selectHopId = null, selectNodeId = null } = {}) {
        try {
            const flow = await requestJson('/api/cascade-builder/state');
            state.flow = flow;
            renderLibrary(flow);
            renderSummary(flow, flow.validation);
            renderValidation(flow.validation);
            renderExecutionResult(flow?.draft?.lastExecution || null);
            initCy(flow);
            const targetHopId = selectHopId || (state.selection.type === 'hop' ? state.selection.id : null);
            const targetNodeId = selectNodeId || (state.selection.type === 'node' ? state.selection.id : null);
            const restored = (targetHopId && focusHopById(targetHopId))
                || (targetNodeId && focusNodeById(targetNodeId));
            if (!restored) {
                renderInspectorEmpty();
            }
            await previewCommitPlan({ silent: true });
        } catch (error) {
            toast(`${i18n.stateFailed || 'State load failed'}: ${error.message}`, 'error');
        }
    }

    function bindUi() {
        document.getElementById('builderValidate')?.addEventListener('click', validateCurrentDraft);
        document.getElementById('builderSaveLayout')?.addEventListener('click', saveLayout);
        document.getElementById('builderCommitDrafts')?.addEventListener('click', () => commitDrafts());
        document.getElementById('builderCommitDeploy')?.addEventListener('click', () => commitDrafts({ deployAfterCommit: true }));
        document.getElementById('builderDeployPreview')?.addEventListener('click', () => previewCommitPlan());
        document.getElementById('builderResetDrafts')?.addEventListener('click', resetDrafts);
        document.getElementById('builderExecutionCopyText')?.addEventListener('click', () => copyExecutionDiagnosticsText());
        document.getElementById('builderExecutionCopyFailedOnly')?.addEventListener('click', () => copyExecutionDiagnosticsFailedCompact());
        document.getElementById('builderExecutionCopyFailedJson')?.addEventListener('click', () => copyExecutionDiagnosticsFailedJson());
        document.getElementById('builderExecutionCopyJson')?.addEventListener('click', () => copyExecutionDiagnosticsJson());
        document.getElementById('builderExecutionRerunFailed')?.addEventListener('click', () => rerunFailedExecutionChains());
        document.getElementById('builderExecutionList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-execution-action]');
            if (!button) return;
            const action = String(button.getAttribute('data-execution-action') || '').trim();
            if (action === 'focus-node') {
                const startNodeId = String(button.getAttribute('data-start-node-id') || '').trim();
                if (!startNodeId || !focusNodeById(startNodeId)) {
                    toast(i18n.executionFocusNodeFailed || 'Unable to focus start node.', 'error');
                }
                return;
            }
            if (action === 'focus-hop') {
                const hopId = String(button.getAttribute('data-hop-id') || '').trim();
                if (!hopId || !focusHopById(hopId)) {
                    toast(i18n.executionFocusHopFailed || 'Unable to focus hop.', 'error');
                }
                return;
            }
            if (action === 'rerun-chain') {
                rerunExecutionChain({
                    chainId: String(button.getAttribute('data-chain-id') || '').trim(),
                    startNodeId: String(button.getAttribute('data-start-node-id') || '').trim(),
                    chainKey: String(button.getAttribute('data-chain-key') || '').trim(),
                });
                return;
            }
            if (action === 'repair-node') {
                repairExecutionNode(String(button.getAttribute('data-node-id') || '').trim());
                return;
            }
            if (action === 'repair-rerun-chain') {
                repairAndRerunExecutionChain({
                    nodeId: String(button.getAttribute('data-node-id') || '').trim(),
                    chainId: String(button.getAttribute('data-chain-id') || '').trim(),
                    startNodeId: String(button.getAttribute('data-start-node-id') || '').trim(),
                    chainKey: String(button.getAttribute('data-chain-key') || '').trim(),
                });
                return;
            }
            if (action === 'repair-hop-nodes') {
                repairHopNodesAndRerun({
                    sourceNodeId: String(button.getAttribute('data-hop-source-node-id') || '').trim(),
                    targetNodeId: String(button.getAttribute('data-hop-target-node-id') || '').trim(),
                    chainId: String(button.getAttribute('data-chain-id') || '').trim(),
                    startNodeId: String(button.getAttribute('data-start-node-id') || '').trim(),
                    chainKey: String(button.getAttribute('data-chain-key') || '').trim(),
                });
            }
        });
        document.getElementById('builderExecutionFilterGroup')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-execution-filter]');
            if (!button) return;
            const nextFilter = normalizeExecutionFilter(button.getAttribute('data-execution-filter'));
            if (nextFilter === state.executionFilter) return;
            state.executionFilter = nextFilter;
            syncExecutionFilterUi(state.execution);
            renderExecutionResult(state.execution);
        });
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

        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
                if (mutations.some((mutation) => mutation.attributeName === 'data-theme')) {
                    syncCyTheme();
                }
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindUi();
        loadState();
    });
})();
