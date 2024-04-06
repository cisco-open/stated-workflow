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

    async sendCE(data) {
        const r = [];
        for (const d of data) {
            this.dispatchersByType[d.type].forEach(
                async (dispatcher) => {
                    const dataAckCallback = (data) => {
                        console.log(`Data Acknowledged: ${StatedREPL.stringify(data)}`);
                    };
                    r.push(await dispatcher.addToQueue(d.data, dataAckCallback));
                });
        }


        return r;
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

