const nodeOnboardingRunner = require('./nodeOnboardingRunner');
const nodeOnboardingHandlers = require('./nodeOnboardingHandlers');

class NodeOnboardingPipeline {
    async runUntilInstallRuntime(jobId, context = {}) {
        return nodeOnboardingRunner.run(jobId, {
            context,
            stepHandlers: {
                preflight: nodeOnboardingHandlers.runPreflight,
                'prepare-host': nodeOnboardingHandlers.runPrepareHost,
            },
            stopBeforeStep: 'install-runtime',
            defaultRepairableOnError: true,
        });
    }
}

module.exports = new NodeOnboardingPipeline();
module.exports.NodeOnboardingPipeline = NodeOnboardingPipeline;
