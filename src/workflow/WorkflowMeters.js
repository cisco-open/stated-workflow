import {metrics} from '@opentelemetry/api';
import {MeterProvider} from '@opentelemetry/sdk-metrics-base';

export class WorkflowMetrics {
    constructor() {
        this.meterProvider = new MeterProvider({});
        metrics.setGlobalMeterProvider(this.meterProvider);
        this.meter = metrics.getMeter('workflowMetrics');


        this.workflowInvocationsCounter = this.meter.createCounter('workflow_invocations', {
            description: 'Counts the number of times workflows are invoked',
        });
        this.workflowInvocationSuccessesCounter = this.meter.createCounter('workflow_invocation_successes', {
            description: 'Counts the number of times workflow invocations succeed',
        });
        this.workflowInvocationFailuresCounter = this.meter.createCounter('workflow_invocation_failures', {
            description: 'Counts the number of times workflow invocations fail',
        });
        this.workflowInvocationLatency = this.meter.createHistogram('workflow_invocation_latency', {
            description: 'Tracks the latency of workflow invocations',
            unit: 'ms',
        });
    }

    monitorCallback(workflowId) {
        return (data, jsonPointers, removed) => {
            console.log(`Monitor: workflowId: ${workflowId}, Data changed at ${jsonPointers} to ${data}`);
            const failurePattern = /\/([^/]+)\/log\/([^/]+)\/fail$/;
            const successPattern = /\/([^/]+)\/log\/([^/]+)$/;

            const firstJsonPointer = jsonPointers?.[0];
            if (failurePattern.test(firstJsonPointer)) {
                const matches = firstJsonPointer.match(failurePattern);
                const workflowStepName = matches[1];
                const invocationId = matches[2];
                this.workflowInvocationFailuresCounter.add(1, { workflowId: workflowId, workflowStepName: workflowStepName, invocationId: invocationId });
                console.log(`Monitor: Recorded a failure for workflowId: ${workflowId}, workflowStepName: ${workflowStepName}, invocationId: ${invocationId}`);
            } else if (successPattern.test(firstJsonPointer) && removed) {
                const matches = firstJsonPointer.match(successPattern);
                const workflowStepName = matches[1];
                const invocationId = matches[2];
                this.workflowInvocationSuccessesCounter.add(1, { workflowId: workflowId, workflowStepName: workflowStepName, invocationId: invocationId });
                console.log(`Monitor: Recorded a successful invocation for workflowId: ${workflowId}, workflowStepName: ${workflowStepName}, invocationId: ${invocationId}`);
            }
        };
    }

    async shutdown() {
        await this.meterProvider.shutdown().catch((err) => console.error('Error shutting down MeterProvider:', err));
        await metrics.disable();
    }
}

export const workflowMetrics = new WorkflowMetrics();
