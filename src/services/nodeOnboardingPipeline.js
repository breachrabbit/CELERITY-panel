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

    async runUntilAgentInstall(jobId, context = {}) {
        return nodeOnboardingRunner.run(jobId, {
            context,
            stepHandlers: {
                preflight: nodeOnboardingHandlers.runPreflight,
                'prepare-host': nodeOnboardingHandlers.runPrepareHost,
                'install-runtime': nodeOnboardingHandlers.runInstallRuntime,
                'verify-runtime-local': nodeOnboardingHandlers.runVerifyRuntimeLocal,
            },
            stopBeforeStep: 'install-agent',
            defaultRepairableOnError: true,
        });
    }
}

module.exports = new NodeOnboardingPipeline();
module.exports.NodeOnboardingPipeline = NodeOnboardingPipeline;
