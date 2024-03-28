#!/usr/bin/env node --experimental-vm-modules
import { StatedWorkflow } from "./StatedWorkflow.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import fs from "fs";
import TemplateProcessor from "stated-js";

import { metrics } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics-base';

// WorkflowManager.js.js
export class WorkflowManager {
    constructor() {
        this.workflows = {};
        this.stats = {}

        const meterProvider = new MeterProvider({});
        metrics.setGlobalMeterProvider(meterProvider);
        this.meter = metrics.getMeter('workflowMetrics');

        // Create metrics
        this.workflowInvocationsCounter = this.meter.createCounter('workflow_invocations', {
            description: 'Counts the number of times workflows are invoked',
        });
        this.workflowFailuresCounter = this.meter.createCounter('workflow_failures', {
            description: 'Counts the number of times workflows fail',
        });

        this.cbmon = (workflowId) => {return (data, jsonPointers, removed) => {
            console.log(`cbmon: workflowId: ${workflowId}, Data changed at ${jsonPointers} to ${data}`);
            // Check for failure pattern
            const failurePattern = /\/([^/]+)\/log\/([^/]+)\/fail$/;
            const successPattern = /\/([^/]+)\/log\/([^/]+)$/;

            const firstJsonPointer = jsonPointers?.[0];
            if (failurePattern.test(firstJsonPointer)) {
                // Extract workflowStepName and invocationId from jsonPointerString if needed
                const matches = firstJsonPointer.match(failurePattern);
                const workflowStepName = matches[1];
                const invocationId = matches[2];
                // Record a failure
                this.workflowFailuresCounter.add(1, { workflowId: workflowId, workflowStepName: workflowStepName, invocationId: invocationId });
                console.log(`cbmon: Recorded a failure for workflowId: ${workflowId}, workflowStepName: ${workflowStepName}, invocationId: ${invocationId}`);
            } else if (successPattern.test(firstJsonPointer) && removed) {
                // Extract workflowStepName and invocationId from jsonPointerString if needed
                const matches = firstJsonPointer.match(successPattern);
                const workflowStepName = matches[1];
                const invocationId = matches[2];
                // Record a successful invocation
                this.workflowInvocationsCounter.add(1, { workflowId: workflowId, workflowStepName: workflowStepName, invocationId: invocationId });
                console.log(`cbmon: Recorded a successful invocation for workflowId: ${workflowId}, workflowStepName: ${workflowStepName}, invocationId: ${invocationId}`);
            }
        }};
    }

    async createWorkflow(template) {
        const workflowId = WorkflowManager.generateUniqueId();
        const sw = await StatedWorkflow.newWorkflow(template, undefined, {}, this.cbmon(workflowId));
        sw.templateProcessor.options = {'snapshot': {'snapshotIntervalSeconds': 1, path: `./${workflowId}.json`}};
        this.workflows[workflowId] = sw;
        await sw.templateProcessor.initialize(template)
        return workflowId;
    }

    createWorkflowMeters(workflowId) {
        this.workflowInvocationsCounter = this.meter.createCounter('workflow_invocations', {
            description: 'Counts the number of times workflows are invoked',
        });
        this.workflowFailuresCounter = this.meter.createCounter('workflow_failures', {
            description: 'Counts the number of times workflows fail',
        });
    }

    getWorkflowIds() {
        return Object.keys(this.workflows);
    }

    getWorkflow(workflowId) {
        return this.workflows[workflowId];
    }

    async sendEvent(workflowId, type, subscriberId, data) {
        const workflow = this.getWorkflow(workflowId);
        if (!workflow.workflowDispatcher) {
            console.log(`Workflow ${workflowId} does not have a dispatcher`);
            console.error(`workflow ${StatedREPL.stringify(workflow)}`);
            throw {'error': 'WorkflowDispatcher is not defined for the workflow'};
        }

        const dispatcher = workflow.workflowDispatcher.getDispatcher({type, subscriberId});
        if (!dispatcher) {
            console.log(`dispatcher not found for type ${type} and subscriberId ${subscriberId}`);
            throw {'error': 'Workflow not found'};
        }

        let acknowledgedEvents = 0;

        console.log(`Adding events data ${data} to dispatcher for type ${type} and subscriberId ${subscriberId}`);
        const promises = [];
        try {
            for (const event of data) {
                const ackDataCallback = () => {
                    acknowledgedEvents++;
                    console.log(`Acknowledged ${acknowledgedEvents} of ${data.length} events`)
                    if (acknowledgedEvents === data.length) {
                        return({'status': 'success'});
                    }
                }
                dispatcher.addToQueue(event, ackDataCallback);
                promises.push(ackDataCallback);
            }
            return {'status': 'success'};
        } catch (error) {
            console.error(`Error sending event: `, error);
            throw error;
        }

    }

    async getWorkflowSnapshot(workflowId) {
        console.log(`Reading snapshot object with ID ${workflowId}`);

        const snapshotContent = fs.readFileSync(`./${workflowId}.json`, 'utf8');
        return JSON.parse(snapshotContent);
    }

    async restoreWorkflow(workflowId) {
        const snapshotContent = fs.readFileSync(`./${workflowId}.json`, 'utf8');
        const snapshot = JSON.parse(snapshotContent);

        console.log(`Restoring workflow with ID ${workflowId}`);

        if (this.workflows[workflowId]) {
            console.log(`Closing ${workflowId} workflow`);
            await this.workflows[workflowId].close();
        }
        await TemplateProcessor.prepareSnapshotInPlace(snapshot);
        const sw = await StatedWorkflow.newWorkflow(snapshot.template);
        this.workflows[workflowId] = sw;
        sw.templateProcessor.options = snapshot.options;
        await sw.templateProcessor.initialize(snapshot.template, '/', snapshot.output);
    }

    deleteWorkflow(workflowId) {
        delete this.workflows[workflowId];
    }

    static generateUniqueId() {
        return Math.random().toString(36).substr(2, 9);
    }

}

