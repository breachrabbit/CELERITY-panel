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
        edgeDrawActive: false,
        edgeDrawSession: null,
        edgeFlowTimer: null,
        edgeFlowOffset: 0,
        execution: null,
        executionReruns: {},
        executionFilter: 'all',
        connectIntent: null,
        connectInFlight: false,
        lastConnectSignature: '',
        lastConnectAt: 0,
        connectFallbackEnabled: false,
        tooltipHideTimer: null,
        confirmResolver: null,
        confirmOpen: false,
        isFullscreen: false,
        selection: { type: null, id: null },
    };
    const HOP_MODE_OPTIONS = ['reverse', 'forward'];
    const HOP_PROTOCOL_OPTIONS = ['vless', 'vmess'];
    const HOP_TRANSPORT_OPTIONS = ['tcp', 'ws', 'grpc', 'xhttp', 'splithttp'];
    const HOP_SECURITY_OPTIONS = ['none', 'tls', 'reality'];
    const REALITY_FINGERPRINT_OPTIONS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'randomized'];
    const INTERNET_NODE_ID = '__internet__';
    const BUILDER_NODE_WIDTH = 156;
    const BUILDER_PORT_OFFSET = 0;

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

    function getBuilderWorkspaceElement() {
        return document.querySelector('.builder-workspace');
    }

    function getBuilderErrorTooltipElement() {
        return document.getElementById('builderErrorTooltip');
    }

    function hideBuilderErrorTooltip() {
        const tooltip = getBuilderErrorTooltipElement();
        if (!tooltip) return;
        if (state.tooltipHideTimer) {
            clearTimeout(state.tooltipHideTimer);
            state.tooltipHideTimer = null;
        }
        tooltip.classList.remove('is-visible');
        tooltip.innerHTML = '';
    }

    function showBuilderErrorTooltip(message, hint = '') {
        const tooltip = getBuilderErrorTooltipElement();
        if (!tooltip) return;
        if (state.tooltipHideTimer) {
            clearTimeout(state.tooltipHideTimer);
            state.tooltipHideTimer = null;
        }
        tooltip.innerHTML = `
            <strong>${escapeHtml(message || t('connectFailed', 'Connect failed'))}</strong>
            ${hint ? `<span>${escapeHtml(hint)}</span>` : ''}
        `;
        tooltip.classList.add('is-visible');
        state.tooltipHideTimer = setTimeout(() => {
            hideBuilderErrorTooltip();
        }, 6200);
    }

    function getBuilderConfirmElements() {
        return {
            overlay: document.getElementById('builderConfirmOverlay'),
            title: document.getElementById('builderConfirmTitle'),
            text: document.getElementById('builderConfirmText'),
            ok: document.getElementById('builderConfirmOk'),
            cancel: document.getElementById('builderConfirmCancel'),
        };
    }

    function closeBuilderConfirm(result = false) {
        const { overlay, ok } = getBuilderConfirmElements();
        if (overlay) {
            overlay.classList.remove('is-visible');
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (ok) ok.classList.remove('is-danger');
        state.confirmOpen = false;
        const resolver = state.confirmResolver;
        state.confirmResolver = null;
        if (typeof resolver === 'function') resolver(Boolean(result));
    }

    function openBuilderConfirm({
        title = '',
        text = '',
        confirmLabel = '',
        cancelLabel = '',
        danger = false,
    } = {}) {
        const { overlay, title: titleNode, text: textNode, ok, cancel } = getBuilderConfirmElements();
        if (!overlay || !ok || !cancel || !titleNode || !textNode) {
            const fallbackMessage = [title, text].filter(Boolean).join('\n');
            if (window.hrConfirm) {
                return window.hrConfirm(fallbackMessage || (i18n.confirmDefaultText || 'Proceed?'), {
                    title: title || (i18n.confirmDefaultTitle || 'Confirm action'),
                    confirmText: confirmLabel || (i18n.confirmOk || 'Confirm'),
                    cancelText: cancelLabel || (i18n.confirmCancel || 'Cancel'),
                });
            }
            return Promise.resolve(false);
        }

        titleNode.textContent = String(title || i18n.confirmDefaultTitle || 'Confirm action');
        textNode.textContent = String(text || i18n.confirmDefaultText || 'Are you sure you want to continue?');
        ok.textContent = String(confirmLabel || i18n.confirmOk || 'Confirm');
        cancel.textContent = String(cancelLabel || i18n.confirmCancel || 'Cancel');
        ok.classList.toggle('is-danger', Boolean(danger));

        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');
        state.confirmOpen = true;
        setTimeout(() => {
            ok.focus();
        }, 10);

        return new Promise((resolve) => {
            state.confirmResolver = resolve;
        });
    }

    function isNativeFullscreenActive() {
        return Boolean(
            document.fullscreenElement
            || document.webkitFullscreenElement
            || document.msFullscreenElement,
        );
    }

    function syncFullscreenToggleUi(shouldEnable) {
        const workspace = getBuilderWorkspaceElement();
        const toggleButton = document.getElementById('builderFullscreenToggle');
        if (workspace) {
            workspace.classList.toggle('is-fullscreen', shouldEnable);
        }
        document.body.classList.toggle('builder-fullscreen-active', shouldEnable);
        if (toggleButton) {
            toggleButton.classList.toggle('is-active', shouldEnable);
            const icon = toggleButton.querySelector('i');
            const text = toggleButton.querySelector('span');
            if (icon) {
                icon.className = shouldEnable ? 'ti ti-arrows-minimize' : 'ti ti-arrows-maximize';
            }
            if (text) {
                text.textContent = shouldEnable
                    ? (i18n.fullscreenDisable || 'Exit full screen')
                    : (i18n.fullscreenEnable || 'Full screen');
            }
        }
    }

    function resizeBuilderCanvas() {
        requestAnimationFrame(() => {
            if (!state.cy) return;
            state.cy.resize();
            fitRealGraphView(56);
            syncInternetNodePosition();
            syncAllNodePorts();
        });
    }

    async function setBuilderFullscreen(enabled) {
        const shouldEnable = Boolean(enabled);
        const workspace = getBuilderWorkspaceElement();
        if (!workspace) return;

        state.isFullscreen = shouldEnable;
        syncFullscreenToggleUi(shouldEnable);

        if (shouldEnable) {
            if (!isNativeFullscreenActive() && typeof workspace.requestFullscreen === 'function') {
                try {
                    await workspace.requestFullscreen();
                } catch (_) {
                    // Browser denied fullscreen. Keep scoped fallback mode.
                }
            }
        } else if (isNativeFullscreenActive() && typeof document.exitFullscreen === 'function') {
            try {
                await document.exitFullscreen();
            } catch (_) {
                // Fallback layout toggle is still applied above.
            }
        }

        resizeBuilderCanvas();
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
                portBackground: '#0f183f',
                portBorder: '#7dd3fc',
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
            portBackground: '#ffffff',
            portBorder: '#6b7280',
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
                selector: 'node[isPort != 1]',
                style: {
                    'shape': 'round-rectangle',
                    'width': BUILDER_NODE_WIDTH,
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
                selector: 'node[isPort != 1][nodeType = "xray"]',
                style: {
                    'background-color': palette.nodeXrayBackground,
                    'border-color': palette.nodeXrayBorder,
                },
            },
            {
                selector: 'node[isPort != 1][nodeType = "hysteria"]',
                style: {
                    'background-color': palette.nodeHysteriaBackground,
                    'border-color': palette.nodeHysteriaBorder,
                },
            },
            {
                selector: 'node[isPort != 1][isVirtualInternet = 1]',
                style: {
                    'shape': 'round-octagon',
                    'width': 132,
                    'height': 132,
                    'background-color': isDarkTheme() ? '#0f183f' : '#ffffff',
                    'border-color': '#02A8AD',
                    'border-style': 'dashed',
                    'border-width': 2,
                    'font-size': 13,
                    'font-weight': 700,
                    'text-max-width': '100px',
                    'padding': '8px',
                },
            },
            {
                selector: 'node[isPort != 1][status = "online"]',
                style: {
                    'border-width': 2,
                    'shadow-blur': 14,
                    'shadow-color': '#08C5CB',
                    'shadow-opacity': 0.18,
                },
            },
            {
                selector: 'node[isPort != 1][isInternetExit = 1]',
                style: {
                    'border-color': '#02A8AD',
                    'border-width': 2,
                    'shadow-blur': 18,
                    'shadow-color': '#02A8AD',
                    'shadow-opacity': 0.2,
                },
            },
            {
                selector: 'node[isPort != 1]:selected',
                style: {
                    'border-color': '#08C5CB',
                    'border-width': 2,
                    'shadow-blur': 20,
                    'shadow-color': '#08C5CB',
                    'shadow-opacity': 0.22,
                },
            },
            {
                selector: 'node[isPort = 1]',
                style: {
                    'shape': 'ellipse',
                    'width': 16,
                    'height': 16,
                    'background-color': palette.portBackground,
                    'border-width': 2,
                    'border-style': 'solid',
                    'border-color': palette.portBorder,
                    'label': '',
                    'text-opacity': 0,
                    'overlay-opacity': 0,
                    'z-index': 9999,
                },
            },
            {
                selector: 'node[isPort = 1][isInternetExitPort = 1][portType = "out"]',
                style: {
                    'border-color': '#02A8AD',
                    'border-width': 3,
                    'background-color': '#d9fbfc',
                },
            },
            {
                selector: 'node[isPort = 1].eh-source, node[isPort = 1].eh-target, node[isPort = 1].eh-hover',
                style: {
                    'border-color': '#08C5CB',
                    'border-width': 3,
                    'background-color': '#ffffff',
                },
            },
            {
                selector: 'node[isPort = 1].builder-connect-source',
                style: {
                    'border-color': '#02A8AD',
                    'border-width': 3,
                    'background-color': '#ffffff',
                    'shadow-blur': 8,
                    'shadow-opacity': 0.32,
                    'shadow-color': '#08C5CB',
                },
            },
            {
                selector: 'edge',
                style: {
                    'curve-style': 'unbundled-bezier',
                    'source-endpoint': 'outside-to-node',
                    'target-endpoint': 'outside-to-node',
                    'edge-distances': 'endpoints',
                    'control-point-distances': 'data(curveDistance)',
                    'control-point-weights': 'data(curveWeight)',
                    'width': 4,
                    'line-color': palette.edgeColor,
                    'target-arrow-color': palette.edgeColor,
                    'target-arrow-shape': 'vee',
                    'arrow-scale': 0.94,
                    'line-style': 'solid',
                    'overlay-opacity': 0,
                    'line-cap': 'round',
                    'line-join': 'round',
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
                selector: 'edge[status = "online"], edge[status = "active"], edge[status = "deployed"]',
                style: {
                    'line-color': '#08C5CB',
                    'target-arrow-color': '#08C5CB',
                },
            },
            {
                selector: 'edge[status = "pending"]',
                style: {
                    'line-color': '#7c8db4',
                    'target-arrow-color': '#7c8db4',
                    'line-style': 'dashed',
                    'line-dash-pattern': [9, 8],
                },
            },
            {
                selector: 'edge[status = "offline"], edge[status = "failed"], edge[status = "error"]',
                style: {
                    'line-color': '#ef4444',
                    'target-arrow-color': '#ef4444',
                    'line-style': 'dashed',
                    'line-dash-pattern': [10, 8],
                    'width': 3,
                },
            },
            {
                selector: 'edge[isDraft = 1]',
                style: {
                    'line-style': 'dashed',
                    'line-color': '#08C5CB',
                    'target-arrow-color': '#08C5CB',
                    'width': 3,
                    'line-dash-pattern': [11, 9],
                },
            },
            {
                selector: 'edge[isVirtualInternet = 1]',
                style: {
                    'line-style': 'dashed',
                    'curve-style': 'unbundled-bezier',
                    'source-endpoint': 'outside-to-node',
                    'target-endpoint': 'outside-to-node',
                    'edge-distances': 'endpoints',
                    'control-point-distances': 'data(curveDistance)',
                    'control-point-weights': 'data(curveWeight)',
                    'line-color': '#02A8AD',
                    'target-arrow-color': '#02A8AD',
                    'target-arrow-shape': 'vee',
                    'arrow-scale': 0.72,
                    'width': 2,
                    'label': '',
                    'text-opacity': 0,
                    'z-index': 2,
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
                selector: 'edge.builder-flow-animated',
                style: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [12, 10],
                    'line-dash-offset': 'data(flowOffset)',
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
                    'width': 0.001,
                    'opacity': 0,
                    'target-arrow-shape': 'none',
                },
            },
        ];
    }

    function syncCyTheme() {
        if (!state.cy) return;
        state.cy.style(getBuilderStyle());
        syncAllNodePorts();
        syncEdgeFlowAnimation();
        state.cy.resize();
    }

    function buildNodeLabel(node, { isInternetExit = false } = {}) {
        const prefix = node.flag ? `${node.flag} ` : '';
        const name = `${prefix}${node.name}`;
        if (!isInternetExit) return name;
        return `${name}\n↗ ${t('internetNodeLabel', 'Internet')}`;
    }

    function buildPortId(nodeId, portType) {
        return `${String(nodeId)}:port:${String(portType)}`;
    }

    function getPortPositionFromRaw(position, portType) {
        const baseX = Number(position?.x) || 0;
        const baseY = Number(position?.y) || 0;
        const delta = (BUILDER_NODE_WIDTH / 2) + BUILDER_PORT_OFFSET;
        const direction = String(portType) === 'out' ? 1 : -1;
        return {
            x: baseX + (direction * delta),
            y: baseY,
        };
    }

    function getFlowDegreeMap(flow) {
        const degreeByNodeId = new Map();
        (flow?.nodes || []).forEach((node) => {
            degreeByNodeId.set(String(node.id), { incoming: 0, outgoing: 0 });
        });

        (flow?.hops || []).forEach((hop) => {
            const sourceId = String(hop.sourceNodeId || '');
            const targetId = String(hop.targetNodeId || '');
            if (degreeByNodeId.has(sourceId)) {
                const stats = degreeByNodeId.get(sourceId);
                stats.outgoing += 1;
            }
            if (degreeByNodeId.has(targetId)) {
                const stats = degreeByNodeId.get(targetId);
                stats.incoming += 1;
            }
        });

        return degreeByNodeId;
    }

    function getFlowExitNodeIds(flow) {
        const degreeByNodeId = getFlowDegreeMap(flow);
        return (flow?.nodes || [])
            .filter((node) => {
                const stats = degreeByNodeId.get(String(node.id));
                if (!stats) return false;
                const connected = (stats.incoming + stats.outgoing) > 0;
                return connected && stats.outgoing === 0;
            })
            .map((node) => String(node.id));
    }

    function getFlowInternetNodeData(flow) {
        const nodes = Array.isArray(flow?.nodes) ? flow.nodes : [];
        if (!nodes.length) return null;
        const exitNodeIds = getFlowExitNodeIds(flow);

        return {
            id: INTERNET_NODE_ID,
            label: t('internetNodeLabel', 'Internet'),
            position: { x: 0, y: 0 },
            exitNodeIds,
        };
    }

    function isPortElement(element) {
        if (!element || !element.length) return false;
        return Number(element.data('isPort')) === 1;
    }

    function resolveConnectEndpoint(element) {
        if (!element || !element.length) {
            return {
                ownerNodeId: '',
                isPort: false,
                portType: '',
                isVirtualInternet: false,
            };
        }
        const isPort = Number(element.data('isPort')) === 1;
        if (isPort) {
            const ownerNodeId = String(element.data('ownerNodeId') || '').trim();
            const isVirtualInternet = ownerNodeId === INTERNET_NODE_ID
                || Number(element.data('isVirtualInternet')) === 1
                || Number(element.data('isInternetPort')) === 1;
            return {
                ownerNodeId,
                isPort: true,
                portType: String(element.data('portType') || '').trim().toLowerCase(),
                isVirtualInternet,
            };
        }
        return {
            ownerNodeId: String(element.id() || '').trim(),
            isPort: false,
            portType: '',
            isVirtualInternet: Number(element.data('isVirtualInternet')) === 1,
        };
    }

    function clearConnectIntent() {
        if (state.cy && state.connectIntent?.sourcePortId) {
            const sourcePort = state.cy.getElementById(state.connectIntent.sourcePortId);
            if (sourcePort.length) {
                sourcePort.removeClass('builder-connect-source');
            }
        }
        state.connectIntent = null;
    }

    function setConnectIntent(sourceNodeId, sourcePortId) {
        clearConnectIntent();
        const nodeId = String(sourceNodeId || '').trim();
        const portId = String(sourcePortId || '').trim();
        if (!nodeId || !portId) return;
        state.connectIntent = {
            sourceNodeId: nodeId,
            sourcePortId: portId,
        };
        if (state.cy) {
            const sourcePort = state.cy.getElementById(portId);
            if (sourcePort.length) {
                sourcePort.addClass('builder-connect-source');
            }
        }
        toast(i18n.connectPickTarget || 'Select target node to create draft hop.');
    }

    function getPortPositionFromNodeElement(nodeElement, portType) {
        const width = Number(nodeElement.width()) || BUILDER_NODE_WIDTH;
        const delta = (width / 2) + BUILDER_PORT_OFFSET;
        const direction = String(portType) === 'out' ? 1 : -1;
        const position = nodeElement.position();
        return {
            x: Number(position?.x || 0) + (direction * delta),
            y: Number(position?.y || 0),
        };
    }

    function syncNodePorts(nodeId) {
        if (!state.cy) return;
        const ownerId = String(nodeId || '').trim();
        if (!ownerId) return;
        const ownerNode = state.cy.getElementById(ownerId);
        if (!ownerNode.length) return;
        ['in', 'out'].forEach((portType) => {
            const portNode = state.cy.getElementById(buildPortId(ownerId, portType));
            if (!portNode.length) return;
            portNode.position(getPortPositionFromNodeElement(ownerNode, portType));
        });
    }

    function syncAllNodePorts() {
        if (!state.cy) return;
        state.cy.nodes('[isPort != 1]').forEach((node) => syncNodePorts(node.id()));
    }

    function cleanupTransientBuilderEdges() {
        if (!state.cy) return;
        const staleEdges = state.cy.edges().filter((edge) => {
            const isTransientClass = edge.hasClass('eh-preview')
                || edge.hasClass('eh-ghost-edge')
                || edge.hasClass('eh-ghost')
                || edge.hasClass('eh-temp');
            if (isTransientClass) return true;
            const isVirtualInternet = Number(edge.data('isVirtualInternet')) === 1;
            const hopId = String(edge.data('hopId') || '').trim();
            return !isVirtualInternet && !hopId;
        });
        if (staleEdges.length) staleEdges.remove();
    }

    function scheduleTransientEdgeCleanup() {
        if (!state.cy) return;
        requestAnimationFrame(() => {
            cleanupTransientBuilderEdges();
        });
    }

    function syncInternetNodePosition() {
        if (!state.cy || !state.flow) return;
        const internetNode = state.cy.getElementById(INTERNET_NODE_ID);
        if (!internetNode.length) return;

        const width = Number(state.cy.width() || 0);
        const height = Number(state.cy.height() || 0);
        if (!width || !height) return;
        const pan = state.cy.pan();
        const zoom = state.cy.zoom() || 1;
        const viewX = Math.max(160, width - 110);
        const viewY = Math.max(130, Math.min(height - 130, height * 0.5));
        const modelX = (viewX - Number(pan?.x || 0)) / zoom;
        const modelY = (viewY - Number(pan?.y || 0)) / zoom;

        internetNode.position({
            x: modelX,
            y: modelY,
        });
        syncNodePorts(INTERNET_NODE_ID);
    }

    function fitRealGraphView(padding = 48) {
        if (!state.cy) return;
        const fitCollection = state.cy.elements().filter((element) => (
            (element.isEdge() && Number(element.data('isVirtualInternet')) !== 1)
            || (Number(element.data('isPort')) !== 1 && Number(element.data('isVirtualInternet')) !== 1)
        ));
        if (fitCollection.length) {
            state.cy.fit(fitCollection, padding);
            return;
        }
        state.cy.fit(undefined, padding);
    }

    function stopEdgeFlowAnimation() {
        if (!state.edgeFlowTimer) return;
        clearInterval(state.edgeFlowTimer);
        state.edgeFlowTimer = null;
    }

    function syncEdgeFlowAnimation() {
        if (!state.cy) return;
        const animatedEdges = state.cy.edges().filter((edge) => (
            Number(edge.data('isVirtualInternet')) === 1
            || ['online', 'active', 'deployed'].includes(String(edge.data('status') || '').toLowerCase())
        ));
        state.cy.edges().removeClass('builder-flow-animated');
        if (!animatedEdges.length) {
            stopEdgeFlowAnimation();
            return;
        }

        animatedEdges.addClass('builder-flow-animated');
        state.edgeFlowOffset = 0;
        state.cy.batch(() => {
            animatedEdges.forEach((edge) => edge.data('flowOffset', 0));
        });

        if (state.edgeFlowTimer) return;
        state.edgeFlowTimer = setInterval(() => {
            if (!state.cy) {
                stopEdgeFlowAnimation();
                return;
            }
            state.edgeFlowOffset = (state.edgeFlowOffset - 2);
            const edges = state.cy.edges('.builder-flow-animated');
            if (!edges.length) return;
            state.cy.batch(() => {
                edges.forEach((edge) => edge.data('flowOffset', state.edgeFlowOffset));
            });
        }, 90);
    }

    function runAutoLayout({ animate = true } = {}) {
        if (!state.cy) return;
        const layoutCollection = state.cy.elements().filter((element) => (
            (element.isEdge() && Number(element.data('isVirtualInternet')) !== 1)
            || (Number(element.data('isPort')) !== 1 && Number(element.data('isVirtualInternet')) !== 1)
        ));
        state.cy.one('layoutstop', () => {
            syncAllNodePorts();
            syncInternetNodePosition();
            fitRealGraphView(48);
        });
        layoutCollection.layout({
            name: 'dagre',
            rankDir: 'LR',
            nodeSep: 48,
            rankSep: 96,
            animate,
            animationDuration: animate ? 320 : 0,
        }).run();
    }

    function buildHopCurveMap(hops) {
        const buckets = new Map();
        const reverseCounts = new Map();

        (hops || []).forEach((hop) => {
            const sourceNodeId = String(hop.sourceNodeId || '').trim();
            const targetNodeId = String(hop.targetNodeId || '').trim();
            const hopId = String(hop.id || '').trim();
            if (!sourceNodeId || !targetNodeId || !hopId) return;
            const key = `${sourceNodeId}->${targetNodeId}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(hop);
        });

        buckets.forEach((list, key) => {
            const [sourceNodeId, targetNodeId] = key.split('->');
            const reverseKey = `${targetNodeId}->${sourceNodeId}`;
            reverseCounts.set(key, (buckets.get(reverseKey) || []).length);
            if (!Array.isArray(list) || !list.length) return;
            list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
        });

        const curveByHopId = new Map();
        buckets.forEach((list, key) => {
            const [sourceNodeId, targetNodeId] = key.split('->');
            const reverseCount = Number(reverseCounts.get(key) || 0);
            const centerIndex = (list.length - 1) / 2;
            const reverseBias = reverseCount > 0
                ? ((sourceNodeId.localeCompare(targetNodeId) <= 0) ? -22 : 22)
                : 0;

            list.forEach((hop, index) => {
                const hopId = String(hop.id || '').trim();
                if (!hopId) return;
                const fanOffset = (index - centerIndex) * 28;
                let curveDistance = fanOffset + reverseBias;
                if (Math.abs(curveDistance) < 6) curveDistance = 0;
                curveByHopId.set(hopId, {
                    curveDistance,
                    curveWeight: 0.5,
                });
            });
        });

        return curveByHopId;
    }

    function flowToElements(flow) {
        const elements = [];
        const exitNodeIds = getFlowExitNodeIds(flow);
        const exitNodeIdSet = new Set(exitNodeIds.map((id) => String(id)));
        const internetNode = getFlowInternetNodeData(flow);
        const curveByHopId = buildHopCurveMap(flow?.hops || []);

        for (const node of flow.nodes) {
            const isInternetExit = exitNodeIdSet.has(String(node.id));
            elements.push({
                group: 'nodes',
                data: {
                    id: node.id,
                    label: buildNodeLabel(node, { isInternetExit }),
                    nodeType: node.type,
                    status: node.status,
                    isPort: 0,
                    isInternetExit: isInternetExit ? 1 : 0,
                },
                position: node.position || undefined,
            });
            elements.push({
                group: 'nodes',
                data: {
                    id: buildPortId(node.id, 'in'),
                    label: '',
                    isPort: 1,
                    ownerNodeId: node.id,
                    portType: 'in',
                },
                position: getPortPositionFromRaw(node.position, 'in'),
                grabbable: false,
                selectable: false,
            });
            elements.push({
                group: 'nodes',
                data: {
                    id: buildPortId(node.id, 'out'),
                    label: '',
                    isPort: 1,
                    ownerNodeId: node.id,
                    portType: 'out',
                    isInternetExitPort: isInternetExit ? 1 : 0,
                },
                position: getPortPositionFromRaw(node.position, 'out'),
                grabbable: false,
                selectable: false,
            });
        }

        if (internetNode) {
            elements.push({
                group: 'nodes',
                data: {
                    id: internetNode.id,
                    label: internetNode.label,
                    isPort: 0,
                    isVirtualInternet: 1,
                    nodeType: 'internet',
                    status: 'online',
                },
                position: internetNode.position,
                grabbable: false,
                selectable: true,
            });
            elements.push({
                group: 'nodes',
                data: {
                    id: buildPortId(INTERNET_NODE_ID, 'in'),
                    label: '',
                    isPort: 1,
                    ownerNodeId: INTERNET_NODE_ID,
                    portType: 'in',
                    isVirtualInternet: 1,
                    isInternetPort: 1,
                },
                position: getPortPositionFromRaw(internetNode.position, 'in'),
                grabbable: false,
                selectable: false,
            });
        }

        for (const hop of flow.hops) {
            const curve = curveByHopId.get(String(hop.id || '')) || { curveDistance: 0, curveWeight: 0.5 };
            elements.push({
                group: 'edges',
                data: {
                    id: hop.edgeId || hop.id,
                    hopId: hop.id,
                    source: buildPortId(hop.sourceNodeId, 'out'),
                    target: buildPortId(hop.targetNodeId, 'in'),
                    label: hop.isDraft ? (i18n.draftTag || 'Draft') : `${hop.mode.toUpperCase()} · ${hop.stack.toUpperCase()}`,
                    status: hop.status,
                    isDraft: hop.isDraft ? 1 : 0,
                    curveDistance: curve.curveDistance,
                    curveWeight: curve.curveWeight,
                },
            });
        }

        if (internetNode) {
            internetNode.exitNodeIds.forEach((nodeId) => {
                const sourceNodeId = String(nodeId || '').trim();
                if (!sourceNodeId || !exitNodeIdSet.has(sourceNodeId)) return;
                elements.push({
                    group: 'edges',
                    data: {
                        id: `internet:${sourceNodeId}`,
                        source: buildPortId(sourceNodeId, 'out'),
                        target: buildPortId(INTERNET_NODE_ID, 'in'),
                        isVirtualInternet: 1,
                        status: 'online',
                        flowOffset: 0,
                        curveDistance: 18,
                        curveWeight: 0.48,
                    },
                    selectable: false,
                });
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

    function renderInternetSection(flow) {
        const list = document.getElementById('builderInternetList');
        const badge = document.getElementById('builderInternetBadge');
        if (!list || !badge) return;

        const nodesById = new Map((flow?.nodes || []).map((node) => [String(node.id), node]));
        const exitNodeIds = getFlowExitNodeIds(flow);
        badge.textContent = String(exitNodeIds.length || 0);

        if (!exitNodeIds.length) {
            list.innerHTML = `<p class="builder-validation-empty">${escapeHtml(i18n.internetNoExits || 'No Internet exit nodes yet. Build at least one chain first.')}</p>`;
            return;
        }

        list.innerHTML = exitNodeIds.map((nodeId) => {
            const node = nodesById.get(String(nodeId));
            return `
                <button type="button" class="builder-validation-item builder-internet-item" data-internet-exit-node="${escapeHtml(nodeId)}">
                    <strong>${escapeHtml(node?.name || nodeId)}</strong>
                    <span>${escapeHtml(i18n.internetExitPath || 'Traffic exits to Internet from this node')}</span>
                </button>
            `;
        }).join('');
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

    function focusValidationContext(item) {
        if (!item || typeof item !== 'object') return false;
        const hopId = String(item.hopId || '').trim();
        if (hopId && focusHopById(hopId)) return true;
        const nodeId = String(item.nodeId || '').trim();
        if (nodeId && focusNodeById(nodeId)) return true;
        return false;
    }

    function getNodeDisplayName(nodeId) {
        const targetId = String(nodeId || '').trim();
        if (!targetId) return '';
        const node = Array.isArray(state.flow?.nodes)
            ? state.flow.nodes.find((item) => String(item.id) === targetId)
            : null;
        return String(node?.name || targetId);
    }

    function renderValidation(validation) {
        const box = document.getElementById('builderValidationList');
        if (!box) return;
        const errors = Array.isArray(validation?.errors) ? validation.errors : [];
        const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
        const items = [];

        errors.forEach((item) => items.push({
            kind: 'error',
            text: item?.message || (i18n.validateError || 'Error'),
            code: item?.code || '',
            hopId: item?.hopId || '',
            nodeId: item?.nodeId || '',
        }));
        warnings.forEach((item) => items.push({
            kind: 'warning',
            text: item?.message || (i18n.validateWarning || 'Warning'),
            code: item?.code || '',
            hopId: item?.hopId || '',
            nodeId: item?.nodeId || '',
        }));

        box.innerHTML = '';
        if (!items.length) {
            box.innerHTML = `<p class="builder-validation-empty">${i18n.noIssues || 'No issues detected yet.'}</p>`;
            return;
        }

        const overview = document.createElement('div');
        overview.className = 'builder-validation-overview';
        overview.innerHTML = `
            <span>${escapeHtml(i18n.validationErrorsShort || 'Errors')}: <strong>${errors.length}</strong></span>
            <span>${escapeHtml(i18n.validationWarningsShort || 'Warnings')}: <strong>${warnings.length}</strong></span>
        `;
        box.appendChild(overview);

        items.forEach((item) => {
            const hasContext = Boolean(String(item.hopId || '').trim() || String(item.nodeId || '').trim());
            const el = document.createElement(hasContext ? 'button' : 'div');
            el.className = `builder-validation-item ${item.kind}${hasContext ? ' builder-validation-focus-item' : ''}`;
            if (hasContext) {
                el.type = 'button';
            }

            const details = [];
            if (item.code) {
                details.push(`${i18n.validationCodePrefix || 'Code'}: ${item.code}`);
            }
            if (item.hopId) {
                const hop = getHopById(item.hopId);
                const hopLabel = getHopDisplayName(hop) || String(item.hopId);
                details.push(`${i18n.validationHopPrefix || 'Hop'}: ${hopLabel}`);
            } else if (item.nodeId) {
                details.push(`${i18n.validationNodePrefix || 'Node'}: ${getNodeDisplayName(item.nodeId)}`);
            }
            if (details.length) {
                details.push(i18n.validationClickHint || 'Click to focus context');
            }

            el.innerHTML = `
                <strong>${escapeHtml(item.text)}</strong>
                ${details.length ? `<span>${escapeHtml(details.join(' · '))}</span>` : ''}
            `;
            if (hasContext) {
                el.addEventListener('click', () => {
                    const focused = focusValidationContext(item);
                    if (!focused) {
                        toast(i18n.validationFocusFailed || 'Unable to focus validation context.', 'info');
                    }
                });
            }
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

    function scrollInspectorToTop({ smooth = true } = {}) {
        const inspector = document.querySelector('.builder-inspector');
        if (!inspector || typeof inspector.scrollTo !== 'function') return;
        inspector.scrollTo({
            top: 0,
            behavior: smooth ? 'smooth' : 'auto',
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
        scrollInspectorToTop();
    }

    function renderInternetInspector() {
        const root = document.getElementById('builderInspectorBody');
        if (!root) return;
        setSelection('node', INTERNET_NODE_ID);
        const exitNodeIds = getFlowExitNodeIds(state.flow);
        const nodesById = new Map((state.flow?.nodes || []).map((node) => [String(node.id), node]));
        const exitList = exitNodeIds.length
            ? `
                <div class="builder-plan-message-list">
                    ${exitNodeIds.map((nodeId) => `
                        <div class="builder-validation-item">
                            <strong>${escapeHtml(nodesById.get(String(nodeId))?.name || nodeId)}</strong>
                            <span>${escapeHtml(i18n.internetExitPath || 'Traffic exits to Internet from this node')}</span>
                        </div>
                    `).join('')}
                </div>
            `
            : `<p class="builder-validation-empty">${escapeHtml(i18n.internetNoExits || 'No Internet exit nodes yet. Build at least one chain first.')}</p>`;

        root.innerHTML = `
            <div class="builder-inspector-card">
                <div class="builder-inspector-head">
                    <strong>${escapeHtml(i18n.internetNodeLabel || 'Internet')}</strong>
                    <span class="builder-validation-badge">${escapeHtml(String(exitNodeIds.length || 0))}</span>
                </div>
                <p class="builder-validation-empty">${escapeHtml(i18n.internetHint || 'Internet block shows where chain traffic leaves the tunnel.')}</p>
                ${exitList}
            </div>
        `;
        scrollInspectorToTop();
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
                const hop = getHopById(hopId) || { id: hopId, isDraft: true };
                await removeHopConnection(hop, { confirm: true, reload: true, showToast: true });
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
            scrollInspectorToTop();
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
                <div class="builder-form-actions" style="margin-top:12px;">
                    <button class="btn btn-secondary btn-sm" type="button" id="builderLiveHopDelete">
                        <i class="ti ti-unlink"></i>
                        <span>${escapeHtml(i18n.removeLink || 'Disconnect link')}</span>
                    </button>
                </div>
            </div>
        `;
        document.getElementById('builderLiveHopDelete')?.addEventListener('click', () => {
            removeHopConnection(hop, { confirm: true, reload: true, showToast: true });
        });
        scrollInspectorToTop();
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

    function getConnectHintByCode(code) {
        const normalized = String(code || '').trim().toLowerCase();
        if (normalized === 'cycle') return i18n.executionHintMixedMode || i18n.connectHintFallback || 'Remove loop and keep one direction chain.';
        if (normalized === 'bidirectional-hop') return i18n.connectHintFallback || 'Keep only one direction between these nodes.';
        if (normalized === 'duplicate-hop') return i18n.connectHintFallback || 'This link already exists. Edit existing draft hop settings instead.';
        if (normalized === 'self-link') return i18n.connectHintFallback || 'Source and target must be different nodes.';
        if (normalized === 'hybrid-disabled' || normalized === 'hybrid-disabled-hop') {
            return i18n.executionHintHybridDisabled || i18n.connectHintFallback || 'Enable hybrid mode before mixing runtime types.';
        }
        if (normalized === 'invalid-security-transport') {
            return i18n.executionHintRuntimeConfigInvalid || i18n.connectHintFallback || 'Try TCP/GRPC/XHTTP transport or adjust security mode.';
        }
        if (normalized === 'multiple-upstreams-not-supported' || normalized === 'multiple-downstreams-not-supported') {
            return i18n.connectHintFallback || 'Builder currently supports one upstream and one downstream per node.';
        }
        if (normalized === 'missing-node') return i18n.executionHintResourceMissing || i18n.connectHintFallback || 'Refresh topology and retry.';
        return i18n.connectHintFallback || 'Check link direction and chain constraints.';
    }

    function initCy(flow) {
        if (state.cy) {
            stopEdgeFlowAnimation();
            state.cy.destroy();
            state.cy = null;
            state.edgehandles = null;
        }
        state.connectInFlight = false;
        state.edgeDrawSession = null;

        state.cy = cytoscape({
            container: document.getElementById('builderCy'),
            style: getBuilderStyle(),
            elements: flowToElements(flow),
            layout: { name: 'preset' },
            minZoom: 0.2,
            maxZoom: 4,
            wheelSensitivity: 0.25,
        });

        const portNodes = state.cy.nodes('[isPort = 1]');
        if (portNodes.length) {
            portNodes.ungrabify();
        }
        scheduleTransientEdgeCleanup();
        syncAllNodePorts();

        const hasPositions = flow.nodes.some((node) => node.position && typeof node.position.x === 'number');
        if (!hasPositions) {
            runAutoLayout({ animate: true });
        } else {
            fitRealGraphView(48);
        }
        syncInternetNodePosition();
        syncEdgeFlowAnimation();

        state.cy.on('select', 'node', (event) => {
            if (isPortElement(event.target)) return;
            const nodeId = event.target.id();
            if (nodeId === INTERNET_NODE_ID) {
                renderInternetInspector();
                return;
            }
            const node = getNodeById(nodeId);
            if (node) renderNodeInspector(node);
        });

        state.cy.on('select', 'edge', (event) => {
            const hopId = event.target.data('hopId');
            const hop = getHopById(hopId);
            if (hop) renderHopInspector(hop);
        });

        state.cy.on('cxttap', 'edge', async (event) => {
            const edge = event.target;
            if (!edge || Number(edge.data('isVirtualInternet')) === 1) return;
            const hopId = String(edge.data('hopId') || '').trim();
            const hop = getHopById(hopId);
            if (!hop) return;
            await removeHopConnection(hop, { confirm: true, reload: true, showToast: true });
        });

        state.cy.on('tap', (event) => {
            if (event.target === state.cy) {
                clearConnectIntent();
                scheduleTransientEdgeCleanup();
                hideBuilderErrorTooltip();
                renderInspectorEmpty();
            }
        });

        state.cy.on('position', 'node[isPort != 1]', (event) => {
            if (String(event.target.id() || '') === INTERNET_NODE_ID) return;
            syncNodePorts(event.target.id());
        });
        state.cy.on('pan zoom resize', () => {
            syncInternetNodePosition();
        });

        if (typeof state.cy.edgehandles === 'function') {
            state.edgehandles = state.cy.edgehandles({
                handleNodes: 'node[isPort != 1][isVirtualInternet != 1], node[isPort = 1][portType = "out"]',
                handlePosition: 'right middle',
                handleSize: 14,
                preview: false,
                hoverDelay: 80,
                canConnect: (sourceNode, targetNode) => {
                    const sourceEndpoint = resolveConnectEndpoint(sourceNode);
                    const targetEndpoint = resolveConnectEndpoint(targetNode);

                    if (!sourceEndpoint.ownerNodeId || sourceEndpoint.isVirtualInternet) return false;
                    if (sourceEndpoint.isPort && sourceEndpoint.portType !== 'out') return false;
                    if (!targetEndpoint.ownerNodeId) return false;
                    if (targetEndpoint.isPort && targetEndpoint.portType !== 'in') return false;
                    if (targetEndpoint.isVirtualInternet) return false;

                    const sourceOwner = sourceEndpoint.ownerNodeId;
                    const targetOwner = targetEndpoint.ownerNodeId;
                    if (!sourceOwner || !targetOwner) return false;
                    return sourceOwner !== targetOwner;
                },
                noEdgeEventsInDraw: true,
                disableBrowserGestures: true,
                complete: async (sourceNode, targetNode, addedEles) => {
                    if (addedEles && addedEles.remove) addedEles.remove();
                    cleanupTransientBuilderEdges();
                    clearConnectIntent();
                    const sourceEndpoint = resolveConnectEndpoint(sourceNode);
                    const targetEndpoint = resolveConnectEndpoint(targetNode);
                    const sourceNodeId = sourceEndpoint.ownerNodeId;
                    const targetNodeId = targetEndpoint.ownerNodeId;
                    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
                    await handleDraftConnect(sourceNodeId, targetNodeId);
                },
            });
        }

        state.cy.on('ehstart', (event, sourceNode) => {
            state.edgeDrawActive = true;
            const endpoint = resolveConnectEndpoint(sourceNode && sourceNode.length ? sourceNode : event?.target);
            state.edgeDrawSession = {
                sourceNodeId: String(endpoint.ownerNodeId || '').trim(),
                startedAt: Date.now(),
                completed: false,
                hoveredTarget: false,
            };
        });
        state.cy.on('ehhoverover', () => {
            if (state.edgeDrawSession) {
                state.edgeDrawSession.hoveredTarget = true;
            }
        });
        state.cy.on('ehcomplete', () => {
            if (state.edgeDrawSession) {
                state.edgeDrawSession.completed = true;
            }
        });
        state.cy.on('ehstop ehcancel', () => {
            const session = state.edgeDrawSession;
            state.edgeDrawActive = false;
            state.edgeDrawSession = null;
            scheduleTransientEdgeCleanup();
            if (!session || session.completed) return;
            if ((Date.now() - Number(session.startedAt || 0)) < 250) return;
            if (session.hoveredTarget) return;
            maybeDisconnectSourceOutgoing(session.sourceNodeId);
        });

        state.connectFallbackEnabled = true;
        if (state.connectFallbackEnabled) {
            // Stable connect mode: tap OUT port -> tap target node/IN port.
            state.cy.on('tap', 'node[isPort = 1][portType = "out"]', (event) => {
                const sourceEndpoint = resolveConnectEndpoint(event.target);
                if (!sourceEndpoint.ownerNodeId) return;
                setConnectIntent(sourceEndpoint.ownerNodeId, event.target.id());
            });

            // Also support node-to-node connect without aiming tiny ports (press-and-hold source node).
            state.cy.on('taphold', 'node[isPort != 1][isVirtualInternet != 1]', async (event) => {
                const nodeId = String(event.target.id() || '').trim();
                if (!nodeId) return;
                const pending = state.connectIntent;
                if (!pending?.sourceNodeId) {
                    setConnectIntent(nodeId, buildPortId(nodeId, 'out'));
                    return;
                }
                const sourceNodeId = String(pending.sourceNodeId || '').trim();
                clearConnectIntent();
                if (!sourceNodeId || sourceNodeId === nodeId) return;
                await handleDraftConnect(sourceNodeId, nodeId);
            });

            state.cy.on('tap', 'node[isPort != 1][isVirtualInternet != 1]', async (event) => {
                const pending = state.connectIntent;
                if (!pending?.sourceNodeId) return;
                const targetNodeId = String(event.target.id() || '').trim();
                const sourceNodeId = String(pending.sourceNodeId || '').trim();
                clearConnectIntent();
                if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
                await handleDraftConnect(sourceNodeId, targetNodeId);
            });

            state.cy.on('tap', 'node[isPort = 1][portType = "in"]', async (event) => {
                const pending = state.connectIntent;
                if (!pending?.sourceNodeId) return;
                const targetEndpoint = resolveConnectEndpoint(event.target);
                const targetNodeId = targetEndpoint.ownerNodeId;
                if (!targetNodeId) return;

                const sourceNodeId = String(pending.sourceNodeId || '').trim();
                clearConnectIntent();
                if (!sourceNodeId || sourceNodeId === targetNodeId) return;
                await handleDraftConnect(sourceNodeId, targetNodeId);
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

    function getHopDisplayName(hop) {
        if (!hop || typeof hop !== 'object') return '';
        const hopName = String(hop.name || '').trim();
        if (hopName) return hopName;
        const source = String(hop.sourceNodeId || '').trim();
        const target = String(hop.targetNodeId || '').trim();
        if (source || target) return `${source} -> ${target}`.trim();
        return String(hop.id || '').trim();
    }

    function extractObjectIdCandidates(rawValue) {
        const source = String(rawValue || '').trim();
        if (!source) return [];
        const values = new Set([source]);
        if (source.startsWith('link-')) {
            values.add(source.slice(5));
        }
        const hexMatches = source.match(/[a-fA-F0-9]{24}/g) || [];
        hexMatches.forEach((item) => values.add(item));
        return Array.from(values)
            .map((item) => String(item || '').trim())
            .filter((item) => /^[a-fA-F0-9]{24}$/.test(item));
    }

    function isDraftHop(hop) {
        if (!hop || typeof hop !== 'object') return false;
        if (hop.isDraft === true || Number(hop.isDraft) === 1) return true;
        return String(hop.id || '').startsWith('draft:');
    }

    function findExistingHopByEndpoints(sourceNodeId, targetNodeId) {
        const sourceId = String(sourceNodeId || '').trim();
        const targetId = String(targetNodeId || '').trim();
        if (!sourceId || !targetId) return null;
        const hops = Array.isArray(state.flow?.hops) ? state.flow.hops : [];
        return hops.find((hop) => (
            String(hop?.sourceNodeId || '').trim() === sourceId
            && String(hop?.targetNodeId || '').trim() === targetId
        )) || null;
    }

    function pruneHopFromLocalState(hop, resolvedHopId = '') {
        if (!hop || typeof hop !== 'object') return;
        const fallbackHopId = String(resolvedHopId || '').trim();
        const candidateSet = new Set([
            String(hop.id || '').trim(),
            String(hop.edgeId || '').trim(),
            String(hop.linkId || '').trim(),
            fallbackHopId,
            ...extractObjectIdCandidates(hop.id),
            ...extractObjectIdCandidates(hop.edgeId),
            ...extractObjectIdCandidates(hop.linkId),
            ...extractObjectIdCandidates(fallbackHopId),
        ].filter(Boolean));
        if (!candidateSet.size) return;

        if (Array.isArray(state.flow?.hops)) {
            state.flow.hops = state.flow.hops.filter((item) => {
                const itemCandidateSet = new Set([
                    String(item?.id || '').trim(),
                    String(item?.edgeId || '').trim(),
                    String(item?.linkId || '').trim(),
                    ...extractObjectIdCandidates(item?.id),
                    ...extractObjectIdCandidates(item?.edgeId),
                    ...extractObjectIdCandidates(item?.linkId),
                ].filter(Boolean));
                for (const candidate of itemCandidateSet) {
                    if (candidateSet.has(candidate)) return false;
                }
                return true;
            });
        }

        if (!state.cy) return;
        const edgeCollection = state.cy.edges().filter((edge) => {
            const edgeCandidateSet = new Set([
                String(edge.data('hopId') || '').trim(),
                String(edge.id() || '').trim(),
                ...extractObjectIdCandidates(edge.data('hopId')),
                ...extractObjectIdCandidates(edge.id()),
            ].filter(Boolean));
            for (const candidate of edgeCandidateSet) {
                if (candidateSet.has(candidate)) return true;
            }
            return false;
        });
        if (edgeCollection.length) {
            edgeCollection.remove();
            syncEdgeFlowAnimation();
        }
    }

    async function removeHopConnection(hop, {
        confirm = true,
        reload = true,
        showToast = true,
    } = {}) {
        if (!hop || typeof hop !== 'object') {
            return { success: false, error: 'missing-hop' };
        }

        const hopId = String(hop.id || '').trim();
        if (!hopId) {
            return { success: false, error: 'missing-hop-id' };
        }

        const draftHop = isDraftHop(hop);
        const hopLabel = getHopDisplayName(hop);
        if (confirm) {
            const title = draftHop
                ? (i18n.removeDraftConfirm || 'Remove this draft hop?')
                : (i18n.removeLinkConfirm || 'Disconnect this live link?');
            const text = hopLabel
                ? `${hopLabel}`
                : (draftHop ? (i18n.draftTag || 'Draft hop') : (i18n.removeLink || 'Link'));
            const accepted = await openBuilderConfirm({
                title,
                text,
                confirmLabel: i18n.confirmDisconnect || i18n.confirmOk || 'Confirm',
                cancelLabel: i18n.confirmCancel || 'Cancel',
                danger: true,
            });
            if (!accepted) {
                return { success: false, canceled: true, error: 'canceled' };
            }
        }

        const endpoint = draftHop
            ? `/api/cascade-builder/drafts/${encodeURIComponent(hopId)}`
            : `/api/cascade/links/${encodeURIComponent(hopId)}`;
        const isNotFoundError = (message = '') => /404|not found|не найден|не знайден|черновой хоп/i.test(String(message || '').toLowerCase());
        try {
            const result = await requestJson(endpoint, { method: 'DELETE' });
            if (showToast) {
                const message = draftHop
                    ? (i18n.draftRemoved || 'Draft hop removed.')
                    : (i18n.linkRemoved || 'Link disconnected.');
                toast(message, 'success');
                if (result?.topologySync?.queued) {
                    toast(i18n.topologySyncQueued || 'Topology update and runtime reconcile are running in background.', 'info');
                }
            }
            if (reload) {
                await loadState();
            } else {
                pruneHopFromLocalState(hop, hopId);
            }
            return { success: true };
        } catch (error) {
            if (!draftHop) {
                const fallbackCandidates = [
                    ...extractObjectIdCandidates(hop.edgeId),
                    ...extractObjectIdCandidates(hop.linkId),
                    ...extractObjectIdCandidates(hopId),
                ].filter((candidate, index, arr) => (
                    candidate && arr.indexOf(candidate) === index && candidate !== hopId
                ));
                for (const fallbackId of fallbackCandidates) {
                    try {
                        const result = await requestJson(`/api/cascade/links/${encodeURIComponent(fallbackId)}`, { method: 'DELETE' });
                        if (showToast) {
                            toast(i18n.linkRemoved || 'Link disconnected.', 'success');
                            if (result?.topologySync?.queued) {
                                toast(i18n.topologySyncQueued || 'Topology update and runtime reconcile are running in background.', 'info');
                            }
                        }
                        if (reload) {
                            await loadState();
                        } else {
                            pruneHopFromLocalState(hop, fallbackId);
                        }
                        return { success: true };
                    } catch (fallbackError) {
                        error.message = `${error.message}; fallback(${fallbackId}): ${fallbackError.message}`;
                    }
                }
            }
            if (isNotFoundError(error?.message)) {
                if (reload) {
                    await loadState();
                } else {
                    pruneHopFromLocalState(hop, hopId);
                }
                return { success: true, skipped: true };
            }
            if (showToast) {
                const failedMessage = draftHop
                    ? (i18n.draftRemoveFailed || 'Failed to remove draft hop')
                    : (i18n.linkRemoveFailed || 'Failed to disconnect link');
                toast(`${failedMessage}: ${error.message}`, 'error');
            }
            return { success: false, error: error.message };
        }
    }

    function maybeDisconnectSourceOutgoing(sourceNodeId) {
        const sourceId = String(sourceNodeId || '').trim();
        if (!sourceId || sourceId === INTERNET_NODE_ID) return;

        const hops = Array.isArray(state.flow?.hops) ? state.flow.hops : [];
        const outgoing = hops.filter((hop) => String(hop.sourceNodeId || '').trim() === sourceId);

        if (!outgoing.length) {
            toast(i18n.dragDisconnectNoLink || 'There is no outgoing link to disconnect from this node.', 'info');
            return;
        }
        if (outgoing.length > 1) {
            toast(i18n.dragDisconnectMultiHint || 'Multiple outgoing links found. Disconnect the exact line via right-click.', 'info');
            return;
        }

        removeHopConnection(outgoing[0], { confirm: true, reload: true, showToast: true });
    }

    async function handleDraftConnect(sourceNodeId, targetNodeId) {
        const sourceId = String(sourceNodeId || '').trim();
        const targetId = String(targetNodeId || '').trim();
        if (!sourceId || !targetId || sourceId === targetId) return;
        if (sourceId === INTERNET_NODE_ID || targetId === INTERNET_NODE_ID) return;
        const existingHop = findExistingHopByEndpoints(sourceId, targetId);
        if (existingHop) {
            focusHopById(existingHop.id);
            toast(i18n.connectHintFallback || 'This link already exists. Edit existing draft hop settings instead.', 'info');
            return;
        }
        if (state.connectInFlight) return;
        const connectSignature = `${sourceId}->${targetId}`;
        const now = Date.now();
        if (state.lastConnectSignature === connectSignature && (now - state.lastConnectAt) < 900) {
            return;
        }
        state.lastConnectSignature = connectSignature;
        state.lastConnectAt = now;
        state.connectInFlight = true;
        hideBuilderErrorTooltip();
        try {
            const payload = await requestJson('/api/cascade-builder/connect', {
                method: 'POST',
                body: JSON.stringify({ sourceNodeId: sourceId, targetNodeId: targetId }),
            });

            renderConnectInspector(payload);
            if (!payload.accepted) {
                const firstValidationError = payload?.validation?.errors?.[0] || payload?.validation?.warnings?.[0] || null;
                const firstValidationMessage = firstValidationError?.message || '';
                const hint = getConnectHintByCode(firstValidationError?.code);
                showBuilderErrorTooltip(firstValidationMessage || (i18n.rejectedDraft || 'Draft connection is invalid.'), hint);
                toast(firstValidationMessage || (i18n.rejectedDraft || 'Draft connection is invalid.'), 'error');
                return;
            }

            const draftHop = payload.draftHop;
            await loadState({ selectHopId: draftHop.id });
            toast(i18n.acceptedDraft || 'Draft hop added.');
            toast(i18n.connectOpenInspectorHint || 'Connection created. Tune mode/protocol/security in the inspector on the right.');
        } catch (error) {
            showBuilderErrorTooltip(`${i18n.connectFailed || 'Connect failed'}: ${error.message}`, i18n.connectHintFallback || 'Check link direction and chain constraints.');
            toast(`${i18n.connectFailed || 'Connect failed'}: ${error.message}`, 'error');
        } finally {
            state.connectInFlight = false;
            scheduleTransientEdgeCleanup();
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
            const positions = state.cy.nodes('[isPort != 1]').toArray().map((node) => ({
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
            if (result?.topologySync?.queued) {
                toast(i18n.topologySyncQueued || 'Topology update and runtime reconcile are running in background.', 'info');
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

    async function resetDrafts() {
        const hops = Array.isArray(state.flow?.hops) ? state.flow.hops : [];
        if (!hops.length) {
            toast(i18n.noLinksToReset || 'There are no links to reset right now.', 'info');
            return;
        }

        const draftCount = hops.filter((hop) => isDraftHop(hop)).length;
        const liveCount = Math.max(0, hops.length - draftCount);
        const confirmed = await openBuilderConfirm({
            title: i18n.resetLinksConfirm || 'Reset all current links?',
            text: `${i18n.summaryHops || 'Hops'}: ${hops.length} (${i18n.draftTag || 'Draft'}: ${draftCount}, ${i18n.liveTag || 'Live'}: ${liveCount})`,
            confirmLabel: i18n.confirmDisconnect || i18n.confirmOk || 'Confirm',
            cancelLabel: i18n.confirmCancel || 'Cancel',
            danger: true,
        });
        if (!confirmed) {
            return;
        }

        const failures = [];
        const hopsToReset = [...hops];
        for (const hop of hopsToReset) {
            const result = await removeHopConnection(hop, {
                confirm: false,
                reload: false,
                showToast: false,
            });
            if (!result.success && !result.canceled) {
                failures.push({
                    hop: getHopDisplayName(hop),
                    error: result.error || 'unknown',
                });
            }
        }

        await loadState();
        setTimeout(() => {
            loadState().catch(() => {});
        }, 900);

        if (failures.length) {
            const sample = failures.slice(0, 2)
                .map((item) => `${item.hop}: ${item.error}`)
                .join(' | ');
            toast(
                `${i18n.resetLinksPartial || 'Links reset completed with errors.'} ${sample}`,
                'error',
            );
            return;
        }
        toast(i18n.resetLinksDone || 'All current links have been reset.', 'success');
    }

    async function loadState({ selectHopId = null, selectNodeId = null } = {}) {
        try {
            hideBuilderErrorTooltip();
            const flow = await requestJson('/api/cascade-builder/state');
            state.flow = flow;
            renderLibrary(flow);
            renderSummary(flow, flow.validation);
            renderValidation(flow.validation);
            renderInternetSection(flow);
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
        document.getElementById('builderCy')?.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        document.getElementById('builderConfirmOverlay')?.addEventListener('click', (event) => {
            if (event.target?.id !== 'builderConfirmOverlay') return;
            closeBuilderConfirm(false);
        });
        document.getElementById('builderConfirmCancel')?.addEventListener('click', () => {
            closeBuilderConfirm(false);
        });
        document.getElementById('builderConfirmOk')?.addEventListener('click', () => {
            closeBuilderConfirm(true);
        });
        document.getElementById('builderValidate')?.addEventListener('click', validateCurrentDraft);
        document.getElementById('builderSaveLayout')?.addEventListener('click', saveLayout);
        document.getElementById('builderCommitDrafts')?.addEventListener('click', () => commitDrafts());
        document.getElementById('builderCommitDeploy')?.addEventListener('click', () => commitDrafts({ deployAfterCommit: true }));
        document.getElementById('builderDeployPreview')?.addEventListener('click', () => previewCommitPlan());
        document.getElementById('builderResetDrafts')?.addEventListener('click', resetDrafts);
        document.getElementById('builderInternetList')?.addEventListener('click', (event) => {
            const item = event.target.closest('[data-internet-exit-node]');
            if (!item) return;
            const nodeId = String(item.getAttribute('data-internet-exit-node') || '').trim();
            if (nodeId && focusNodeById(nodeId)) return;
            renderInternetInspector();
        });
        document.getElementById('builderInternetBox')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-internet-exit-node]')) return;
            renderInternetInspector();
        });
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
        document.getElementById('builderFitView')?.addEventListener('click', () => fitRealGraphView(48));
        document.getElementById('builderAutoLayout')?.addEventListener('click', () => {
            runAutoLayout({ animate: true });
        });
        document.getElementById('builderFullscreenToggle')?.addEventListener('click', () => {
            setBuilderFullscreen(!state.isFullscreen);
        });

        document.addEventListener('fullscreenchange', () => {
            const active = isNativeFullscreenActive();
            if (!active && state.isFullscreen) {
                state.isFullscreen = false;
                syncFullscreenToggleUi(false);
                resizeBuilderCanvas();
            }
        });

        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
                if (mutations.some((mutation) => mutation.attributeName === 'data-theme')) {
                    syncCyTheme();
                }
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.confirmOpen) {
                closeBuilderConfirm(false);
                event.preventDefault();
                return;
            }
            if (event.key === 'Escape' && state.isFullscreen) {
                setBuilderFullscreen(false);
                return;
            }

            if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection?.type === 'hop') {
                const selectedHop = getHopById(state.selection.id);
                if (!selectedHop) return;
                event.preventDefault();
                removeHopConnection(selectedHop, { confirm: true, reload: true, showToast: true });
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindUi();
        loadState();
    });
})();
