/**
 * This class is responsible for persisting the workflow invocation log. Current persistence types: template, memory, file, queue
 * Template one persists each invocation log as an object in the template. This is the behavior by default.
 * Memory persists the log in the memory of the workflow process, so it is lost when the process is restarted.
 * File persists the log in a file. The file can recover from the process/instance restart with persistent volumes.
 * Queue persists the log in a queue service. The queue can recover from the process/instance restart.
 */

import fs from 'fs';
import path from 'path';
import util from 'util';

const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);

// IPersistence.js
export class IPersistence {
    store(stepJson, invocationId, log, jsonPath) {
        throw new Error("Method 'store()' must be implemented.");
    }

    restore() {
        throw new Error("Method 'restore()' must be implemented.");
    }
}

export function createPersistence(persistenceParams = {persistenceType: "memory"}) {
    switch (persistenceParams.persistenceType) {
        case 'memory':
            return new MemoryPersistence(persistenceParams);
        case 'file':
            return new FilePersistence(persistenceParams);
        case 'queue':
            return new QueuePersistence(persistenceParams);
        default:
            throw new Error("Invalid persistence type");
    }
}

export class MemoryPersistence extends IPersistence {

    log = {};
    constructor(params) {
        super();

    }

    store(stepJson, invocationId, log, jsonPath) {
        if (!(stepJson in this.log)) {
            this.log[stepJson] = {};
        }
        this.log[stepJson][invocationId] = log;
    }

    async load(workflowInvocation, stepJson) {
        if (!(stepJson in this.log)) {
            this.log[stepJson] = {};
        }
        const log = this[stepJson]

        if (!log.has(workflowInvocation)) {
            const start = {
                timestamp: new Date().getTime(),
                args
            };
            log[workflowInvocation] = {start};
        }

        return log;
    }

    restore() {
        // TODO: implement
    }
}

export class FilePersistence extends IPersistence {
    constructor(params) {
        super();
        // File specific initialization
    }

    store(stepJson, invocationId, log, jsonPath) {

    }

    restore() {
        // TODO: implement
    }
}

export class QueuePersistence extends IPersistence {
    serviceUrl;
    constructor(params) {
        super();
        this.serviceUrl = 'pulsar://localhost:6650'
    }

    store(stepJson, invocationId, log, jsonPath) {
        StatedWorkflow.publish(
          {'type': stepJson.workflowName, 'data': log},
          {type:'pulsar', params: {serviceUrl: this.serviceUrl}}
        );
    }

    restore() {
        // TODO: implement
    }
}
