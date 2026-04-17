const logger = require('../utils/logger');
const nodeOnboardingService = require('./nodeOnboardingService');
const { ONBOARDING_STEPS } = require('../domain/node-onboarding/stateMachine');

class NodeOnboardingRunner {
    async run(jobId, {
        stepHandlers = {},
        context = {},
        stopBeforeStep = '',
        defaultRepairableOnError = true,
    } = {}) {
        let job = await nodeOnboardingService.startJob(jobId);

        while (job.status === 'running') {
            const step = job.currentStep || ONBOARDING_STEPS[0];
            if (stopBeforeStep && step === stopBeforeStep) {
                await nodeOnboardingService.appendStepLog(job.id, {
                    step,
                    level: 'info',
                    message: `Runner stopped before step ${step}`,
                });
                break;
            }

            if (step === 'ready') {
                job = await nodeOnboardingService.completeJob(job.id, {
                    completedBy: 'node-onboarding-runner',
                    completedAt: new Date().toISOString(),
                });
                break;
            }

            const handler = typeof stepHandlers[step] === 'function'
                ? stepHandlers[step]
                : this._defaultStepHandler.bind(this);

            try {
                job = await nodeOnboardingService.markStepRunning(job.id, step);
                const handlerResult = await handler({ job, step, context });
                job = await nodeOnboardingService.markStepCompleted(job.id, step, {
                    result: handlerResult && typeof handlerResult === 'object' ? handlerResult : {},
                });
                job = await nodeOnboardingService.touchHeartbeat(job.id);
            } catch (error) {
                logger.error(`[OnboardingRunner] ${step} failed for job ${job.id}: ${error.message}`);
                job = await nodeOnboardingService.markStepFailed(
                    job.id,
                    step,
                    error,
                    { repairable: defaultRepairableOnError }
                );
                break;
            }
        }

        return job;
    }

    async _defaultStepHandler({ step }) {
        return {
            noop: true,
            message: `No handler registered for ${step}`,
        };
    }
}

const nodeOnboardingRunner = new NodeOnboardingRunner();

module.exports = nodeOnboardingRunner;
module.exports.NodeOnboardingRunner = NodeOnboardingRunner;
