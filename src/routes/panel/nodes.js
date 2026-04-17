const express = require('express');
const router = express.Router();

const HyNode = require('../../models/hyNodeModel');
const HyUser = require('../../models/hyUserModel');
const ServerGroup = require('../../models/serverGroupModel');
const Settings = require('../../models/settingsModel');
const cryptoService = require('../../services/cryptoService');
const syncService = require('../../services/syncService');
const configGenerator = require('../../services/configGenerator');
const nodeSetup = require('../../services/nodeSetup');
const nodeOnboardingService = require('../../services/nodeOnboardingService');
const nodeOnboardingPipeline = require('../../services/nodeOnboardingPipeline');
const NodeSSH = require('../../services/nodeSSH');
const sshKeyService = require('../../services/sshKeyService');
const cache = require('../../services/cacheService');
const cascadeService = require('../../services/cascadeService');
const statsService = require('../../services/statsService');
const { getActiveGroups } = require('../../utils/helpers');
const config = require('../../../config');
const logger = require('../../utils/logger');

const {
    render,
    parseXrayFormFields,
    parseBool,
    parseHysteriaFormFields,
    getHysteriaAclInlineState,
    validateHysteriaFormFields,
    buildSshKeyFilename,
    connectNodeSSH,
    generateSshKeyLimiter,
    sniScanLimiter,
} = require('./helpers');

const sniScanner = require('../../services/sniScanner');
const RESERVED_CASCADE_OUTBOUND = '__cascade_sidecar__';

async function resolveNodePortForSameHost(ip, requestedPort) {
    const normalizedPort = parseInt(requestedPort, 10) || 443;
    const sameVps = await nodeSetup.isSameVpsAsPanel({ ip, domain: '' });
    if (!sameVps) {
        return { port: normalizedPort, adjusted: false };
    }

    const chosenPort = await nodeSetup.pickSameHostNodePort(normalizedPort);
    return {
        port: chosenPort,
        adjusted: chosenPort !== normalizedPort,
        requestedPort: normalizedPort,
    };
}

function shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeServiceState(value) {
    return String(value || '').trim().split('\n')[0].trim();
}

function pickPreferredServiceState(...states) {
    const normalized = states.map(normalizeServiceState);
    if (normalized.includes('active')) return 'active';
    const firstKnown = normalized.find(s => s && s !== 'unknown');
    return firstKnown || 'unknown';
}

function calculateEffectiveUserDeviceLimit(user) {
    const directLimit = parseInt(user?.maxDevices, 10) || 0;
    if (directLimit === -1) return 0;
    if (directLimit > 0) return directLimit;

    const groupLimits = (user?.groups || [])
        .map((group) => parseInt(group?.maxDevices, 10) || 0)
        .filter((limit) => limit > 0);

    return groupLimits.length ? Math.min(...groupLimits) : 0;
}

async function applyCascadeDisplayStatus(nodes) {
    const topology = await cascadeService.getTopology().catch(() => null);
    const displayStatusById = new Map(
        (topology?.nodes || [])
            .map(node => [
                String(node?.data?.id || ''),
                {
                    displayStatus: node?.data?.status,
                    rawStatus: node?.data?.rawStatus || node?.data?.status,
                },
            ])
            .filter(([id, status]) => id && status?.displayStatus)
    );

    return nodes.map(node => {
        const plain = node?.toObject ? node.toObject() : { ...node };
        const cascadeStatus = displayStatusById.get(String(plain._id));
        const displayStatus = cascadeStatus?.displayStatus || plain.status || 'offline';
        return {
            ...plain,
            rawStatus: cascadeStatus?.rawStatus || plain.status || 'offline',
            displayStatus,
            status: displayStatus,
        };
    });
}

async function getHysteriaServiceState(ssh) {
    const [serverRes, legacyRes] = await Promise.all([
        ssh.exec('(systemctl is-active hysteria-server 2>/dev/null || true) | head -n 1'),
        ssh.exec('(systemctl is-active hysteria 2>/dev/null || true) | head -n 1'),
    ]);
    const hysteriaServer = normalizeServiceState(serverRes.stdout);
    const hysteria = normalizeServiceState(legacyRes.stdout);
    const status = pickPreferredServiceState(hysteriaServer, hysteria);
    return { status, hysteriaServer, hysteria };
}

const setupJobs = new Map();
const SETUP_JOB_TTL_MS = 1000 * 60 * 60; // keep finished jobs for 1 hour
const SETUP_LOG_LIMIT = 3000;
const SETUP_MODE_LEGACY = 'legacy';
const SETUP_MODE_ONBOARDING_FULL = 'onboarding-full';
const LEGACY_ONBOARDING_BRIDGE_STEPS = [
    'preflight',
    'prepare-host',
    'install-runtime',
    'write-runtime-config',
    'verify-runtime-local',
    'install-agent',
    'verify-agent-local',
    'verify-panel-to-agent',
    'seed-node-state',
    'final-sync',
];
const ONBOARDING_RERUN_ALLOWED_STEPS = [...LEGACY_ONBOARDING_BRIDGE_STEPS];

function cleanupSetupJobs() {
    const now = Date.now();
    for (const [nodeId, job] of setupJobs.entries()) {
        if (!job) continue;
        if (job.state === 'running') continue;
        if ((now - (job.finishedAt || job.startedAt || now)) > SETUP_JOB_TTL_MS) {
            setupJobs.delete(nodeId);
        }
    }
}

function getSetupJob(nodeId) {
    cleanupSetupJobs();
    return setupJobs.get(String(nodeId)) || null;
}

function getLegacySetupJob(nodeId) {
    const job = getSetupJob(nodeId);
    if (!job) return null;
    const mode = normalizeSetupMode(job.setupMode);
    return (!mode || mode === SETUP_MODE_LEGACY) ? job : null;
}

function setSetupJob(nodeId, patch) {
    const key = String(nodeId);
    const prev = setupJobs.get(key) || {};
    const next = { ...prev, ...patch };
    setupJobs.set(key, next);
    return next;
}

function trimSetupLogs(logs, limit = SETUP_LOG_LIMIT) {
    const arr = Array.isArray(logs) ? logs : [];
    if (arr.length <= limit) return arr;
    return arr.slice(arr.length - limit);
}

function appendSetupJobLiveLog(nodeId, rawLine) {
    const line = String(rawLine || '').trimEnd();
    if (!line) return;
    const current = getLegacySetupJob(nodeId);
    if (!current) return;
    const nextLogs = trimSetupLogs([...(Array.isArray(current.logs) ? current.logs : []), line]);
    setSetupJob(nodeId, { logs: nextLogs, setupMode: SETUP_MODE_LEGACY });
}

function mergeSetupStatusLogs(primaryLogs = [], secondaryLogs = []) {
    const merged = [];
    const seen = new Set();
    const push = (line) => {
        const text = String(line || '').trimEnd();
        if (!text) return;
        if (seen.has(text)) return;
        seen.add(text);
        merged.push(text);
    };
    (Array.isArray(primaryLogs) ? primaryLogs : []).forEach(push);
    (Array.isArray(secondaryLogs) ? secondaryLogs : []).forEach(push);
    return trimSetupLogs(merged);
}

function formatOnboardingStepLog(log) {
    const ts = log?.at ? new Date(log.at).toISOString() : new Date().toISOString();
    const step = String(log?.step || '').trim();
    const prefix = step ? `[${step}] ` : '';
    return `[${ts}] ${prefix}${String(log?.message || '').trim()}`.trim();
}

function detectOnboardingStepFromLine(line) {
    const normalized = String(line || '').trim().toLowerCase();
    if (!normalized) return 'preflight';
    const bracketMatch = normalized.match(/^\[([^\]]+)\]/);
    const bracketStep = String(bracketMatch?.[1] || '').trim().toLowerCase();
    if (isKnownStep(bracketStep)) return bracketStep;

    for (const step of ONBOARDING_RERUN_ALLOWED_STEPS) {
        if (normalized.includes(step)) return step;
    }
    return 'preflight';
}

function shouldSkipOnboardingLiveLine(line) {
    const text = String(line || '').trim();
    if (!text) return true;
    if (/^[.+*\- ]{40,}$/.test(text)) return true;
    if (/^\s*%\s*Total\s+%\s*Received/i.test(text)) return true;
    if (/^\s*\d+\s+\d+\s+\d+\s+\d+/.test(text)) return true;
    return false;
}

function appendOnboardingLiveLog(onboardingJobId, rawLine) {
    const jobId = String(onboardingJobId || '').trim();
    const line = String(rawLine || '').trimEnd();
    if (!jobId || shouldSkipOnboardingLiveLine(line)) return;

    const step = detectOnboardingStepFromLine(line);
    const lower = line.toLowerCase();
    const level = lower.includes('failed') || lower.includes('error')
        ? 'error'
        : (lower.includes('[stderr]') || lower.includes('warning') ? 'warning' : 'info');

    nodeOnboardingService.appendStepLog(jobId, {
        step,
        level,
        message: line,
    }).catch((error) => {
        logger.warn(`[Panel] onboarding live log append failed for job ${jobId}: ${error.message}`);
    });
}

function normalizeSetupMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === SETUP_MODE_ONBOARDING_FULL || normalized === 'onboarding') {
        return SETUP_MODE_ONBOARDING_FULL;
    }
    if (normalized === SETUP_MODE_LEGACY) {
        return SETUP_MODE_LEGACY;
    }
    return '';
}

function resolveOnboardingJobSetupMode(jobLike) {
    const metadata = jobLike?.metadata || {};
    const explicit = normalizeSetupMode(metadata.setupMode);
    if (explicit) return explicit;
    const flow = String(metadata.flow || '').trim().toLowerCase();
    if (flow === 'durable-onboarding-run-full') return SETUP_MODE_ONBOARDING_FULL;
    if (flow === 'legacy-setup-bridge') return SETUP_MODE_LEGACY;
    if (String(metadata.bridgeMode || '').trim().toLowerCase() === 'legacy-auto-setup') {
        return SETUP_MODE_LEGACY;
    }
    return '';
}

function isLegacyBridgeOnboardingJob(jobLike) {
    return resolveOnboardingJobSetupMode(jobLike) === SETUP_MODE_LEGACY;
}

function isOnboardingFullJob(jobLike) {
    return resolveOnboardingJobSetupMode(jobLike) === SETUP_MODE_ONBOARDING_FULL;
}

async function findSetupStatusOnboardingJob(nodeId, preferredSetupMode = '') {
    const preferredMode = normalizeSetupMode(preferredSetupMode);
    const active = await nodeOnboardingService.getActiveJobByNode(nodeId);
    if (active && String(active.status || '').trim().toLowerCase() === 'running') {
        return active;
    }

    const recent = await nodeOnboardingService.listJobsByNode(nodeId, { limit: 10 });
    if (!Array.isArray(recent) || !recent.length) return active || null;

    if (preferredMode === SETUP_MODE_ONBOARDING_FULL) {
        return recent.find(isOnboardingFullJob) || active || recent[0] || null;
    }

    if (preferredMode === SETUP_MODE_LEGACY) {
        return recent.find(isLegacyBridgeOnboardingJob) || active || recent[0] || null;
    }

    return active || recent[0] || null;
}

function resolvePanelSetupMode(node, req) {
    const requestedMode = normalizeSetupMode(
        req?.body?.setupMode
        || req?.query?.setupMode
        || req?.headers?.['x-setup-mode']
    );
    if (requestedMode) {
        return requestedMode;
    }

    return SETUP_MODE_ONBOARDING_FULL;
}

function mapOnboardingStatusToSetupState(status) {
    switch (status) {
    case 'completed':
        return 'success';
    case 'failed':
        return 'error';
    case 'blocked':
    case 'repairable':
        return 'error';
    case 'queued':
    case 'running':
        return 'running';
    default:
        return 'idle';
    }
}

function getOnboardingLogs(jobLike) {
    return Array.isArray(jobLike?.stepLogs)
        ? jobLike.stepLogs.map(formatOnboardingStepLog)
        : [];
}

function canResumeOnboardingStatus(status) {
    return ['queued', 'blocked', 'repairable'].includes(String(status || ''));
}

function canRerunOnboardingStatus(status) {
    return ['queued', 'blocked', 'repairable', 'failed', 'completed'].includes(String(status || ''));
}

async function safeOnboardingUpdate(onboardingJobId, action, logs, updater) {
    if (!onboardingJobId || typeof updater !== 'function') return null;
    try {
        return await updater();
    } catch (error) {
        logger.warn(`[Panel] Onboarding bridge "${action}" failed for job ${onboardingJobId}: ${error.message}`);
        if (Array.isArray(logs)) {
            logs.push(`[Onboarding] ${action} warning: ${error.message}`);
        }
        return null;
    }
}

async function ensureOnboardingJobForSetup(node, actorLabel = '', setupMode = SETUP_MODE_LEGACY) {
    const normalizedMode = normalizeSetupMode(setupMode) || SETUP_MODE_LEGACY;
    const flow = normalizedMode === SETUP_MODE_ONBOARDING_FULL
        ? 'durable-onboarding-run-full'
        : 'legacy-setup-bridge';
    const created = await nodeOnboardingService.createJob({
        nodeId: node._id,
        type: 'fresh-install',
        trigger: {
            source: 'panel',
            actorLabel: actorLabel || `panel:${node.name}`,
        },
        metadata: {
            flow,
            setupMode: normalizedMode,
            nodeType: node.type || 'hysteria',
            cascadeRole: node.cascadeRole || 'standalone',
        },
    });

    let started = await nodeOnboardingService.startJob(created.job.id, {
        actorLabel: actorLabel || `panel:${node.name}`,
    });

    let startedMode = resolveOnboardingJobSetupMode(started);
    if (!startedMode) {
        try {
            started = await nodeOnboardingService.touchHeartbeat(started.id, {
                flow,
                setupMode: normalizedMode,
            });
            startedMode = resolveOnboardingJobSetupMode(started);
        } catch (metadataError) {
            logger.warn(`[Panel] Failed to normalize onboarding metadata for ${node.name}: ${metadataError.message}`);
        }
    }

    if (normalizedMode === SETUP_MODE_ONBOARDING_FULL && startedMode === SETUP_MODE_LEGACY) {
        logger.warn(`[Panel] Skip onboarding-full run for ${node.name}: active onboarding job ${started.id} is legacy bridge mode`);
        return '';
    }

    if (normalizedMode === SETUP_MODE_LEGACY && startedMode === SETUP_MODE_ONBOARDING_FULL) {
        logger.warn(`[Panel] Skip legacy bridge mirror for ${node.name}: active onboarding job ${started.id} is durable mode`);
        return '';
    }

    return started.id;
}

async function shouldApplyLegacyOnboardingBridge(onboardingJobId, logs) {
    if (!onboardingJobId) return false;
    try {
        const onboardingJob = await nodeOnboardingService.getJob(onboardingJobId);
        if (isLegacyBridgeOnboardingJob(onboardingJob)) {
            return true;
        }
        logger.info(`[Panel] Legacy bridge mirror skipped for onboarding job ${onboardingJobId}: durable mode detected`);
        if (Array.isArray(logs)) {
            logs.push('[Onboarding] Synthetic legacy bridge skipped (durable onboarding job)');
        }
        return false;
    } catch (error) {
        logger.warn(`[Panel] Unable to resolve onboarding job mode for ${onboardingJobId}: ${error.message}`);
        if (Array.isArray(logs)) {
            logs.push(`[Onboarding] Legacy bridge mode check failed: ${error.message}`);
        }
        return false;
    }
}

async function completeLegacyOnboardingBridge(onboardingJobId, node, logs, details = {}) {
    if (!await shouldApplyLegacyOnboardingBridge(onboardingJobId, logs)) return;
    const base = {
        bridgeMode: 'legacy-auto-setup',
        nodeType: node.type || 'hysteria',
        cascadeRole: node.cascadeRole || 'standalone',
        ...details,
    };

    for (const step of LEGACY_ONBOARDING_BRIDGE_STEPS) {
        await safeOnboardingUpdate(onboardingJobId, `step ${step} complete`, logs, async () => {
            await nodeOnboardingService.markStepCompleted(onboardingJobId, step, base);
        });
    }

    await safeOnboardingUpdate(onboardingJobId, 'job complete', logs, async () => {
        await nodeOnboardingService.completeJob(onboardingJobId, base);
    });
}

async function failLegacyOnboardingBridge(onboardingJobId, step, errorLike, logs) {
    if (!await shouldApplyLegacyOnboardingBridge(onboardingJobId, logs)) return;
    const message = errorLike?.message || String(errorLike || 'Onboarding bridge failure');
    await safeOnboardingUpdate(onboardingJobId, `step ${step} fail`, logs, async () => {
        await nodeOnboardingService.markStepFailed(
            onboardingJobId,
            step || 'install-runtime',
            { message },
            { repairable: true }
        );
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function finalizeXraySetup(node, logs, onLogLine = null) {
    if (node.type !== 'xray') {
        return;
    }
    const pushLog = (line) => {
        logs.push(line);
        if (typeof onLogLine === 'function') onLogLine(line);
    };

    pushLog('[Xray] Finalizing setup with cascade/config sync...');
    const result = await syncService.finalizeNodeSetup(node);
    if (result.mode === 'cascade') {
        pushLog(`[Cascade] Chain deployment completed (${result.deployed} node(s) updated)`);
    } else if (result.mode === 'xray-sync') {
        pushLog('[Xray] Post-setup sync completed');
    } else if (result.mode === 'bridge-ready') {
        pushLog('[Bridge] Xray binary installed; waiting for cascade link deployment');
    }
}

async function warmXrayAgentAfterSetup(nodeId, logs, onLogLine = null) {
    const pushLog = (line) => {
        logs.push(line);
        if (typeof onLogLine === 'function') onLogLine(line);
    };
    const attempts = 6;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const node = await HyNode.findById(nodeId);
        if (!node || node.type !== 'xray' || (node.cascadeRole || 'standalone') === 'bridge') {
            return;
        }

        try {
            const runtimeNode = await syncService._ensureXrayAgentReady(node);
            const response = await syncService._agentRequest(runtimeNode, 'GET', '/info');
            const data = response.data || {};
            const usersCount = Number(data.users_count || 0);

            await HyNode.updateOne(
                { _id: node._id },
                {
                    $set: {
                        status: 'online',
                        healthFailures: 0,
                        lastError: '',
                        xrayVersion: data.xray_version || '',
                        agentVersion: data.agent_version || '',
                        agentStatus: 'online',
                        agentLastSeen: new Date(),
                        onlineUsers: usersCount,
                    },
                },
            );

            const version = data.xray_version ? `, Xray ${data.xray_version}` : '';
            pushLog(`[Xray] CC Agent is online after setup${version}`);
            return;
        } catch (_) {}

        if (attempt < attempts) {
            pushLog(`[Xray] Waiting for CC Agent warm-up (${attempt}/${attempts})...`);
            await delay(2000);
        }
    }

    pushLog('[Xray] CC Agent did not answer immediately after setup; background health check will finish metadata sync');
}

async function runNodeSetupJob(nodeId, onboardingJobId = '') {
    const key = String(nodeId);
    let node = await HyNode.findById(nodeId);
    let effectiveOnboardingJobId = String(onboardingJobId || getLegacySetupJob(key)?.onboardingJobId || '');

    if (!node) {
        await failLegacyOnboardingBridge(effectiveOnboardingJobId, 'preflight', 'Node not found', []);
        setSetupJob(key, {
            state: 'error',
            error: 'Нода не найдена',
            finishedAt: Date.now(),
            logs: ['Node not found'],
            setupMode: SETUP_MODE_LEGACY,
        });
        return;
    }

    logger.info(`[Panel] Background setup started for node ${node.name} (type: ${node.type || 'hysteria'}, role: ${node.cascadeRole || 'standalone'})`);

    let logs = [];
    const pushLiveLog = (line) => appendSetupJobLiveLog(key, line);
    let onboardingFailureStep = 'install-runtime';
    try {
        if (!effectiveOnboardingJobId) {
            effectiveOnboardingJobId = await ensureOnboardingJobForSetup(node, `panel:${node.name}`, SETUP_MODE_LEGACY);
            setSetupJob(key, { onboardingJobId: effectiveOnboardingJobId });
        }

        await safeOnboardingUpdate(effectiveOnboardingJobId, 'start preflight', logs, async () => {
            await nodeOnboardingService.markStepRunning(effectiveOnboardingJobId, 'preflight', {
                bridgeMode: 'legacy-auto-setup',
                nodeType: node.type || 'hysteria',
            });
            await nodeOnboardingService.markStepCompleted(effectiveOnboardingJobId, 'preflight', {
                bridgeMode: 'legacy-auto-setup',
            });
        });

        let result;
        if (node.type === 'xray' && node.cascadeRole === 'bridge') {
            result = await nodeSetup.setupXrayNode(node, { restartService: false, exitOnly: true, onLogLine: pushLiveLog });
            if (result.success) {
                result.logs = result.logs || [];
                result.logs.push('[Bridge] Xray installed. Create a cascade link to deploy bridge config.');
                pushLiveLog('[Bridge] Xray installed. Create a cascade link to deploy bridge config.');
            }
        } else if (node.type === 'xray') {
            result = await nodeSetup.setupXrayNodeWithAgent(node, { restartService: true, strictAgent: true, onLogLine: pushLiveLog });
        } else {
            result = await nodeSetup.setupNode(node, {
                installHysteria: true,
                setupPortHopping: true,
                restartService: true,
                onLogLine: pushLiveLog,
            });
        }

        const streamedLogs = Array.isArray(getLegacySetupJob(key)?.logs) ? getLegacySetupJob(key).logs : [];
        logs = streamedLogs.length
            ? streamedLogs
            : (Array.isArray(result.logs) ? result.logs : []);

        if (result.success) {
            try {
                onboardingFailureStep = 'final-sync';
                await finalizeXraySetup(node, logs, pushLiveLog);
                await warmXrayAgentAfterSetup(node._id, logs, pushLiveLog);
            } catch (syncErr) {
                logs.push(`[Xray] Finalization failed: ${syncErr.message}`);
                pushLiveLog(`[Xray] Finalization failed: ${syncErr.message}`);
                throw syncErr;
            }

            const updateFields = { status: 'online', lastSync: new Date(), lastError: '', healthFailures: 0 };
            if (node.type !== 'xray') updateFields.useTlsFiles = result.useTlsFiles;
            await HyNode.findByIdAndUpdate(node._id, { $set: updateFields });

            await completeLegacyOnboardingBridge(effectiveOnboardingJobId, node, logs, {
                useTlsFiles: !!result.useTlsFiles,
                setupResult: 'success',
            });

            setSetupJob(key, {
                state: 'success',
                message: 'Нода успешно настроена',
                logs,
                finishedAt: Date.now(),
                error: '',
                onboardingJobId: effectiveOnboardingJobId,
                setupMode: SETUP_MODE_LEGACY,
            });
            logger.info(`[Panel] Background setup completed for node ${node.name}`);
        } else {
            await HyNode.findByIdAndUpdate(node._id, {
                $set: { status: 'error', lastError: result.error, healthFailures: 0 },
            });
            await failLegacyOnboardingBridge(
                effectiveOnboardingJobId,
                onboardingFailureStep,
                { message: result.error || 'Setup failed' },
                logs
            );
            setSetupJob(key, {
                state: 'error',
                error: result.error || 'Setup failed',
                logs,
                finishedAt: Date.now(),
                onboardingJobId: effectiveOnboardingJobId,
                setupMode: SETUP_MODE_LEGACY,
            });
            logger.warn(`[Panel] Background setup failed for node ${node.name}: ${result.error}`);
        }
    } catch (error) {
        logger.error(`[Panel] Background setup exception: ${error.message}`);
        await HyNode.findByIdAndUpdate(node._id, {
            $set: { status: 'error', lastError: error.message, healthFailures: 0 },
        });
        const existingLogs = getLegacySetupJob(key)?.logs || [];
        await failLegacyOnboardingBridge(effectiveOnboardingJobId, onboardingFailureStep, error, existingLogs);
        setSetupJob(key, {
            state: 'error',
            error: error.message,
            logs: [...existingLogs, ...logs, `Exception: ${error.message}`],
            finishedAt: Date.now(),
            onboardingJobId: effectiveOnboardingJobId,
            setupMode: SETUP_MODE_LEGACY,
        });
    }
}

async function runNodeOnboardingJob(nodeId, onboardingJobId = '') {
    const normalizedJobId = String(onboardingJobId || '').trim();
    const node = await HyNode.findById(nodeId);
    const pushLiveLog = (line) => appendOnboardingLiveLog(normalizedJobId, line);
    if (!node) {
        const fallbackError = 'Нода не найдена';
        if (normalizedJobId) {
            await safeOnboardingUpdate(normalizedJobId, 'fail preflight', [], async () => {
                await nodeOnboardingService.markStepFailed(
                    normalizedJobId,
                    'preflight',
                    { message: fallbackError },
                    { repairable: false }
                );
            });
        }
        return;
    }

    logger.info(`[Panel] Durable onboarding runFull started for ${node.name} (${node.type || 'hysteria'})`);
    try {
        const job = await nodeOnboardingPipeline.runFull(normalizedJobId, {
            source: 'panel',
            actor: `panel:${node.name}`,
            setupMode: SETUP_MODE_ONBOARDING_FULL,
            onLogLine: pushLiveLog,
        });

        if (job?.status === 'completed') {
            logger.info(`[Panel] Durable onboarding completed for ${node.name}`);
            return;
        }

        const onboardingError = job?.lastError?.message || `Onboarding stopped with status: ${job?.status || 'unknown'}`;
        await HyNode.findByIdAndUpdate(node._id, {
            $set: { status: 'error', lastError: onboardingError, healthFailures: 0 },
        });
        logger.warn(`[Panel] Durable onboarding failed for ${node.name}: ${onboardingError}`);
    } catch (error) {
        logger.error(`[Panel] Durable onboarding exception for ${node.name}: ${error.message}`);
        const mergedLogs = [`Exception: ${error.message}`];

        await safeOnboardingUpdate(normalizedJobId, 'mark failed on exception', mergedLogs, async () => {
            const job = await nodeOnboardingService.getJob(normalizedJobId);
            const failedStep = job?.currentStep || 'preflight';
            await nodeOnboardingService.markStepFailed(
                normalizedJobId,
                failedStep,
                error,
                { repairable: true }
            );
        });

        await HyNode.findByIdAndUpdate(node._id, {
            $set: { status: 'error', lastError: error.message, healthFailures: 0 },
        });
    }
}

function schedulePanelOnboardingRunner(nodeId, onboardingJobId) {
    setImmediate(() => {
        runNodeOnboardingJob(nodeId, onboardingJobId).catch((err) => {
            logger.error(`[Panel] onboarding background runner fatal: ${err.message}`);
        });
    });
}

function startPanelOnboardingRun(node, onboardingJob, {
    message = 'Onboarding запущен в фоне',
    logs = [],
} = {}) {
    const startedAt = Date.now();
    const fallbackLog = `[${new Date(startedAt).toISOString()}] ${message}`;
    const initialLogs = Array.isArray(logs) && logs.length ? logs : [fallbackLog];
    schedulePanelOnboardingRunner(node._id, onboardingJob.id);
    return {
        startedAt,
        logs: initialLogs,
        onboardingJobId: onboardingJob.id,
        setupMode: SETUP_MODE_ONBOARDING_FULL,
    };
}

function getHybridSidecarRuntime(node) {
    const raw = node?.cascadeSidecar || {};
    const socksPort = Number(raw.socksPort) > 0 ? Number(raw.socksPort) : 11080;
    const rawServiceName = String(raw.serviceName || 'xray-cascade').trim() || 'xray-cascade';
    const serviceName = rawServiceName.endsWith('.service') ? rawServiceName : `${rawServiceName}.service`;
    const sidecarConfigPath = String(raw.configPath || '/usr/local/etc/xray-cascade/config.json').trim() || '/usr/local/etc/xray-cascade/config.json';
    const hysteriaConfigPath = String(node?.paths?.config || '/etc/hysteria/config.yaml').trim() || '/etc/hysteria/config.yaml';
    return {
        socksPort,
        serviceName,
        sidecarConfigPath,
        hysteriaConfigPath,
    };
}

async function runHybridSidecarSmokeCheck(node) {
    const runtime = getHybridSidecarRuntime(node);
    const checks = [];
    const logs = [];
    let ssh;

    const pushCheck = (name, ok, details) => {
        checks.push({ name, ok, details: details || '' });
        logs.push(`[${ok ? 'PASS' : 'FAIL'}] ${name}${details ? ` — ${details}` : ''}`);
    };

    try {
        ssh = new NodeSSH(node);
        await ssh.connect();

        logs.push(`[INFO] Node: ${node.name} (${node.ip})`);
        logs.push(`[INFO] sidecar service: ${runtime.serviceName}`);
        logs.push(`[INFO] sidecar config: ${runtime.sidecarConfigPath}`);
        logs.push(`[INFO] hysteria config: ${runtime.hysteriaConfigPath}`);
        logs.push(`[INFO] SOCKS port: ${runtime.socksPort}`);

        const { status: hysteriaStatus, hysteriaServer, hysteria } = await getHysteriaServiceState(ssh);
        let hysteriaDetails = `status=${hysteriaStatus || 'unknown'}; hysteria-server=${hysteriaServer || 'n/a'}; hysteria=${hysteria || 'n/a'}`;
        if (hysteriaStatus !== 'active') {
            const hysteriaJournal = await ssh.exec('journalctl -u hysteria-server -u hysteria -n 12 --no-pager 2>/dev/null || true');
            const journalTail = String(hysteriaJournal.stdout || hysteriaJournal.stderr || '')
                .trim()
                .split('\n')
                .slice(-3)
                .join(' | ');
            if (journalTail) hysteriaDetails += `; logs=${journalTail}`;
        }
        pushCheck('hysteria service active', hysteriaStatus === 'active', hysteriaDetails);

        const sidecarState = await ssh.exec(`(systemctl is-active ${shellQuote(runtime.serviceName)} 2>/dev/null || true) | head -n 1`);
        const sidecarStatus = String(sidecarState.stdout || '').trim();
        let sidecarDetails = `status=${sidecarStatus || 'unknown'}`;
        if (sidecarStatus !== 'active') {
            const sidecarJournal = await ssh.exec(`journalctl -u ${shellQuote(runtime.serviceName)} -n 12 --no-pager 2>/dev/null || true`);
            const journalTail = String(sidecarJournal.stdout || sidecarJournal.stderr || '')
                .trim()
                .split('\n')
                .slice(-3)
                .join(' | ');
            if (journalTail) sidecarDetails += `; logs=${journalTail}`;
        }
        pushCheck('sidecar service active', sidecarStatus === 'active', sidecarDetails);

        const sidecarConfig = await ssh.exec(`[ -f ${shellQuote(runtime.sidecarConfigPath)} ] && echo yes || echo no`);
        pushCheck('sidecar config exists', String(sidecarConfig.stdout || '').trim() === 'yes', runtime.sidecarConfigPath);

        const hysteriaConfig = await ssh.exec(`[ -f ${shellQuote(runtime.hysteriaConfigPath)} ] && echo yes || echo no`);
        pushCheck('hysteria config exists', String(hysteriaConfig.stdout || '').trim() === 'yes', runtime.hysteriaConfigPath);

        const sidecarRule = await ssh.exec(`grep -n "__cascade_sidecar__" ${shellQuote(runtime.hysteriaConfigPath)} 2>/dev/null | head -n 1`);
        const sidecarRuleLine = String(sidecarRule.stdout || '').trim();
        const CascadeLink = require('../../models/cascadeLinkModel');
        const overlayRequired = !!(await CascadeLink.exists({
            active: true,
            $or: [
                { portalNode: node._id },
                { bridgeNode: node._id, mode: 'forward' },
            ],
        }));
        if (overlayRequired) {
            pushCheck('overlay marker in hysteria config', !!sidecarRuleLine, sidecarRuleLine || 'not found');
        } else {
            pushCheck(
                'overlay marker in hysteria config',
                true,
                sidecarRuleLine || 'not required (no active portal/forward-hop links)'
            );
        }

        const listenCheck = await ssh.exec(`ss -ltnH '( sport = :${runtime.socksPort} )' | wc -l`);
        const listeners = parseInt(String(listenCheck.stdout || '0').trim(), 10) || 0;
        pushCheck('sidecar listens on SOCKS port', listeners > 0, `port=${runtime.socksPort}, listeners=${listeners}`);

        const xrayBinary = await ssh.exec('command -v xray >/dev/null 2>&1 && echo yes || echo no');
        pushCheck('xray binary present', String(xrayBinary.stdout || '').trim() === 'yes', '/usr/local/bin/xray');
    } finally {
        if (ssh) ssh.disconnect();
    }

    const passed = checks.filter(c => c.ok).length;
    const failed = checks.length - passed;
    logs.push(`[SUMMARY] PASS=${passed} FAIL=${failed}`);

    return {
        success: failed === 0,
        checks,
        summary: { passed, failed, total: checks.length },
        logs,
        runtime,
    };
}

// ==================== DASHBOARD ====================

// GET /panel - Dashboard
router.get('/', async (req, res) => {
    try {
        let counts = await cache.getDashboardCounts();
        
        if (!counts) {
            const [trafficAgg, usersTotal, usersEnabled, nodesTotal, nodesOnline] = await Promise.all([
                HyUser.aggregate([
                    { $group: { 
                        _id: null, 
                        tx: { $sum: '$traffic.tx' }, 
                        rx: { $sum: '$traffic.rx' } 
                    }}
                ]),
                HyUser.countDocuments(),
                HyUser.countDocuments({ enabled: true }),
                HyNode.countDocuments(),
                HyNode.countDocuments({ status: 'online' }),
            ]);
            
            const trafficStats = trafficAgg[0] || { tx: 0, rx: 0 };
            
            counts = {
                usersTotal,
                usersEnabled,
                nodesTotal,
                nodesOnline,
                trafficStats,
            };
            
            await cache.setDashboardCounts(counts);
        }
        
        const { usersTotal, usersEnabled, nodesTotal, trafficStats } = counts;

        const [rawNodes, enabledUsers, settings] = await Promise.all([
            HyNode.find({ active: true })
                .select('name ip status onlineUsers maxOnlineUsers groups traffic type flag rankingCoefficient')
                .populate('groups', 'name color')
                .sort({ rankingCoefficient: 1, name: 1 }),
            HyUser.find({ enabled: true })
                .select('userId maxDevices groups')
                .populate('groups', 'maxDevices')
                .lean(),
            Settings.findOne().lean(),
        ]);

        const nodes = await applyCascadeDisplayStatus(rawNodes);
        const nodesOnline = nodes.filter(node => node.status === 'online').length;
        
        const totalOnline = nodes.reduce((sum, n) => sum + (n.onlineUsers || 0), 0);
        
        const totalTrafficBytes = (trafficStats.tx || 0) + (trafficStats.rx || 0);
        const gracePeriodMs = ((settings?.deviceGracePeriod ?? 15) * 60 * 1000);
        const now = Date.now();

        const deviceEntries = await Promise.all(enabledUsers.map(async (user) => {
            const deviceIPs = user?.userId ? await cache.getDeviceIPs(user.userId) : {};
            const activeDevices = Object.values(deviceIPs).filter((timestamp) => (
                now - parseInt(timestamp, 10) < gracePeriodMs
            )).length;

            return {
                activeDevices,
                hasActivity: activeDevices > 0,
                limit: calculateEffectiveUserDeviceLimit(user),
            };
        }));

        const deviceStats = deviceEntries.reduce((acc, entry) => {
            acc.activeDevices += entry.activeDevices;
            if (entry.hasActivity) acc.activeProfiles += 1;
            if (entry.limit > 0) {
                acc.limitedProfiles += 1;
                acc.capacity += entry.limit;
            } else {
                acc.unlimitedProfiles += 1;
            }
            return acc;
        }, {
            activeDevices: 0,
            activeProfiles: 0,
            limitedProfiles: 0,
            unlimitedProfiles: 0,
            capacity: 0,
        });

        const hasLiveDeviceTelemetry = deviceStats.activeDevices > 0 || deviceStats.activeProfiles > 0;
        const fallbackProfileCount = Math.min(totalOnline, usersEnabled);
        const dashboardDeviceStats = hasLiveDeviceTelemetry ? deviceStats : {
            ...deviceStats,
            activeDevices: totalOnline,
            activeProfiles: fallbackProfileCount,
            estimatedFromOnline: totalOnline > 0,
        };

        const trafficWindowPeriod = '7d';
        const trafficWindowData = await statsService.getTrafficChart(trafficWindowPeriod);

        const trafficHistoryPoints = (trafficWindowData?.labels || []).map((label, index) => ({
            label,
            value: (trafficWindowData?.datasets?.tx?.[index] || 0) + (trafficWindowData?.datasets?.rx?.[index] || 0),
        }));
        
        render(res, 'dashboard', {
            title: res.locals.t('dashboard.title') || res.locals.t('nav.dashboard') || 'Dashboard',
            page: 'dashboard',
            stats: {
                users: { total: usersTotal, enabled: usersEnabled },
                nodes: { total: nodesTotal, online: nodesOnline },
                onlineUsers: totalOnline,
                lastSync: syncService.lastSyncTime,
                traffic: {
                    tx: trafficStats.tx || 0,
                    rx: trafficStats.rx || 0,
                    total: totalTrafficBytes,
                },
                trafficWindow: {
                    period: trafficWindowData?.period || trafficWindowPeriod,
                    tx: trafficWindowData?.totals?.tx || 0,
                    rx: trafficWindowData?.totals?.rx || 0,
                    total: trafficWindowData?.totals?.total || 0,
                    points: trafficHistoryPoints,
                },
                devices: {
                    activeDevices: dashboardDeviceStats.activeDevices,
                    activeProfiles: dashboardDeviceStats.activeProfiles,
                    capacity: dashboardDeviceStats.capacity,
                    limitedProfiles: dashboardDeviceStats.limitedProfiles,
                    unlimitedProfiles: dashboardDeviceStats.unlimitedProfiles,
                    estimatedFromOnline: !!dashboardDeviceStats.estimatedFromOnline,
                },
            },
            nodes,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// ==================== NODES ====================

// GET /panel/nodes - Node list
router.get('/nodes', async (req, res) => {
    try {
        const CascadeLink = require('../../models/cascadeLinkModel');
        const [rawNodes, groups, linksCount, settings] = await Promise.all([
            HyNode.find().populate('groups', 'name color').sort({ rankingCoefficient: 1, name: 1 }),
            getActiveGroups(),
            CascadeLink.countDocuments({ active: true }),
            Settings.get(),
        ]);

        const nodes = await applyCascadeDisplayStatus(rawNodes);

        render(res, 'nodes', {
            title: res.locals.locales.nodes.title,
            page: 'nodes',
            nodes,
            groups,
            linksCount,
            loadBalancingEnabled: !!(settings?.loadBalancing?.enabled),
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /panel/nodes/add - Node creation form
router.get('/nodes/add', async (req, res) => {
    try {
        const groups = await getActiveGroups();
        render(res, 'node-form', {
            title: res.locals.t('nodes.newNode'),
            page: 'nodes',
            node: null,
            groups,
            cascadeLinks: [],
            error: req.query.error || null,
            panelDomain: config.PANEL_DOMAIN || '',
        });
    } catch (error) {
        logger.error('[Panel] GET /nodes/add error:', error.message);
        res.status(500).send('Error: ' + error.message);
    }
});

// PATCH /panel/nodes/reorder - Bulk-update rankingCoefficient from drag-and-drop
router.patch('/nodes/reorder', async (req, res) => {
    try {
        const order = req.body.order;

        if (!Array.isArray(order) || order.length === 0 || order.length > 500) {
            return res.status(400).json({ success: false, error: 'Invalid order array' });
        }

        const mongoose = require('mongoose');
        const bulk = [];

        for (const item of order) {
            if (!mongoose.Types.ObjectId.isValid(item.id)) continue;
            const pos = parseInt(item.position, 10);
            if (!Number.isFinite(pos) || pos < 0) continue;
            bulk.push({
                updateOne: {
                    filter: { _id: new mongoose.Types.ObjectId(item.id) },
                    update: { $set: { rankingCoefficient: pos } },
                },
            });
        }

        if (bulk.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid entries' });
        }

        const result = await HyNode.bulkWrite(bulk, { ordered: false });
        logger.info(`[Panel] Reorder: ${bulk.length} ops, matched=${result.matchedCount}, modified=${result.modifiedCount}`);

        if (result.matchedCount === 0) {
            return res.status(400).json({ success: false, error: `No nodes matched (${bulk.length} ops sent)` });
        }

        await Promise.all([
            cache.invalidateNodes(),
            cache.invalidateAllSubscriptions(),
        ]);

        res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    } catch (error) {
        logger.error(`[Panel] Reorder nodes error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /panel/nodes - Create node
router.post('/nodes', async (req, res) => {
    try {
        const { name, ip } = req.body;

        if (!name || !ip) {
            return res.redirect(`/panel/nodes/add?error=${encodeURIComponent('Name and IP address are required')}`);
        }

        const existing = await HyNode.findOne({ ip });
        if (existing) {
            return res.redirect(`/panel/nodes/add?error=${encodeURIComponent('A node with this IP already exists')}`);
        }

        const sshPassword = req.body['ssh.password'] || '';
        const encryptedPassword = sshPassword ? cryptoService.encrypt(sshPassword) : '';

        const sshPrivateKeyRaw = req.body['ssh.privateKey'] || '';
        let encryptedPrivateKey = '';
        if (sshPrivateKeyRaw.trim()) {
            if (!sshKeyService.isValidPrivateKey(sshPrivateKeyRaw)) {
                return res.redirect(`/panel/nodes/add?error=${encodeURIComponent('Invalid private key format')}`);
            }
            encryptedPrivateKey = cryptoService.encrypt(sshPrivateKeyRaw.trim());
        }

        let groups = [];
        if (req.body.groups) {
            groups = Array.isArray(req.body.groups) ? req.body.groups : [req.body.groups];
        }

        const nodeType = req.body.type === 'xray' ? 'xray' : 'hysteria';

        const statsSecret = req.body.statsSecret || cryptoService.generateNodeSecret();

        const sameHostPort = await resolveNodePortForSameHost(ip, req.body.port);

        const nodeData = {
            name,
            ip,
            type: nodeType,
            domain: req.body.domain || '',
            sni: req.body.sni || '',
            flag: req.body.flag || '',
            port: sameHostPort.port,
            portRange: req.body.portRange || '20000-50000',
            statsPort: parseInt(req.body.statsPort) || 9999,
            statsSecret,
            groups,
            maxOnlineUsers: parseInt(req.body.maxOnlineUsers) || 0,
            rankingCoefficient: parseFloat(req.body.rankingCoefficient) || 1,
            active: req.body.active === 'on',
            useCustomConfig: req.body.useCustomConfig === 'on',
            customConfig: req.body.customConfig || '',
            cascadeRole: req.body.cascadeRole || 'standalone',
            country: req.body.country || '',
            obfs: {
                type: req.body['obfs.type'] || '',
                password: req.body['obfs.password'] || '',
            },
            ssh: {
                port: parseInt(req.body['ssh.port']) || 22,
                username: req.body['ssh.username'] || 'root',
                password: encryptedPassword,
                privateKey: encryptedPrivateKey,
            },
        };

        if (nodeType === 'xray') {
            nodeData.xray = parseXrayFormFields(req.body);
        } else {
            const hyFields = parseHysteriaFormFields(req.body);
            const hyValidationError = validateHysteriaFormFields(hyFields);
            if (hyValidationError) {
                return res.redirect(`/panel/nodes/add?error=${encodeURIComponent(hyValidationError)}`);
            }
            delete hyFields.acmeDnsConfigValid;
            Object.assign(nodeData, hyFields);
        }

        const newNode = await HyNode.create(nodeData);
        logger.info(`[Panel] Created ${nodeType} node ${name} (${ip})`);
        if (sameHostPort.adjusted) {
            logger.warn(`[Panel] Auto-adjusted same-host node port for ${name}: ${sameHostPort.requestedPort} -> ${sameHostPort.port}`);
        }
        // Invalidate active-nodes and all subscription caches so changes are reflected immediately
        await Promise.all([
            cache.invalidateNodes(),
            cache.invalidateAllSubscriptions(),
        ]);
        res.redirect(`/panel/nodes/${newNode._id}`);
    } catch (error) {
        logger.error(`[Panel] Create node error: ${error.message}`);
        res.redirect(`/panel/nodes/add?error=${encodeURIComponent(error.message)}`);
    }
});

// POST /panel/nodes/scan-sni - Stream TLS 1.3+H2 scan results as SSE
router.post('/nodes/scan-sni', sniScanLimiter, async (req, res) => {
    const ip      = String(req.body.ip      || '').trim();
    const port    = Math.min(65535, Math.max(1,   parseInt(req.body.port,    10) || 443));
    const threads = Math.min(200,   Math.max(1,   parseInt(req.body.threads, 10) || 50));
    const timeout = Math.min(30,    Math.max(2,   parseInt(req.body.timeout, 10) || 5));

    if (!sniScanner.isValidIpv4(ip)) {
        return res.status(400).json({ error: 'Invalid IPv4 address' });
    }

    res.setHeader('Content-Type',      'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control',     'no-cache');
    res.setHeader('Connection',        'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const send = (type, data = {}) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
            // Force flush through compression middleware if present
            if (typeof res.flush === 'function') res.flush();
        }
    };

    try {
        await sniScanner.scanRange({
            ip,
            port,
            threads,
            timeout,
            signal:      controller.signal,
            onResult:    r             => send('result',   r),
            onProgress:  (done, total) => send('progress', { done, total }),
            onVerifying: ()            => send('verifying'),
        });
        send('done');
    } catch (err) {
        logger.error(`[SNI Scan] ${err.message}`);
        send('error', { message: err.message });
    } finally {
        res.end();
    }
});

// POST /panel/nodes/preview-config - Generate config preview from current form values
router.post('/nodes/preview-config', async (req, res) => {
    try {
        const nodeType = req.body.type === 'xray' ? 'xray' : 'hysteria';
        if (nodeType !== 'hysteria') {
            return res.status(400).json({ success: false, error: 'Preview config supports only Hysteria nodes' });
        }

        const hyFields = parseHysteriaFormFields(req.body);
        const hyValidationError = validateHysteriaFormFields(hyFields);
        if (hyValidationError) {
            return res.status(400).json({ success: false, error: hyValidationError });
        }
        delete hyFields.acmeDnsConfigValid;

        const nodeData = {
            type: 'hysteria',
            port: parseInt(req.body.port, 10) || 443,
            domain: (req.body.domain || '').trim(),
            sni: (req.body.sni || '').trim(),
            useTlsFiles: parseBool(req.body, 'useTlsFiles', false),
            obfs: {
                type: req.body['obfs.type'] || '',
                password: req.body['obfs.password'] || '',
            },
            statsPort: parseInt(req.body.statsPort, 10) || 9999,
            statsSecret: req.body.statsSecret || '',
            outbounds: [],
            aclRules: hyFields.aclRules || [],
            ...hyFields,
        };

        const settings = await Settings.get();
        const authInsecure = settings?.nodeAuth?.insecure ?? true;
        const authUrl = `${config.BASE_URL}/api/auth`;
        const useTlsFiles = nodeData.useTlsFiles || !nodeData.domain;

        const generatedConfig = configGenerator.generateNodeConfig(nodeData, authUrl, { authInsecure, useTlsFiles });
        return res.json({ success: true, config: generatedConfig });
    } catch (error) {
        logger.error('[Panel] Preview config generation error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// GET /panel/nodes/:id - Edit node form
router.get('/nodes/:id', async (req, res) => {
    try {
        const CascadeLink = require('../../models/cascadeLinkModel');
        const [node, groups, cascadeLinks, settings] = await Promise.all([
            HyNode.findById(req.params.id).populate('groups', 'name color'),
            getActiveGroups(),
            CascadeLink.find({
                $or: [{ portalNode: req.params.id }, { bridgeNode: req.params.id }],
            }).populate('portalNode', 'name ip flag')
              .populate('bridgeNode', 'name ip flag')
              .sort({ createdAt: -1 }),
            Settings.get(),
        ]);

        if (!node) {
            return res.redirect('/panel/nodes');
        }

        let nodeConfigPreview = '';
        if (node.type !== 'xray') {
            const customConfig = String(node.customConfig || '').trim();
            if (node.useCustomConfig && customConfig) {
                nodeConfigPreview = customConfig;
            } else {
                const authInsecure = settings?.nodeAuth?.insecure ?? true;
                const authUrl = `${config.BASE_URL}/api/auth`;
                const useTlsFiles = !!(node.useTlsFiles || !node.domain);
                nodeConfigPreview = configGenerator.generateNodeConfig(node, authUrl, { authInsecure, useTlsFiles });
            }
        }

        render(res, 'node-form', {
            title: `${res.locals.t('nodes.editNode')}: ${node.name}`,
            page: 'nodes',
            node,
            nodeConfigPreview,
            groups,
            cascadeLinks: cascadeLinks || [],
            error: req.query.error || null,
            panelDomain: config.PANEL_DOMAIN || '',
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /panel/nodes/:id - Update node
router.post('/nodes/:id', async (req, res) => {
    const nodeId = req.params.id;
    try {
        const { name, ip } = req.body;

        if (!name || !ip) {
            return res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent('Name and IP address are required')}`);
        }

        let groups = [];
        if (req.body.groups) {
            groups = Array.isArray(req.body.groups) ? req.body.groups : [req.body.groups];
        }

        const nodeType = req.body.type === 'xray' ? 'xray' : 'hysteria';

        const sameHostPort = await resolveNodePortForSameHost(ip, req.body.port);

        const updates = {
            name,
            ip,
            type: nodeType,
            domain: req.body.domain || '',
            sni: req.body.sni || '',
            port: sameHostPort.port,
            portRange: req.body.portRange || '20000-50000',
            statsPort: parseInt(req.body.statsPort) || 9999,
            groups,
            maxOnlineUsers: parseInt(req.body.maxOnlineUsers) || 0,
            rankingCoefficient: parseFloat(req.body.rankingCoefficient) || 1,
            active: req.body.active === 'on',
            useCustomConfig: req.body.useCustomConfig === 'on',
            customConfig: req.body.customConfig || '',
            obfs: {
                type: req.body['obfs.type'] || '',
                password: req.body['obfs.password'] || '',
            },
            flag: req.body.flag || '',
            cascadeRole: req.body.cascadeRole || 'standalone',
            country: req.body.country || '',
            'ssh.port': parseInt(req.body['ssh.port']) || 22,
            'ssh.username': req.body['ssh.username'] || 'root',
        };

        if (req.body.statsSecret) {
            updates.statsSecret = req.body.statsSecret;
        }

        if (nodeType === 'xray') {
            updates.xray = parseXrayFormFields(req.body);
        } else {
            const hyFields = parseHysteriaFormFields(req.body);
            const hyValidationError = validateHysteriaFormFields(hyFields);
            if (hyValidationError) {
                return res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent(hyValidationError)}`);
            }
            delete hyFields.acmeDnsConfigValid;
            Object.assign(updates, hyFields);
        }

        if (req.body['ssh.password']) {
            updates['ssh.password'] = cryptoService.encrypt(req.body['ssh.password']);
        }

        if (req.body['ssh.clearPrivateKey'] === '1') {
            updates['ssh.privateKey'] = '';
        } else if (req.body['ssh.privateKey'] && req.body['ssh.privateKey'].trim()) {
            const rawKey = req.body['ssh.privateKey'].trim();
            if (!sshKeyService.isValidPrivateKey(rawKey)) {
                return res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent('Invalid private key format')}`);
            }
            updates['ssh.privateKey'] = cryptoService.encrypt(rawKey);
        }

        await HyNode.findByIdAndUpdate(nodeId, { $set: updates });
        if (sameHostPort.adjusted) {
            logger.warn(`[Panel] Auto-adjusted same-host node port for ${name}: ${sameHostPort.requestedPort} -> ${sameHostPort.port}`);
        }
        // Invalidate active-nodes and all subscription caches so ranking/config changes apply immediately
        await Promise.all([
            cache.invalidateNodes(),
            cache.invalidateAllSubscriptions(),
        ]);
        res.redirect('/panel/nodes');
    } catch (error) {
        logger.error(`[Panel] Update node error: ${error.message}`);
        res.redirect(`/panel/nodes/${nodeId}?error=${encodeURIComponent(error.message)}`);
    }
});

// POST /panel/nodes/:id/setup - Auto-setup node via SSH
router.post('/nodes/:id/setup', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена', logs: [] });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены', logs: [] });
        }

        try {
            const activeOnboarding = await nodeOnboardingService.getActiveJobByNode(req.params.id);
            if (activeOnboarding && activeOnboarding.status === 'running') {
                return res.status(202).json({
                    success: true,
                    running: true,
                    state: 'running',
                    message: 'Onboarding уже выполняется',
                    logs: Array.isArray(activeOnboarding.stepLogs)
                        ? activeOnboarding.stepLogs.map(formatOnboardingStepLog)
                        : [],
                    startedAt: activeOnboarding.startedAt || null,
                    onboardingJobId: activeOnboarding.id,
                    setupMode: SETUP_MODE_ONBOARDING_FULL,
                });
            }
        } catch (onboardingReadError) {
            logger.warn(`[Panel] setup start onboarding read warning: ${onboardingReadError.message}`);
        }

        const selectedMode = resolvePanelSetupMode(node, req);
        if (selectedMode === SETUP_MODE_LEGACY) {
            const legacyJob = getLegacySetupJob(req.params.id);
            if (legacyJob?.state === 'running') {
                return res.status(202).json({
                    success: true,
                    running: true,
                    state: 'running',
                    message: 'Setup уже выполняется',
                    logs: legacyJob.logs || [],
                    startedAt: legacyJob.startedAt,
                    onboardingJobId: legacyJob.onboardingJobId || '',
                    setupMode: SETUP_MODE_LEGACY,
                });
            }
        }

        let onboardingJobId = '';
        try {
            onboardingJobId = await ensureOnboardingJobForSetup(node, `panel:${node.name}`, selectedMode);
        } catch (onboardingError) {
            logger.warn(`[Panel] Failed to init durable onboarding job for ${node.name}: ${onboardingError.message}`);
        }

        const setupMode = (selectedMode === SETUP_MODE_ONBOARDING_FULL && onboardingJobId)
            ? SETUP_MODE_ONBOARDING_FULL
            : SETUP_MODE_LEGACY;

        const startedAt = Date.now();
        if (setupMode === SETUP_MODE_ONBOARDING_FULL) {
            schedulePanelOnboardingRunner(req.params.id, onboardingJobId);
        } else {
            setSetupJob(req.params.id, {
                state: 'running',
                startedAt,
                finishedAt: null,
                logs: [`[${new Date(startedAt).toISOString()}] Setup queued...`],
                error: '',
                message: '',
                onboardingJobId,
                setupMode,
            });
            setImmediate(() => {
                runNodeSetupJob(req.params.id, onboardingJobId).catch((err) => {
                    logger.error(`[Panel] setup background runner fatal: ${err.message}`);
                });
            });
        }

        res.status(202).json({
            success: true,
            running: true,
            state: 'running',
            message: 'Setup запущен в фоне',
            logs: setupMode === SETUP_MODE_LEGACY
                ? (getLegacySetupJob(req.params.id)?.logs || [])
                : [`[${new Date(startedAt).toISOString()}] Setup queued...`],
            startedAt,
            onboardingJobId,
            setupMode,
        });
    } catch (error) {
        logger.error(`[Panel] Setup error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message, logs: [`Exception: ${error.message}`] });
    }
});

// POST /panel/nodes/:id/onboarding/resume - Resume durable onboarding from current/selected step
router.post('/nodes/:id/onboarding/resume', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('_id name ip type ssh');
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена', logs: [] });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены', logs: [] });
        }

        const activeOnboardingRunning = await nodeOnboardingService.getActiveJobByNode(req.params.id);
        if (activeOnboardingRunning?.status === 'running') {
            return res.status(202).json({
                success: true,
                running: true,
                state: 'running',
                message: 'Onboarding уже выполняется',
                logs: getOnboardingLogs(activeOnboardingRunning),
                startedAt: activeOnboardingRunning.startedAt || null,
                onboardingJobId: activeOnboardingRunning.id,
                setupMode: SETUP_MODE_ONBOARDING_FULL,
            });
        }

        const requestedJobId = String(req.body?.jobId || '').trim();
        let targetJob = null;
        if (requestedJobId) {
            const scopedJob = await nodeOnboardingService.getJob(requestedJobId);
            if (!scopedJob || String(scopedJob.nodeId) !== String(req.params.id)) {
                return res.status(404).json({
                    success: false,
                    error: 'Onboarding job не найден для этой ноды.',
                    logs: [],
                });
            }
            targetJob = scopedJob;
        }

        if (!targetJob) {
            targetJob = activeOnboardingRunning || await nodeOnboardingService.getActiveJobByNode(req.params.id);
        }
        if (!targetJob) {
            const recentJobs = await nodeOnboardingService.listJobsByNode(req.params.id, { limit: 10 });
            targetJob = recentJobs.find((job) => (
                canResumeOnboardingStatus(job.status)
                && !isLegacyBridgeOnboardingJob(job)
            )) || null;
        }

        if (!targetJob) {
            return res.status(400).json({
                success: false,
                error: 'Нет подходящего onboarding job для Resume. Используйте Repair.',
                logs: [],
            });
        }

        if (isLegacyBridgeOnboardingJob(targetJob)) {
            return res.status(400).json({
                success: false,
                error: 'Legacy bridge job не поддерживает Resume onboarding-full. Используйте Repair.',
                logs: [],
            });
        }

        if (targetJob.status === 'running') {
            return res.status(202).json({
                success: true,
                running: true,
                state: 'running',
                message: 'Onboarding уже выполняется',
                logs: getOnboardingLogs(targetJob),
                startedAt: targetJob.startedAt || null,
                onboardingJobId: targetJob.id,
                setupMode: SETUP_MODE_ONBOARDING_FULL,
            });
        }

        const resumeStep = String(req.body?.step || '').trim();
        const resumed = targetJob.status === 'queued'
            ? await nodeOnboardingService.startJob(targetJob.id, { actorLabel: `panel:${node.name}` })
            : await nodeOnboardingService.resumeJob(targetJob.id, {
                step: resumeStep || undefined,
            });

        const started = startPanelOnboardingRun(node, resumed, {
            message: 'Onboarding Resume запущен в фоне',
            logs: getOnboardingLogs(resumed),
        });

        return res.status(202).json({
            success: true,
            running: true,
            state: 'running',
            message: 'Onboarding Resume запущен',
            logs: started.logs,
            startedAt: started.startedAt,
            onboardingJobId: started.onboardingJobId,
            setupMode: started.setupMode,
        });
    } catch (error) {
        logger.error(`[Panel] onboarding resume error: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message, logs: [] });
    }
});

// POST /panel/nodes/:id/onboarding/repair - Start repair onboarding run
router.post('/nodes/:id/onboarding/repair', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('_id name ip type ssh cascadeRole');
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена', logs: [] });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены', logs: [] });
        }

        const activeOnboarding = await nodeOnboardingService.getActiveJobByNode(req.params.id);
        if (activeOnboarding?.status === 'running') {
            return res.status(202).json({
                success: true,
                running: true,
                state: 'running',
                message: 'Onboarding уже выполняется',
                logs: getOnboardingLogs(activeOnboarding),
                startedAt: activeOnboarding.startedAt || null,
                onboardingJobId: activeOnboarding.id,
                setupMode: SETUP_MODE_ONBOARDING_FULL,
            });
        }

        let repairJob = null;
        if (activeOnboarding && canResumeOnboardingStatus(activeOnboarding.status) && !isLegacyBridgeOnboardingJob(activeOnboarding)) {
            repairJob = activeOnboarding.status === 'queued'
                ? await nodeOnboardingService.startJob(activeOnboarding.id, { actorLabel: `panel:${node.name}` })
                : await nodeOnboardingService.resumeJob(activeOnboarding.id);
        } else {
            const created = await nodeOnboardingService.createJob({
                nodeId: node._id,
                type: 'repair',
                trigger: {
                    source: 'panel',
                    actorLabel: `panel:${node.name}`,
                },
                metadata: {
                    flow: 'durable-onboarding-run-full',
                    setupMode: SETUP_MODE_ONBOARDING_FULL,
                    reason: 'manual-repair',
                    nodeType: node.type || 'hysteria',
                    cascadeRole: node.cascadeRole || 'standalone',
                },
            });

            repairJob = created.job;
            if (repairJob.status === 'queued') {
                repairJob = await nodeOnboardingService.startJob(repairJob.id, { actorLabel: `panel:${node.name}` });
            } else if (canResumeOnboardingStatus(repairJob.status)) {
                repairJob = await nodeOnboardingService.resumeJob(repairJob.id);
            }
        }

        const started = startPanelOnboardingRun(node, repairJob, {
            message: 'Onboarding Repair запущен в фоне',
            logs: getOnboardingLogs(repairJob),
        });

        return res.status(202).json({
            success: true,
            running: true,
            state: 'running',
            message: 'Onboarding Repair запущен',
            logs: started.logs,
            startedAt: started.startedAt,
            onboardingJobId: started.onboardingJobId,
            setupMode: started.setupMode,
        });
    } catch (error) {
        logger.error(`[Panel] onboarding repair error: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message, logs: [] });
    }
});

// POST /panel/nodes/:id/onboarding/rerun-step - Run a specific onboarding step safely
router.post('/nodes/:id/onboarding/rerun-step', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('_id name ip type ssh cascadeRole');
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена', logs: [] });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены', logs: [] });
        }

        const step = String(req.body?.step || '').trim();
        if (!ONBOARDING_RERUN_ALLOWED_STEPS.includes(step)) {
            return res.status(400).json({
                success: false,
                error: 'Некорректный шаг onboarding для rerun.',
                logs: [],
            });
        }

        const activeOnboarding = await nodeOnboardingService.getActiveJobByNode(req.params.id);
        if (activeOnboarding?.status === 'running') {
            return res.status(202).json({
                success: true,
                running: true,
                state: 'running',
                message: 'Onboarding уже выполняется',
                logs: getOnboardingLogs(activeOnboarding),
                startedAt: activeOnboarding.startedAt || null,
                onboardingJobId: activeOnboarding.id,
                setupMode: SETUP_MODE_ONBOARDING_FULL,
            });
        }

        const requestedJobId = String(req.body?.jobId || '').trim();
        let targetJob = null;
        if (requestedJobId) {
            const scopedJob = await nodeOnboardingService.getJob(requestedJobId);
            if (!scopedJob || String(scopedJob.nodeId) !== String(req.params.id)) {
                return res.status(404).json({
                    success: false,
                    error: 'Onboarding job не найден для этой ноды.',
                    logs: [],
                });
            }
            targetJob = scopedJob;
        }

        if (!targetJob) {
            targetJob = activeOnboarding;
        }
        if (!targetJob) {
            const recentJobs = await nodeOnboardingService.listJobsByNode(req.params.id, { limit: 10 });
            targetJob = recentJobs.find((job) => (
                canRerunOnboardingStatus(job.status)
                && !isLegacyBridgeOnboardingJob(job)
            )) || null;
        }

        if (!targetJob) {
            return res.status(400).json({
                success: false,
                error: 'Нет подходящего onboarding job для rerun шага. Используйте Repair.',
                logs: [],
            });
        }

        if (isLegacyBridgeOnboardingJob(targetJob)) {
            return res.status(400).json({
                success: false,
                error: 'Legacy bridge job не поддерживает step rerun в onboarding-full. Используйте Repair.',
                logs: [],
            });
        }

        let rerunJob = null;
        if (canResumeOnboardingStatus(targetJob.status) || targetJob.status === 'queued') {
            rerunJob = await nodeOnboardingService.resumeJob(targetJob.id, { step });
        } else {
            const created = await nodeOnboardingService.createJob({
                nodeId: node._id,
                type: 'repair',
                trigger: {
                    source: 'panel',
                    actorLabel: `panel:${node.name}`,
                },
                metadata: {
                    flow: 'durable-onboarding-run-full',
                    setupMode: SETUP_MODE_ONBOARDING_FULL,
                    reason: 'manual-step-rerun',
                    requestedStep: step,
                    requestedFromJobId: targetJob.id,
                    nodeType: node.type || 'hysteria',
                    cascadeRole: node.cascadeRole || 'standalone',
                },
            });
            rerunJob = await nodeOnboardingService.resumeJob(created.job.id, { step });
        }

        const started = startPanelOnboardingRun(node, rerunJob, {
            message: `Onboarding rerun шага ${step} запущен в фоне`,
            logs: getOnboardingLogs(rerunJob),
        });

        return res.status(202).json({
            success: true,
            running: true,
            state: 'running',
            message: `Onboarding rerun шага ${step} запущен`,
            logs: started.logs,
            startedAt: started.startedAt,
            onboardingJobId: started.onboardingJobId,
            setupMode: started.setupMode,
        });
    } catch (error) {
        logger.error(`[Panel] onboarding step rerun error: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message, logs: [] });
    }
});

// GET /panel/nodes/:id/setup-status - Poll background setup status
router.get('/nodes/:id/setup-status', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('status lastError lastSync');
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        const preferredSetupMode = resolvePanelSetupMode(node, req);

        let onboardingJob = null;
        try {
            onboardingJob = await findSetupStatusOnboardingJob(req.params.id, preferredSetupMode);
        } catch (onboardingError) {
            logger.warn(`[Panel] setup-status onboarding read warning: ${onboardingError.message}`);
        }

        const onboardingStatus = onboardingJob
            ? {
                id: onboardingJob.id,
                status: onboardingJob.status,
                currentStep: onboardingJob.currentStep,
                startedAt: onboardingJob.startedAt || null,
                finishedAt: onboardingJob.finishedAt || null,
                lastError: onboardingJob.lastError?.message || '',
                logs: Array.isArray(onboardingJob.stepLogs)
                    ? onboardingJob.stepLogs.map(formatOnboardingStepLog)
                    : [],
            }
            : null;
        const onboardingMode = resolveOnboardingJobSetupMode(onboardingJob);
        const rawLegacyJob = (!onboardingStatus || onboardingMode !== SETUP_MODE_ONBOARDING_FULL)
            ? getLegacySetupJob(req.params.id)
            : null;
        const legacyJob = rawLegacyJob && (
            rawLegacyJob.state === 'running'
            || preferredSetupMode === SETUP_MODE_LEGACY
        ) ? rawLegacyJob : null;
        const shouldUseOnboardingStatus = Boolean(onboardingStatus)
            && (onboardingMode === SETUP_MODE_ONBOARDING_FULL || !legacyJob);

        if (shouldUseOnboardingStatus) {
            const mappedState = mapOnboardingStatusToSetupState(onboardingStatus.status);
            const onboardingLogs = Array.isArray(onboardingStatus.logs) ? onboardingStatus.logs : [];
            const mergedLogs = trimSetupLogs(onboardingLogs);
            return res.json({
                success: true,
                state: mappedState,
                running: mappedState === 'running',
                statusSource: 'onboarding',
                logs: mergedLogs,
                message: mappedState === 'success' ? 'Нода успешно настроена' : '',
                error: onboardingStatus.lastError || '',
                startedAt: onboardingStatus.startedAt || null,
                finishedAt: onboardingStatus.finishedAt || null,
                onboarding: {
                    ...onboardingStatus,
                    logs: mergedLogs,
                },
                setupMode: onboardingMode || SETUP_MODE_ONBOARDING_FULL,
                nodeStatus: node.status || 'unknown',
                lastError: node.lastError || '',
                lastSync: node.lastSync || null,
            });
        }

        if (legacyJob) {
            return res.json({
                success: true,
                state: legacyJob.state,
                running: legacyJob.state === 'running',
                statusSource: 'legacy',
                message: legacyJob.message || '',
                error: legacyJob.error || '',
                logs: Array.isArray(legacyJob.logs) ? legacyJob.logs : [],
                startedAt: legacyJob.startedAt || null,
                finishedAt: legacyJob.finishedAt || null,
                onboarding: null,
                setupMode: legacyJob.setupMode || SETUP_MODE_LEGACY,
                nodeStatus: node.status || 'unknown',
                lastError: node.lastError || '',
                lastSync: node.lastSync || null,
            });
        }

        return res.json({
            success: true,
            state: 'idle',
            running: false,
            statusSource: 'none',
            logs: [],
            onboarding: null,
            setupMode: preferredSetupMode,
            nodeStatus: node.status || 'unknown',
            lastError: node.lastError || '',
            lastSync: node.lastSync || null,
        });
    } catch (error) {
        logger.error(`[Panel] setup-status error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /panel/nodes/:id/generate-ssh-key - Generate and install ed25519 SSH key
router.post('/nodes/:id/generate-ssh-key', generateSshKeyLimiter, async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);

        if (!node) {
            return res.status(404).json({ success: false, error: 'Node not found' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH credentials not configured. Add a password or existing key first.' });
        }

        logger.info(`[Panel] Generating SSH key for node ${node.name}`);

        const conn = await connectNodeSSH(node);

        const { privateKey, publicKey } = sshKeyService.generateEd25519KeyPair();
        await sshKeyService.installPublicKey(conn, publicKey);
        conn.end();

        const encryptedKey = cryptoService.encrypt(privateKey);
        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: { 'ssh.privateKey': encryptedKey },
        });

        logger.info(`[Panel] SSH key installed on ${node.name}`);
        res.json({ success: true, message: 'SSH key generated and installed successfully' });
    } catch (error) {
        logger.error(`[Panel] SSH key generation error: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /panel/nodes/:id/download-ssh-key - Download stored SSH private key
router.get('/nodes/:id/download-ssh-key', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id).select('name ip ssh.privateKey');

        if (!node) {
            return res.status(404).type('text/plain; charset=utf-8').send('Node not found');
        }

        if (!node.ssh?.privateKey) {
            return res.status(404).type('text/plain; charset=utf-8').send('SSH private key not configured');
        }

        const privateKey = cryptoService.decryptPrivateKey(node.ssh.privateKey);
        const filename = buildSshKeyFilename(node);

        logger.info(`[Panel] SSH private key downloaded for node ${node.name}`);

        res.set({
            'Content-Type': 'application/x-pem-file; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        return res.send(privateKey);
    } catch (error) {
        logger.error(`[Panel] SSH key download error: ${error.message}`);
        return res.status(500).type('text/plain; charset=utf-8').send('Failed to download SSH private key');
    }
});

// GET /panel/nodes/:id/stats - Node system stats via SSH
router.get('/nodes/:id/stats', async (req, res) => {
    let ssh;
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }
        
        ssh = new NodeSSH(node);
        await ssh.connect();
        const stats = await ssh.getSystemStats();
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (ssh) ssh.disconnect();
    }
});

// GET /panel/nodes/:id/speed - Node network speed
router.get('/nodes/:id/speed', async (req, res) => {
    let ssh;
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }
        
        ssh = new NodeSSH(node);
        await ssh.connect();
        const speed = await ssh.getNetworkSpeed();
        
        res.json(speed);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (ssh) ssh.disconnect();
    }
});

// GET /panel/nodes/:id/get-config - Read current config from node
router.get('/nodes/:id/get-config', async (req, res) => {
    let conn;
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }
        
        conn = await nodeSetup.connectSSH(node);
        const configPath = node.type === 'xray'
            ? '/usr/local/etc/xray/config.json'
            : (node.paths?.config || '/etc/hysteria/config.yaml');
        const result = await nodeSetup.execSSH(conn, `cat ${shellQuote(configPath)}`);
        
        if (result.success) {
            res.json({ success: true, config: result.output });
        } else {
            res.json({ success: false, error: result.error || 'Не удалось прочитать конфиг' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (conn) conn.end();
    }
});

// GET /panel/nodes/:id/logs - Node logs
router.get('/nodes/:id/logs', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);

        if (!node) {
            return res.status(404).json({ success: false, error: 'Нода не найдена' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH данные не настроены' });
        }

        logger.debug(`[Panel] Getting logs for node ${node.name} (type: ${node.type})`);
        const result = node.type === 'xray'
            ? await nodeSetup.getXrayNodeLogs(node, 100)
            : await nodeSetup.getNodeLogs(node, 100);
        res.json(result);
    } catch (error) {
        logger.error(`[Panel] Get logs error for node ${req.params.id}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /panel/nodes/:id/smoke-check-hybrid - Run hybrid cascade smoke-check on Hysteria node
router.post('/nodes/:id/smoke-check-hybrid', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        if (!node) {
            return res.status(404).json({ success: false, error: 'Node not found' });
        }
        if (node.type === 'xray') {
            return res.status(400).json({ success: false, error: 'Smoke-check is supported only for Hysteria nodes' });
        }
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ success: false, error: 'SSH credentials not configured' });
        }

        const result = await runHybridSidecarSmokeCheck(node);
        logger.info(
            `[Panel] Hybrid smoke-check for ${node.name}: PASS=${result.summary.passed}, FAIL=${result.summary.failed}`
        );
        return res.json(result);
    } catch (error) {
        logger.error(`[Panel] Hybrid smoke-check error for node ${req.params.id}: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== OUTBOUNDS ====================

// GET /panel/nodes/:id/outbounds - Node outbound management
router.get('/nodes/:id/outbounds', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.redirect('/panel/nodes');
        }

        const aclInlineState = getHysteriaAclInlineState(node);
        
        render(res, 'node-outbounds', {
            title: `Outbounds: ${node.name}`,
            page: 'nodes',
            node,
            aclInlineState,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /panel/nodes/:id/outbounds - Save outbounds and ACL rules
router.post('/nodes/:id/outbounds', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.redirect('/panel/nodes');
        }

        const aclInlineState = getHysteriaAclInlineState(node);
        
        const outbounds = [];
        const rawBody = req.body;
        
        if (rawBody.outbound_name) {
            const names = Array.isArray(rawBody.outbound_name) ? rawBody.outbound_name : [rawBody.outbound_name];
            const types = Array.isArray(rawBody.outbound_type) ? rawBody.outbound_type : [rawBody.outbound_type];
            const addrs = Array.isArray(rawBody.outbound_addr) ? rawBody.outbound_addr : [rawBody.outbound_addr || ''];
            const usernames = Array.isArray(rawBody.outbound_username) ? rawBody.outbound_username : [rawBody.outbound_username || ''];
            const passwords = Array.isArray(rawBody.outbound_password) ? rawBody.outbound_password : [rawBody.outbound_password || ''];
            
            for (let i = 0; i < names.length; i++) {
                const name = (names[i] || '').trim();
                const type = (types[i] || '').trim();
                
                if (!name || !type) continue;
                if (name === RESERVED_CASCADE_OUTBOUND) continue;
                if (!['direct', 'block', 'socks5', 'http'].includes(type)) continue;
                
                outbounds.push({
                    name,
                    type,
                    addr: (addrs[i] || '').trim(),
                    username: (usernames[i] || '').trim(),
                    password: (passwords[i] || '').trim(),
                });
            }
        }
        
        let aclRules = Array.isArray(node.aclRules) ? node.aclRules : [];
        if (aclInlineState.editable) {
            const aclRaw = (rawBody.aclRules || '').trim();
            aclRules = aclRaw
                ? aclRaw.split('\n').map(r => r.trim()).filter(Boolean)
                : [];
        }
        aclRules = aclRules.filter(rule => !String(rule || '').startsWith(`${RESERVED_CASCADE_OUTBOUND}(`));
        
        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: { outbounds, aclRules },
        });
        
        logger.info(`[Panel] Outbounds updated for node: ${node.name} (${outbounds.length} outbounds, ${aclRules.length} ACL rules)`);
        
        res.redirect(`/panel/nodes/${req.params.id}/outbounds?message=` + encodeURIComponent('Outbounds сохранены'));
    } catch (error) {
        logger.error('[Panel] Outbounds save error:', error.message);
        res.redirect(`/panel/nodes/${req.params.id}/outbounds?error=` + encodeURIComponent(`${res.locals.t?.('common.error') || 'Error'}: ${error.message}`));
    }
});

// GET /panel/nodes/:id/terminal - SSH terminal
router.get('/nodes/:id/terminal', async (req, res) => {
    try {
        const node = await HyNode.findById(req.params.id);
        
        if (!node) {
            return res.redirect('/panel/nodes');
        }
        
        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).send('SSH данные не настроены для этой ноды');
        }
        
        res.render('terminal', { node });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /panel/network - Redirect to nodes page (network map is a tab there)
router.get('/network', (req, res) => {
    res.redirect('/panel/nodes');
});

// ==================== STATS ====================

// GET /panel/stats - Stats page
router.get('/stats', async (req, res) => {
    try {
        const summary = await statsService.getSummary();
        
        render(res, 'stats', {
            title: res.locals.locales.stats.title,
            page: 'stats',
            summary,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /panel/stats/api/summary - Summary stats
router.get('/stats/api/summary', async (req, res) => {
    try {
        const summary = await statsService.getSummary();
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/online - Online chart data
router.get('/stats/api/online', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getOnlineChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/traffic - Traffic chart data
router.get('/stats/api/traffic', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getTrafficChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats/api/users', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getUsersChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats/api/users-registrations', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getUserRegistrationsChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats/api/users-heatmap', async (req, res) => {
    try {
        const requestedHours = Number(req.query.hours || 48);
        const hours = requestedHours === 24 ? 24 : 48;
        const data = await statsService.getUsersHeatmap(hours);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/nodes - Nodes chart data
router.get('/stats/api/nodes', async (req, res) => {
    try {
        const period = req.query.period || '24h';
        const data = await statsService.getNodesChart(period);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /panel/stats/cleanup - Manual old data cleanup
router.post('/stats/cleanup', async (req, res) => {
    try {
        const result = await statsService.cleanup();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /panel/stats/api/ssh-pool - SSH pool stats
router.get('/stats/api/ssh-pool', async (req, res) => {
    try {
        const sshPool = require('../../services/sshPoolService');
        res.json(sshPool.getStats());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /nodes/:id/restart - Restart node service via SSH
router.post('/nodes/:id/restart', async (req, res) => {
    let conn;
    try {
        const node = await HyNode.findById(req.params.id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }

        if (!node.ssh?.password && !node.ssh?.privateKey) {
            return res.status(400).json({ error: 'SSH credentials not configured' });
        }

        conn = await nodeSetup.connectSSH(node);
        const restartCmd = node.type === 'xray'
            ? 'systemctl restart xray && sleep 2 && (systemctl is-active xray 2>/dev/null || true) | head -n 1'
            : '(systemctl restart hysteria-server 2>/dev/null || systemctl restart hysteria 2>/dev/null) && sleep 2 && H1=$(systemctl is-active hysteria-server 2>/dev/null || true) && H2=$(systemctl is-active hysteria 2>/dev/null || true) && if [ "$H1" = "active" ] || [ "$H2" = "active" ]; then echo active; elif [ -n "$H1" ] && [ "$H1" != "unknown" ]; then echo "$H1"; elif [ -n "$H2" ]; then echo "$H2"; else echo unknown; fi';
        const result = await nodeSetup.execSSH(conn, restartCmd);

        const serviceState = String(result.output || '').trim().split('\n')[0].trim();
        const isActive = result.success && serviceState === 'active';

        await HyNode.findByIdAndUpdate(req.params.id, {
            $set: { status: isActive ? 'online' : 'error', lastSync: new Date() }
        });

        res.json({ success: isActive, output: result.output });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (conn) conn.end();
    }
});

module.exports = router;
