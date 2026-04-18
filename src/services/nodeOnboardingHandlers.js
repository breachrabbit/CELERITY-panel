const HyNode = require('../models/hyNodeModel');
const nodeSetup = require('./nodeSetup');
const syncService = require('./syncService');

function tailText(value, maxLen = 1200) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(text.length - maxLen);
}

function shellSingleQuote(value) {
    return `'${String(value || '').replace(/'/g, `'\"'\"'`)}'`;
}

function buildNonLoginShCommand(script) {
    const normalized = String(script || '')
        .replace(/\r\n?/g, '\n')
        .trim();
    return `sh -c ${shellSingleQuote(normalized)}`;
}

function buildSshStepFailure(step, result, fallbackMessage = '') {
    const sshCode = Number.isFinite(Number(result?.code)) ? Number(result.code) : -1;
    const sshError = String(result?.error || fallbackMessage || `SSH step failed (${step})`);
    const stdoutTail = tailText(result?.stdout || '');
    const stderrTail = tailText(result?.stderr || '');
    const stderrFirstLine = String(stderrTail || '')
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean) || '';
    const stderrHint = stderrFirstLine ? ` — ${stderrFirstLine}` : '';
    const message = `${step} failed: ${sshError}${sshCode >= 0 ? ` (code ${sshCode})` : ''}${stderrHint}`;
    const err = new Error(message);
    err.code = 'SSH_STEP_FAILED';
    err.details = {
        step,
        sshCode,
        sshError,
        stdoutTail,
        stderrTail,
    };
    return err;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRuntimeStatus(rawStatus) {
    if (rawStatus && typeof rawStatus === 'object') {
        const status = String(rawStatus.status || '').trim().toLowerCase();
        const online = typeof rawStatus.online === 'boolean'
            ? rawStatus.online
            : ['online', 'active', 'running'].includes(status);
        const error = String(rawStatus.error || '').trim();
        return {
            online,
            status: status || (online ? 'online' : 'unknown'),
            error,
        };
    }

    const status = String(rawStatus || '').trim().toLowerCase();
    if (!status) {
        return { online: false, status: 'unknown', error: 'no status' };
    }
    if (['online', 'active', 'running'].includes(status)) {
        return { online: true, status: status === 'online' ? 'active' : status, error: '' };
    }
    if (status === 'error') {
        return { online: false, status, error: 'status check error' };
    }
    return { online: false, status, error: '' };
}

function parseMissingTools(output) {
    const lines = String(output || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    return lines
        .filter((line) => line.startsWith('__missing__:'))
        .map((line) => line.replace('__missing__:', '').trim())
        .filter(Boolean);
}

async function withNodeSsh(nodeId, executor) {
    const node = await HyNode.findById(nodeId).lean();
    if (!node) {
        throw new Error('Onboarding node not found');
    }

    if (!node.ssh?.password && !node.ssh?.privateKey) {
        throw new Error('SSH credentials are not configured for onboarding node');
    }

    let conn;
    try {
        conn = await nodeSetup.connectSSH(node);
        return await executor({ node, conn });
    } finally {
        if (conn?.end) {
            try { conn.end(); } catch (_) {}
        }
    }
}

async function runPreflight({ job, context = {} }) {
    return withNodeSsh(job.nodeId, async ({ node, conn }) => {
        const onLogLine = typeof context?.onLogLine === 'function' ? context.onLogLine : null;
        const probeCmd = [
            'set -e',
            'for t in bash systemctl curl openssl; do',
            '  command -v "$t" >/dev/null 2>&1 || echo "__missing__:$t"',
            'done',
            'echo "__kernel__=$(uname -srm 2>/dev/null || uname -a 2>/dev/null)"',
            'if [ -f /etc/os-release ]; then',
            '  . /etc/os-release',
            '  echo "__os__=${ID:-unknown}:${VERSION_ID:-unknown}"',
            'fi',
            'echo "__uptime__=$(uptime 2>/dev/null | sed -E \'s/ +/ /g\' || true)"',
        ].join('\n');

        const result = await nodeSetup.execSSH(conn, buildNonLoginShCommand(probeCmd), {
            onStdoutLine: onLogLine ? (line) => onLogLine(`[preflight] ${line}`) : null,
            onStderrLine: onLogLine ? (line) => onLogLine(`[preflight][stderr] ${line}`) : null,
        });
        if (!result?.success) {
            throw buildSshStepFailure('preflight', result);
        }
        const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        const missingTools = parseMissingTools(output);

        const kernel = (output.match(/__kernel__=(.+)/) || [])[1] || '';
        const os = (output.match(/__os__=(.+)/) || [])[1] || '';
        const uptime = (output.match(/__uptime__=(.+)/) || [])[1] || '';

        if (missingTools.length > 0) {
            throw new Error(`Preflight missing tools: ${missingTools.join(', ')}`);
        }

        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            os,
            kernel,
            uptime,
            missingTools: [],
            sshOk: true,
        };
    });
}

async function runPrepareHost({ job, context = {} }) {
    return withNodeSsh(job.nodeId, async ({ node, conn }) => {
        const onLogLine = typeof context?.onLogLine === 'function' ? context.onLogLine : null;
        const prepareCmd = [
            'set -e',
            'for p in /var/log/xray /usr/local/etc/xray /etc/hysteria; do',
            '  if [ -e "$p" ] && [ ! -d "$p" ]; then',
            '    mv "$p" "${p}.bak.$(date +%s)" 2>/dev/null || rm -f "$p"',
            '  fi',
            '  mkdir -p "$p"',
            'done',
            'touch /var/log/xray/access.log /var/log/xray/error.log',
            'XRAY_USER="$(systemctl show -p User --value xray 2>/dev/null || true)"',
            '[ -z "$XRAY_USER" ] && XRAY_USER="nobody"',
            'XRAY_GROUP="$(id -gn "$XRAY_USER" 2>/dev/null || echo "$XRAY_USER")"',
            'chown -R "$XRAY_USER:$XRAY_GROUP" /var/log/xray 2>/dev/null || true',
            'chmod 755 /var/log/xray || true',
            'chmod 640 /var/log/xray/access.log /var/log/xray/error.log || true',
            'echo "__prepared__=1"',
        ].join('\n');

        const result = await nodeSetup.execSSH(conn, buildNonLoginShCommand(prepareCmd), {
            onStdoutLine: onLogLine ? (line) => onLogLine(`[prepare-host] ${line}`) : null,
            onStderrLine: onLogLine ? (line) => onLogLine(`[prepare-host][stderr] ${line}`) : null,
        });
        if (!result?.success) {
            throw buildSshStepFailure('prepare-host', result);
        }

        const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        if (!/(^|\n)__prepared__=1(\n|$)/.test(output)) {
            const err = new Error('Prepare-host marker missing in SSH output');
            err.code = 'PREPARE_HOST_MARKER_MISSING';
            err.details = {
                step: 'prepare-host',
                stdoutTail: tailText(result.stdout || ''),
                stderrTail: tailText(result.stderr || ''),
            };
            throw err;
        }

        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            preparedPaths: [
                '/var/log/xray',
                '/usr/local/etc/xray',
                '/etc/hysteria',
            ],
            logFiles: [
                '/var/log/xray/access.log',
                '/var/log/xray/error.log',
            ],
        };
    });
}

async function tryRecoverXrayAccessLogPermission(nodeId, onLogLine = null) {
    return withNodeSsh(nodeId, async ({ conn }) => {
        const repairCmd = [
            'set +e',
            'STATE_BEFORE="$(systemctl is-active xray 2>/dev/null || true)"',
            'JOURNAL="$(journalctl -u xray -n 80 --no-pager 2>/dev/null || true)"',
            'if echo "$JOURNAL" | grep -qiE "failed to initialize access logger|open /var/log/xray/access.log: permission denied"; then',
            '  NEED_FIX=1',
            'elif [ "$STATE_BEFORE" != "active" ]; then',
            '  NEED_FIX=1',
            'else',
            '  NEED_FIX=0',
            'fi',
            'if [ "$NEED_FIX" = "1" ]; then',
            '  mkdir -p /var/log/xray',
            '  touch /var/log/xray/access.log /var/log/xray/error.log',
            '  XRAY_USER="$(systemctl show -p User --value xray 2>/dev/null || true)"',
            '  [ -z "$XRAY_USER" ] && XRAY_USER="nobody"',
            '  XRAY_GROUP="$(id -gn "$XRAY_USER" 2>/dev/null || echo "$XRAY_USER")"',
            '  chown -R "$XRAY_USER:$XRAY_GROUP" /var/log/xray 2>/dev/null || true',
            '  chmod 755 /var/log/xray || true',
            '  chmod 640 /var/log/xray/access.log /var/log/xray/error.log || true',
            '  systemctl restart xray 2>/dev/null || true',
            '  sleep 2',
            'fi',
            'STATE="$(systemctl is-active xray 2>/dev/null || true)"',
            'echo "__need_fix__=${NEED_FIX}"',
            'echo "__before__=${STATE_BEFORE}"',
            'echo "__state__=${STATE}"',
        ].join('\n');

        const result = await nodeSetup.execSSH(conn, buildNonLoginShCommand(repairCmd), {
            onStdoutLine: onLogLine ? (line) => onLogLine(`[verify-runtime-local] ${line}`) : null,
            onStderrLine: onLogLine ? (line) => onLogLine(`[verify-runtime-local][stderr] ${line}`) : null,
        });
        const output = `${result.stdout || ''}\n${result.stderr || ''}`;
        const needFix = Number((output.match(/__need_fix__=(\d+)/) || [])[1] || 0) === 1;
        const before = String((output.match(/__before__=(.+)/) || [])[1] || '').trim().toLowerCase();
        const state = String((output.match(/__state__=(.+)/) || [])[1] || '').trim().toLowerCase();
        return {
            recovered: ['active', 'online', 'running'].includes(state),
            attempted: needFix,
            before: before || 'unknown',
            state: state || 'unknown',
            output: tailText(output),
        };
    });
}

async function runInstallRuntime({ job, context = {} }) {
    const node = await HyNode.findById(job.nodeId);
    if (!node) {
        throw new Error('Onboarding node not found for runtime install');
    }
    const onLogLine = typeof context?.onLogLine === 'function' ? context.onLogLine : null;

    let result;
    if (node.type === 'xray' && node.cascadeRole === 'bridge') {
        result = await nodeSetup.setupXrayNode(node, { restartService: false, exitOnly: true, onLogLine });
    } else if (node.type === 'xray') {
        result = await nodeSetup.setupXrayNode(node, { restartService: true, onLogLine });
    } else {
        result = await nodeSetup.setupHysteriaNode(node, {
            installHysteria: true,
            setupPortHopping: true,
            restartService: true,
            onLogLine,
        });
    }

    if (!result?.success) {
        throw new Error(result?.error || 'Runtime install failed');
    }

    const logTail = Array.isArray(result.logs) ? result.logs.slice(-20) : [];
    return {
        nodeId: String(node._id),
        nodeName: node.name,
        nodeType: node.type || 'hysteria',
        cascadeRole: node.cascadeRole || 'standalone',
        useTlsFiles: !!result.useTlsFiles,
        logTail,
    };
}

async function runVerifyRuntimeLocal({ job, context = {} }) {
    const node = await HyNode.findById(job.nodeId);
    if (!node) {
        throw new Error('Onboarding node not found for runtime verify');
    }

    const onLogLine = typeof context?.onLogLine === 'function' ? context.onLogLine : null;
    let resolvedStatus = { online: false, status: 'unknown', error: 'no status' };
    let recoveryMeta = null;
    const attempts = 12;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const runtimeStatus = node.type === 'xray'
            ? await nodeSetup.checkXrayNodeStatus(node)
            : await nodeSetup.checkNodeStatus(node);
        resolvedStatus = normalizeRuntimeStatus(runtimeStatus);
        if (resolvedStatus.online) break;

        if (node.type === 'xray' && attempt === 2) {
            recoveryMeta = await tryRecoverXrayAccessLogPermission(job.nodeId, onLogLine);
            if (recoveryMeta) {
                const note = recoveryMeta.attempted
                    ? (recoveryMeta.recovered
                        ? 'Recovered Xray runtime after log-permission repair and service restart.'
                        : `Xray log-permission recovery attempted, state before=${recoveryMeta.before}, after=${recoveryMeta.state}.`)
                    : `Xray recovery probe: state before=${recoveryMeta.before}, after=${recoveryMeta.state}.`;
                if (onLogLine) onLogLine(`[verify-runtime-local] ${note}`);
                if (recoveryMeta.recovered) {
                    resolvedStatus = { online: true, status: 'active', error: '' };
                    break;
                }
            }
        }

        if (attempt < attempts) {
            await delay(1500);
        }
    }

    if (!resolvedStatus.online) {
        throw new Error(`Runtime is offline (${resolvedStatus.error || resolvedStatus.status || 'no status'})`);
    }

    return {
        nodeId: String(node._id),
        nodeName: node.name,
        nodeType: node.type || 'hysteria',
        serviceState: resolvedStatus.status || 'unknown',
        online: true,
        recovery: recoveryMeta,
    };
}

function shouldSkipAgentSteps(node) {
    return node.type !== 'xray' || (node.cascadeRole || 'standalone') === 'bridge';
}

async function runInstallAgent({ job, context = {} }) {
    const node = await HyNode.findById(job.nodeId);
    if (!node) {
        throw new Error('Onboarding node not found for agent install');
    }
    const onLogLine = typeof context?.onLogLine === 'function' ? context.onLogLine : null;

    if (shouldSkipAgentSteps(node)) {
        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            skipped: true,
            reason: 'agent step not required for this node type/role',
        };
    }

    const logBuffer = [];
    const agentState = await nodeSetup.setupOrRepairXrayAgent(node, {
        strictAgent: true,
        includeInstallerOutput: true,
        onLogLine,
        log: (line) => {
            if (line) logBuffer.push(String(line));
        },
    });

    if (!agentState?.success) {
        throw new Error(agentState?.error || 'Agent install failed');
    }

    return {
        nodeId: String(node._id),
        nodeName: node.name,
        nodeType: node.type || 'hysteria',
        skipped: false,
        agentVersion: agentState.agentVersion || '',
        tokenPresent: !!agentState.token,
        logTail: logBuffer.slice(-20),
    };
}

async function runVerifyAgentLocal({ job }) {
    return withNodeSsh(job.nodeId, async ({ node, conn }) => {
        if (shouldSkipAgentSteps(node)) {
            return {
                nodeId: String(node._id),
                nodeName: node.name,
                nodeType: node.type || 'hysteria',
                skipped: true,
                reason: 'local agent verification is not required for this node type/role',
            };
        }

        const agentPort = Number(node?.xray?.agentPort) > 0 ? Number(node.xray.agentPort) : 62080;
        const verifyCmd = [
            'set -e',
            'SERVICE="$(systemctl is-active cc-agent 2>/dev/null || true)"',
            `PORT="${agentPort}"`,
            'if command -v ss >/dev/null 2>&1; then',
            '  ss -ltn 2>/dev/null | grep -q ":${PORT} " && PORT_OK=1 || PORT_OK=0',
            'else',
            '  PORT_OK=1',
            'fi',
            'echo "__service__=${SERVICE}"',
            'echo "__port_ok__=${PORT_OK}"',
        ].join('\n');

        const result = await nodeSetup.execSSH(conn, buildNonLoginShCommand(verifyCmd));
        const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        const serviceState = (output.match(/__service__=(.+)/) || [])[1] || 'unknown';
        const portOk = Number((output.match(/__port_ok__=(\d+)/) || [])[1] || 0) === 1;

        if (serviceState !== 'active') {
            throw new Error(`cc-agent service is not active (${serviceState})`);
        }
        if (!portOk) {
            throw new Error(`cc-agent port ${agentPort} is not listening`);
        }

        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            skipped: false,
            serviceState,
            agentPort,
        };
    });
}

async function runVerifyPanelToAgent({ job }) {
    const node = await HyNode.findById(job.nodeId);
    if (!node) {
        throw new Error('Onboarding node not found for panel->agent verification');
    }

    if (shouldSkipAgentSteps(node)) {
        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            skipped: true,
            reason: 'panel->agent verification is not required for this node type/role',
        };
    }

    const runtimeNode = await syncService._ensureXrayAgentReady(node);
    const response = await syncService._agentRequest(runtimeNode, 'GET', '/info');
    const data = response?.data || {};

    return {
        nodeId: String(node._id),
        nodeName: node.name,
        nodeType: node.type || 'hysteria',
        skipped: false,
        agentVersion: data.agent_version || '',
        runtimeVersion: data.xray_version || '',
        usersCount: Number(data.users_count || 0),
    };
}

function getStepResult(job, stepName) {
    const state = Array.isArray(job?.stepStates)
        ? job.stepStates.find((item) => item.step === stepName)
        : null;
    return state?.details?.result || {};
}

async function runSeedNodeState({ job }) {
    const node = await HyNode.findById(job.nodeId);
    if (!node) {
        throw new Error('Onboarding node not found for seed-node-state');
    }

    const verifyRuntime = getStepResult(job, 'verify-runtime-local');
    const verifyPanel = getStepResult(job, 'verify-panel-to-agent');

    const patch = {
        status: 'online',
        healthFailures: 0,
        lastError: '',
        lastSync: new Date(),
    };

    if (!shouldSkipAgentSteps(node)) {
        patch.agentStatus = 'online';
        patch.agentLastSeen = new Date();
        patch.agentVersion = String(verifyPanel.agentVersion || node.agentVersion || '');
        patch.xrayVersion = String(verifyPanel.runtimeVersion || node.xrayVersion || '');
        if (Number.isFinite(Number(verifyPanel.usersCount))) {
            patch.onlineUsers = Number(verifyPanel.usersCount);
        }
    }

    await HyNode.updateOne({ _id: node._id }, { $set: patch });

    return {
        nodeId: String(node._id),
        nodeName: node.name,
        nodeType: node.type || 'hysteria',
        seeded: true,
        runtimeState: verifyRuntime.serviceState || 'unknown',
        agentState: patch.agentStatus || 'n/a',
    };
}

async function runFinalSync({ job }) {
    const node = await HyNode.findById(job.nodeId);
    if (!node) {
        throw new Error('Onboarding node not found for final-sync');
    }

    if (node.type !== 'xray') {
        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            skipped: true,
            reason: 'final-sync is only required for xray nodes in current pipeline',
        };
    }

    const result = await syncService.finalizeNodeSetup(node);
    return {
        nodeId: String(node._id),
        nodeName: node.name,
        nodeType: node.type || 'hysteria',
        skipped: false,
        mode: result.mode || 'unknown',
        deployed: Number(result.deployed || 0),
    };
}

module.exports = {
    runPreflight,
    runPrepareHost,
    runInstallRuntime,
    runVerifyRuntimeLocal,
    runInstallAgent,
    runVerifyAgentLocal,
    runVerifyPanelToAgent,
    runSeedNodeState,
    runFinalSync,
};
