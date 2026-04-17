const mongoose = require('mongoose');
const HyNode = require('../models/hyNodeModel');
const NodeOnboardingJob = require('../models/nodeOnboardingJobModel');
const logger = require('../utils/logger');
const {
    ONBOARDING_STEPS,
    coerceOnboardingType,
    isKnownStep,
    getNextStep,
    canTransitionStatus,
    isTerminalJobStatus,
    buildInitialStepStates,
} = require('../domain/node-onboarding/stateMachine');

const DEFAULT_LOG_LIMIT = 600;

class NodeOnboardingService {
    _assertObjectId(value, fieldName) {
        const id = String(value || '').trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error(`${fieldName} is invalid`);
        }
        return id;
    }

    _normalizeError(errorLike) {
        if (!errorLike) {
            return {
                code: '',
                message: 'Unknown onboarding error',
                details: {},
                at: new Date(),
            };
        }

        if (typeof errorLike === 'string') {
            return {
                code: '',
                message: errorLike,
                details: {},
                at: new Date(),
            };
        }

        return {
            code: String(errorLike.code || ''),
            message: String(errorLike.message || 'Unknown onboarding error'),
            details: errorLike.details && typeof errorLike.details === 'object' ? errorLike.details : {},
            at: new Date(),
        };
    }

    _appendLog(job, {
        step = job.currentStep || ONBOARDING_STEPS[0],
        level = 'info',
        message,
        meta = {},
    }) {
        if (!message) return;
        const nextLogs = Array.isArray(job.stepLogs) ? job.stepLogs : [];
        nextLogs.push({
            step,
            level,
            message,
            meta,
            at: new Date(),
        });
        if (nextLogs.length > DEFAULT_LOG_LIMIT) {
            nextLogs.splice(0, nextLogs.length - DEFAULT_LOG_LIMIT);
        }
        job.stepLogs = nextLogs;
    }

    _getStepState(job, step) {
        if (!Array.isArray(job.stepStates)) {
            job.stepStates = buildInitialStepStates();
        }

        let state = job.stepStates.find((item) => item.step === step);
        if (!state) {
            state = {
                step,
                status: 'pending',
                attempt: 0,
                startedAt: null,
                finishedAt: null,
                details: {},
                lastError: null,
            };
            job.stepStates.push(state);
        }
        return state;
    }

    _firstUnresolvedStep(job) {
        const stepStates = Array.isArray(job.stepStates) ? job.stepStates : [];
        const unresolved = stepStates.find((state) => !['completed', 'skipped'].includes(state.status));
        return unresolved?.step || ONBOARDING_STEPS[0];
    }

    _setJobStatus(job, nextStatus) {
        if (job.status === nextStatus) return;
        if (!canTransitionStatus(job.status, nextStatus)) {
            throw new Error(`Invalid onboarding status transition: ${job.status} -> ${nextStatus}`);
        }
        job.status = nextStatus;
        job.isActive = !isTerminalJobStatus(nextStatus);
        if (isTerminalJobStatus(nextStatus)) {
            job.finishedAt = job.finishedAt || new Date();
        } else {
            job.finishedAt = null;
        }
    }

    async _loadJob(jobId) {
        const validJobId = this._assertObjectId(jobId, 'jobId');
        const job = await NodeOnboardingJob.findById(validJobId);
        if (!job) {
            throw new Error('Node onboarding job not found');
        }
        return job;
    }

    _asPublicJob(jobDoc) {
        if (!jobDoc) return null;
        const job = jobDoc.toObject ? jobDoc.toObject() : { ...jobDoc };
        return {
            id: String(job._id),
            nodeId: String(job.nodeId),
            type: job.type,
            status: job.status,
            currentStep: job.currentStep,
            attempt: job.attempt,
            isActive: !!job.isActive,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            lastHeartbeatAt: job.lastHeartbeatAt,
            trigger: job.trigger || {},
            lastError: job.lastError || null,
            stepStates: Array.isArray(job.stepStates) ? job.stepStates : [],
            stepLogs: Array.isArray(job.stepLogs) ? job.stepLogs : [],
            resultSnapshot: job.resultSnapshot || {},
            metadata: job.metadata || {},
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        };
    }

    async createJob({
        nodeId,
        type = 'fresh-install',
        trigger = {},
        metadata = {},
    }) {
        const validNodeId = this._assertObjectId(nodeId, 'nodeId');

        const nodeExists = await HyNode.exists({ _id: validNodeId });
        if (!nodeExists) {
            throw new Error('Node not found for onboarding job');
        }

        const activeJob = await NodeOnboardingJob.findOne({ nodeId: validNodeId, isActive: true });
        if (activeJob) {
            return { created: false, job: this._asPublicJob(activeJob) };
        }

        const onboardingType = coerceOnboardingType(type);
        const now = new Date();
        const jobPayload = {
            nodeId: validNodeId,
            type: onboardingType,
            status: 'queued',
            currentStep: ONBOARDING_STEPS[0],
            attempt: 1,
            isActive: true,
            startedAt: null,
            finishedAt: null,
            lastHeartbeatAt: now,
            trigger: {
                source: ['panel', 'api', 'system'].includes(trigger.source) ? trigger.source : 'panel',
                actorId: String(trigger.actorId || ''),
                actorLabel: String(trigger.actorLabel || ''),
            },
            metadata: metadata && typeof metadata === 'object' ? metadata : {},
            stepStates: buildInitialStepStates(),
            stepLogs: [],
            resultSnapshot: {},
        };

        let createdJob;
        try {
            createdJob = await NodeOnboardingJob.create(jobPayload);
        } catch (error) {
            if (error?.code === 11000) {
                const existing = await NodeOnboardingJob.findOne({ nodeId: validNodeId, isActive: true });
                if (existing) {
                    return { created: false, job: this._asPublicJob(existing) };
                }
            }
            throw error;
        }

        this._appendLog(createdJob, {
            step: ONBOARDING_STEPS[0],
            level: 'info',
            message: `Onboarding job queued (${onboardingType})`,
        });
        await createdJob.save();

        logger.info(`[Onboarding] Job created for node ${validNodeId} (${onboardingType})`);
        return { created: true, job: this._asPublicJob(createdJob) };
    }

    async getJob(jobId) {
        const job = await this._loadJob(jobId);
        return this._asPublicJob(job);
    }

    async getActiveJobByNode(nodeId) {
        const validNodeId = this._assertObjectId(nodeId, 'nodeId');
        const job = await NodeOnboardingJob.findOne({ nodeId: validNodeId, isActive: true }).sort({ createdAt: -1 });
        return this._asPublicJob(job);
    }

    async listJobsByNode(nodeId, { limit = 20 } = {}) {
        const validNodeId = this._assertObjectId(nodeId, 'nodeId');
        const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const jobs = await NodeOnboardingJob
            .find({ nodeId: validNodeId })
            .sort({ createdAt: -1 })
            .limit(normalizedLimit);
        return jobs.map((job) => this._asPublicJob(job));
    }

    async startJob(jobId, { actorLabel = '' } = {}) {
        const job = await this._loadJob(jobId);
        if (job.status === 'running') {
            return this._asPublicJob(job);
        }

        this._setJobStatus(job, 'running');
        job.startedAt = job.startedAt || new Date();
        job.lastHeartbeatAt = new Date();
        job.currentStep = this._firstUnresolvedStep(job);
        if (actorLabel) {
            job.trigger.actorLabel = actorLabel;
        }

        const stepState = this._getStepState(job, job.currentStep);
        if (stepState.status === 'pending') {
            stepState.status = 'running';
            stepState.startedAt = stepState.startedAt || new Date();
            stepState.attempt = Math.max(Number(stepState.attempt) || 0, 0) + 1;
        }

        this._appendLog(job, {
            message: `Onboarding started at step ${job.currentStep}`,
            step: job.currentStep,
        });
        await job.save();
        return this._asPublicJob(job);
    }

    async markStepRunning(jobId, step, details = {}) {
        if (!isKnownStep(step)) {
            throw new Error(`Unknown onboarding step: ${step}`);
        }

        const job = await this._loadJob(jobId);
        if (job.status !== 'running') {
            if (['queued', 'blocked', 'repairable'].includes(job.status)) {
                this._setJobStatus(job, 'running');
            } else {
                throw new Error(`Cannot mark step running while job is ${job.status}`);
            }
        }

        const state = this._getStepState(job, step);
        state.status = 'running';
        state.startedAt = state.startedAt || new Date();
        state.finishedAt = null;
        state.attempt = Math.max(Number(state.attempt) || 0, 0) + 1;
        state.details = { ...(state.details || {}), ...(details || {}) };
        state.lastError = null;

        job.currentStep = step;
        job.lastHeartbeatAt = new Date();
        this._appendLog(job, { step, message: `Step started: ${step}` });

        await job.save();
        return this._asPublicJob(job);
    }

    async markStepCompleted(jobId, step, details = {}) {
        if (!isKnownStep(step)) {
            throw new Error(`Unknown onboarding step: ${step}`);
        }

        const job = await this._loadJob(jobId);
        if (job.status !== 'running') {
            throw new Error(`Cannot complete step while job is ${job.status}`);
        }

        const state = this._getStepState(job, step);
        state.status = 'completed';
        state.finishedAt = new Date();
        state.details = { ...(state.details || {}), ...(details || {}) };
        state.lastError = null;

        const nextStep = getNextStep(step);
        if (nextStep) {
            job.currentStep = nextStep;
        }
        job.lastHeartbeatAt = new Date();
        this._appendLog(job, { step, message: `Step completed: ${step}` });

        await job.save();
        return this._asPublicJob(job);
    }

    async markStepFailed(jobId, step, errorLike, { repairable = false, blocked = false } = {}) {
        if (!isKnownStep(step)) {
            throw new Error(`Unknown onboarding step: ${step}`);
        }

        const job = await this._loadJob(jobId);
        const error = this._normalizeError(errorLike);
        const state = this._getStepState(job, step);
        state.status = blocked ? 'blocked' : 'failed';
        state.finishedAt = new Date();
        state.lastError = error;
        job.lastError = error;
        job.currentStep = step;
        job.lastHeartbeatAt = new Date();

        if (blocked) {
            this._setJobStatus(job, 'blocked');
        } else if (repairable) {
            this._setJobStatus(job, 'repairable');
        } else {
            this._setJobStatus(job, 'failed');
        }

        this._appendLog(job, {
            step,
            level: 'error',
            message: `Step failed: ${step} — ${error.message}`,
            meta: { code: error.code || '', repairable: !!repairable, blocked: !!blocked },
        });

        await job.save();
        return this._asPublicJob(job);
    }

    async completeJob(jobId, resultSnapshot = {}) {
        const job = await this._loadJob(jobId);
        if (job.status !== 'running' && job.status !== 'repairable') {
            throw new Error(`Cannot complete job while status is ${job.status}`);
        }

        const lastStep = ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1];
        const readyState = this._getStepState(job, lastStep);
        if (readyState.status !== 'completed') {
            readyState.status = 'completed';
            readyState.startedAt = readyState.startedAt || new Date();
            readyState.finishedAt = new Date();
        }

        this._setJobStatus(job, 'completed');
        job.currentStep = lastStep;
        job.resultSnapshot = resultSnapshot && typeof resultSnapshot === 'object' ? resultSnapshot : {};
        job.lastHeartbeatAt = new Date();
        this._appendLog(job, { step: lastStep, message: 'Onboarding completed' });

        await job.save();
        return this._asPublicJob(job);
    }

    async failJob(jobId, errorLike) {
        const job = await this._loadJob(jobId);
        const error = this._normalizeError(errorLike);
        const step = job.currentStep || this._firstUnresolvedStep(job);
        const state = this._getStepState(job, step);
        state.status = 'failed';
        state.finishedAt = new Date();
        state.lastError = error;

        job.lastError = error;
        this._setJobStatus(job, 'failed');
        job.lastHeartbeatAt = new Date();
        this._appendLog(job, {
            step,
            level: 'error',
            message: `Job failed: ${error.message}`,
            meta: { code: error.code || '' },
        });

        await job.save();
        return this._asPublicJob(job);
    }

    async resumeJob(jobId, { step } = {}) {
        const job = await this._loadJob(jobId);
        if (!['blocked', 'repairable', 'queued', 'running'].includes(job.status)) {
            throw new Error(`Cannot resume job while status is ${job.status}`);
        }

        const resumeStep = step && isKnownStep(step) ? step : this._firstUnresolvedStep(job);
        const state = this._getStepState(job, resumeStep);
        state.status = 'pending';
        state.finishedAt = null;
        state.lastError = null;

        this._setJobStatus(job, 'running');
        job.currentStep = resumeStep;
        job.attempt = Math.max(Number(job.attempt) || 1, 1) + 1;
        job.finishedAt = null;
        job.lastError = null;
        job.lastHeartbeatAt = new Date();
        this._appendLog(job, {
            step: resumeStep,
            level: 'warn',
            message: `Job resumed from step ${resumeStep}`,
        });

        await job.save();
        return this._asPublicJob(job);
    }

    async touchHeartbeat(jobId, heartbeatMeta = {}) {
        const job = await this._loadJob(jobId);
        job.lastHeartbeatAt = new Date();
        if (heartbeatMeta && typeof heartbeatMeta === 'object' && Object.keys(heartbeatMeta).length) {
            job.metadata = { ...(job.metadata || {}), ...heartbeatMeta };
        }
        await job.save();
        return this._asPublicJob(job);
    }

    async appendStepLog(jobId, {
        step,
        level = 'info',
        message,
        meta = {},
    }) {
        const job = await this._loadJob(jobId);
        const safeStep = isKnownStep(step) ? step : (job.currentStep || ONBOARDING_STEPS[0]);
        this._appendLog(job, { step: safeStep, level, message, meta });
        job.lastHeartbeatAt = new Date();
        await job.save();
        return this._asPublicJob(job);
    }
}

const nodeOnboardingService = new NodeOnboardingService();

module.exports = nodeOnboardingService;
module.exports.NodeOnboardingService = NodeOnboardingService;
module.exports.ONBOARDING_STEPS = ONBOARDING_STEPS;
