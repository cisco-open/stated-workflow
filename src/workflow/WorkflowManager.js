#!/usr/bin/env node --experimental-vm-modules
import { StatedWorkflow } from "./StatedWorkflow.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import fs from "fs";
import TemplateProcessor from "stated-js";

import {WorkflowMetrics} from "./WorkflowMeters.js";

// WorkflowManager.js.js
export class WorkflowManager {
    constructor() {
        this.workflows = {};
        this.dispatchersByType = {};
        this.workflowMetrics = new WorkflowMetrics();
    }t

    async createTypesMap(sw) {
        for (const typeEntry of sw.workflowDispatcher.dispatchers) {
            if (!this.dispatchersByType[typeEntry[0]]) {
                this.dispatchersByType[typeEntry[0]] = new Set();
            }
            for (const dispatcherKey of typeEntry[1]) {
                this.dispatchersByType[typeEntry[0]].add(sw.workflowDispatcher.dispatcherObjects.get(dispatcherKey));
            }
        }
    }

    async createWorkflow(template) {
        const workflowId = WorkflowManager.generateUniqueId();
        const sw = await StatedWorkflow.newWorkflow(template, undefined, {}, this.workflowMetrics.monitorCallback(workflowId));
        sw.templateProcessor.options = {'snapshot': {'snapshotIntervalSeconds': 1, path: `./${workflowId}.json`}};
        this.workflows[workflowId] = sw;
        await sw.templateProcessor.initialize(template)
        await this.createTypesMap(sw);
        return workflowId;
    }

    getWorkflowIds() {
        return Object.keys(this.workflows);
    }

    getWorkflow(workflowId) {
        return this.workflows[workflowId];
    }

    /**
     * This method sends an array of events to the workflow dispatchers (if one exists for
     * the given type). It waits for all events to be acknowledged by the dispatchers.
     * Event may be acknowledged either when a snapshot is taken or when the event is processed.
     * The result is either success or failure.
     */
    async sendCloudEvent(data) {
        // Placeholder for promises
        const promises = [];
        for (const d of data) {
            if (this.dispatchersByType[d.type]) {
                this.dispatchersByType[d.type].forEach((dispatcher) => {
                    // Add a promise for each data item to be acknowledged
                    let resolve = () => {};
                    promises.push(new Promise((_resolve) => {
                        resolve = _resolve;
                    }));
                    const dataAckCallback = (acknowledgedData) => {
                        console.log(`Data Acknowledged: ${JSON.stringify(acknowledgedData)}`);
                        resolve();
                    };
                    dispatcher.addToQueue(d.data, dataAckCallback);
                });
            } else {
                console.log(`Dispatcher not found for type: ${d.type}`);
            }
        }

        try {
            console.log("Waiting for all promises to resolve");
            const responses = await Promise.all(promises);
            return {"status": "success"};
        } catch (error) {
            console.error("Error processing events: ", error);
            return {"status": "failure", "error": error.message};
        }
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
        const callbacks = [];
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
                callbacks.push(ackDataCallback);
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

