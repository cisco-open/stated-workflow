import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics-base';

export class WorkflowMetrics {
    constructor() {
        const meterProvider = new MeterProvider({});
        metrics.setGlobalMeterProvider(meterProvider);
        this.meter = metrics.getMeter('workflowMetrics');

        this.workflowInvocationsCounter = this.meter.createCounter('workflow_invocations', {
            description: 'Counts the number of times workflows are invoked',
        });

        this.workflowFailuresCounter = this.meter.createCounter('workflow_failures', {
            description: 'Counts the number of times workflows fail',
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
                this.workflowFailuresCounter.add(1, { workflowId: workflowId, workflowStepName: workflowStepName, invocationId: invocationId });
                console.log(`Monitor: Recorded a failure for workflowId: ${workflowId}, workflowStepName: ${workflowStepName}, invocationId: ${invocationId}`);
            } else if (successPattern.test(firstJsonPointer) && removed) {
                const matches = firstJsonPointer.match(successPattern);
                const workflowStepName = matches[1];
                const invocationId = matches[2];
                this.workflowInvocationsCounter.add(1, { workflowId: workflowId, workflowStepName: workflowStepName, invocationId: invocationId });
                console.log(`Monitor: Recorded a successful invocation for workflowId: ${workflowId}, workflowStepName: ${workflowStepName}, invocationId: ${invocationId}`);
            }
        };
    }
}

export const workflowMetrics = new WorkflowMetrics();
