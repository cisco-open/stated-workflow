#!/usr/bin/env node --experimental-vm-modules
import { StatedWorkflow } from "./StatedWorkflow.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import TemplateProcessor from "stated-js";
import {WorkflowMetrics} from "./WorkflowMeters.js";

import fs from "fs";
import util from "util";
import {SnapshotManager} from "./SnapshotManager.js";
const mkdir = util.promisify(fs.mkdir);

export class WorkflowManager {

    constructor(options = {'snapshot': {
            storage: 'fs',
        }}) {
        this.workflows = {};
        this.dispatchersByType = {};
        this.options = options;
        this.workflowMetrics = new WorkflowMetrics();
        this.statePath = './.state';
        this.snapshot = new SnapshotManager(this.options.snapshot)
    }

    async initialize() {
        await this.snapshot.load();
        for (const snapshot of this.snapshot.snapshots) {
            try {
                console.log(`Restoring workflow ${StatedREPL.stringify(snapshot)}`);
                // await this.restoreWorkflow(snapshot.snapshot);
            } catch (error) {
                console.error(`Error restoring workflow ${StatedREPL.stringify(snapshot)}: ${error}`);
            }
        }

    }

    async createTypesMap(sw) {
        if (sw.workflowDispatcher == undefined) {
            return;
        }
        for (const typeEntry of sw.workflowDispatcher.dispatchers) {
            if (!this.dispatchersByType[typeEntry[0]]) {
                this.dispatchersByType[typeEntry[0]] = new Set();
            }
            for (const dispatcherKey of typeEntry[1]) {
                this.dispatchersByType[typeEntry[0]].add(sw.workflowDispatcher.dispatcherObjects.get(dispatcherKey));
            }
        }
    }

    async createWorkflow(template, context) {
        const workflowId = WorkflowManager.generateUniqueId();
        const sw = await StatedWorkflow.newWorkflow(template, context,
            {cbmon: this.workflowMetrics.monitorCallback(workflowId), ackOnSnapshot: true});
        this.options.workflowId = workflowId;
        if (!this.options.snapshotIntervalSeconds) {
            this.options.snapshotIntervalSeconds = 1;
        }
        sw.templateProcessor.options = this.options;
        await this.ensureStatePathDir();
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
     * The result is either success or failure status
     */
    async sendCloudEvent(data) {

        if (this.dispatchersByType === undefined) {
            const errorMessage = `No current subscribers`;
            console.log(errorMessage);
            return {'status': 'failure', error: errorMessage};
        }
        // Create an array of promises for each event to be acknowledged
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
                return {'status': 'failure', error: `No subscriber found for type ${d.type}`};
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

    async getWorkflowSnapshot(workflowId, storage) {
        console.log(`Reading snapshot object with ID ${workflowId}`);

        if (storage === 'knowledge') {
            const snapshot = await SnapshotManager.readFromKnowledge(workflowId);
            return snapshot;
        }
        const snapshotContent = fs.readFileSync(`${this.statePath}/${workflowId}.json`, 'utf8');
        return JSON.parse(snapshotContent);
    }

    async restoreWorkflowFromFile(workflowId) {
        const snapshotContent = fs.readFileSync(`${this.statePath}/${workflowId}.json`, 'utf8');
        const snapshot = JSON.parse(snapshotContent);

        console.log(`Restoring workflow with ID ${workflowId}`);

        if (this.workflows[workflowId]) {
            console.log(`Closing ${workflowId} workflow`);
            await this.workflows[workflowId].close();
        }

        return this.restoreWorkflow(snapshot);
    }

    async restoreWorkflow(snapshot, workflowId) {
        await TemplateProcessor.prepareSnapshotInPlace(snapshot);
        const sw = await StatedWorkflow.newWorkflow(snapshot.template);
        this.workflows[workflowId || WorkflowManager.generateUniqueId()] = sw;
        sw.templateProcessor.options = snapshot.options;
        await sw.templateProcessor.initialize(snapshot.template, '/', snapshot.output);
    }

    deleteWorkflow(workflowId) {
        delete this.workflows[workflowId];
    }

    static generateUniqueId() {
        return Math.random().toString(36).substr(2, 9);
    }

    async close() {
        for (const statedWorkflow of Object.values(this.workflows)) {
            await statedWorkflow.close();
        }
    }

    async ensureStatePathDir() {
        try {
            await mkdir(this.statePath, {recursive: true});
        } catch (error) {
            // if the file exists, we can continue without error
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
}

