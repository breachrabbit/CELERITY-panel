const mongoose = require('mongoose');
const {
    ONBOARDING_STEPS,
    JOB_STATUSES,
    STEP_STATUSES,
    ONBOARDING_TYPES,
    buildInitialStepStates,
} = require('../domain/node-onboarding/stateMachine');

const stepErrorSchema = new mongoose.Schema({
    code: { type: String, default: '' },
    message: { type: String, default: '' },
    details: { type: Object, default: {} },
    at: { type: Date, default: Date.now },
}, { _id: false });

const stepStateSchema = new mongoose.Schema({
    step: { type: String, enum: ONBOARDING_STEPS, required: true },
    status: { type: String, enum: STEP_STATUSES, default: 'pending' },
    attempt: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    details: { type: Object, default: {} },
    lastError: { type: stepErrorSchema, default: null },
}, { _id: false });

const stepLogSchema = new mongoose.Schema({
    step: { type: String, enum: ONBOARDING_STEPS, default: 'preflight' },
    level: { type: String, enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
    message: { type: String, required: true },
    meta: { type: Object, default: {} },
    at: { type: Date, default: Date.now },
}, { _id: false });

const nodeOnboardingJobSchema = new mongoose.Schema({
    nodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HyNode',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ONBOARDING_TYPES,
        default: 'fresh-install',
    },
    status: {
        type: String,
        enum: JOB_STATUSES,
        default: 'queued',
    },
    currentStep: {
        type: String,
        enum: ONBOARDING_STEPS,
        default: ONBOARDING_STEPS[0],
    },
    attempt: {
        type: Number,
        min: 1,
        default: 1,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    trigger: {
        source: { type: String, enum: ['panel', 'api', 'system'], default: 'panel' },
        actorId: { type: String, default: '' },
        actorLabel: { type: String, default: '' },
    },
    lastError: { type: stepErrorSchema, default: null },
    stepStates: {
        type: [stepStateSchema],
        default: buildInitialStepStates,
    },
    stepLogs: {
        type: [stepLogSchema],
        default: [],
    },
    resultSnapshot: {
        type: Object,
        default: {},
    },
    metadata: {
        type: Object,
        default: {},
    },
}, {
    timestamps: true,
    versionKey: false,
});

nodeOnboardingJobSchema.index(
    { nodeId: 1, isActive: 1 },
    {
        unique: true,
        partialFilterExpression: { isActive: true },
        name: 'uniq_active_onboarding_job_per_node',
    }
);

nodeOnboardingJobSchema.index({ status: 1, updatedAt: -1 });
nodeOnboardingJobSchema.index({ nodeId: 1, createdAt: -1 });

module.exports = mongoose.model('NodeOnboardingJob', nodeOnboardingJobSchema);
