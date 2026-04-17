const ONBOARDING_STEPS = Object.freeze([
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
    'ready',
]);

const JOB_STATUSES = Object.freeze([
    'queued',
    'running',
    'blocked',
    'failed',
    'repairable',
    'completed',
]);

const STEP_STATUSES = Object.freeze([
    'pending',
    'running',
    'completed',
    'failed',
    'blocked',
    'skipped',
]);

const ONBOARDING_TYPES = Object.freeze([
    'fresh-install',
    'resume',
    'repair',
]);

const ACTIVE_JOB_STATUS_SET = new Set(['queued', 'running', 'blocked', 'repairable']);
const TERMINAL_JOB_STATUS_SET = new Set(['failed', 'completed']);

const JOB_STATUS_TRANSITIONS = Object.freeze({
    queued: ['running', 'failed'],
    running: ['blocked', 'failed', 'repairable', 'completed'],
    blocked: ['running', 'failed', 'repairable'],
    repairable: ['running', 'failed', 'completed'],
    failed: [],
    completed: [],
});

function buildInitialStepStates() {
    return ONBOARDING_STEPS.map((step) => ({
        step,
        status: 'pending',
        attempt: 0,
        startedAt: null,
        finishedAt: null,
        details: {},
        lastError: null,
    }));
}

function isKnownStep(step) {
    return ONBOARDING_STEPS.includes(step);
}

function getStepIndex(step) {
    return ONBOARDING_STEPS.indexOf(step);
}

function getNextStep(step) {
    const index = getStepIndex(step);
    if (index === -1) return null;
    return ONBOARDING_STEPS[index + 1] || null;
}

function canTransitionStatus(fromStatus, toStatus) {
    const allowed = JOB_STATUS_TRANSITIONS[fromStatus] || [];
    return allowed.includes(toStatus);
}

function isActiveJobStatus(status) {
    return ACTIVE_JOB_STATUS_SET.has(status);
}

function isTerminalJobStatus(status) {
    return TERMINAL_JOB_STATUS_SET.has(status);
}

function coerceOnboardingType(type) {
    if (ONBOARDING_TYPES.includes(type)) return type;
    return 'fresh-install';
}

module.exports = {
    ONBOARDING_STEPS,
    JOB_STATUSES,
    STEP_STATUSES,
    ONBOARDING_TYPES,
    buildInitialStepStates,
    isKnownStep,
    getStepIndex,
    getNextStep,
    canTransitionStatus,
    isActiveJobStatus,
    isTerminalJobStatus,
    coerceOnboardingType,
};
