/**
 * This class is responsible for persisting the workflow invocation log. Current persistence types: template, memory, file, queue
 * Template one persists each invocation log as an object in the template. This is the behavior by default.
 * Memory persists the log in the memory of the workflow process, so it is lost when the process is restarted.
 * File persists the log in a file. The file can recover from the process/instance restart with persistent volumes.
 * Queue persists the log in a queue service. The queue can recover from the process/instance restart.
 */

// IPersistence.js
export class IPersistence {
    store(stepJson, invocationId, log) {
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
    constructor(params) {
        super();
    }

    store() {
    }

    restore() {
    }
}

export class FilePersistence extends IPersistence {
    constructor(params) {
        super();
        // File specific initialization
    }

    store(stepJson, invocationId, log) {

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

    store(stepJson, invocationId, log) {
        StatedWorkflow.publish(
          {'type': stepJson.workflowName, 'data': log},
          {type:'pulsar', params: {serviceUrl: this.serviceUrl}}
        );
    }

    restore() {
        // TODO: implement
    }
}

export class Persistence {

    persistenceImpl;

    constructor(persistenceParams = {persistenceType: "memory"}) {
        this.log = {};
        switch (persistenceParams.persistenceType) {
            case 'memory':
                this.persistenceImpl = new MemoryPersistence(persistenceParams);
            case 'file':
                this.persistenceImpl = new FilePersistence(persistenceParams);


        }
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

    async save(workflowInvocation, stepJson, invocationLog) {
        if (!(stepJson in this.log)) {
            this.log[stepJson] = {};
        }
        this.log[stepJson][workflowInvocation] = invocationLog;
    }


    /** copy of the functions from the StatedWorkflow class below **/

    // ensures that the log object has the right structure for the workflow invocation
    static initializeLog(log, workflowName, id) {
        if (!log[workflowName]) log[workflowName] = {};
        if (!log[workflowName][id]) log[workflowName][id] = {
            info: {
                start: new Date().getTime(),
                status: 'in-progress'
            },
            execution: {}
        };
    };


}
