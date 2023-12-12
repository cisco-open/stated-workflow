/**
 * This class is responsible for persisting the workflow invocation log. Current persistence types: template, memory, file, queue
 * Template one persists each invocation log as an object in the template. This is the behavior by default.
 * Memory persists the log in the memory of the workflow process, so it is lost when the process is restarted.
 * File persists the log in a file. The file can recover from the process/instance restart with persistent volumes.
 * Queue persists the log in a queue service. The queue can recover from the process/instance restart.
 */
export default class Persistence {

    constructor(persistenceType = 'memory') {
        this.log = {};
        this.persistenceType = persistenceType;

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


    static async persistLogRecord(stepRecord) {
        StatedWorkflow.publish(
          {'type': stepRecord.workflowName, 'data': stepRecord},
          {type:'pulsar', params: {serviceUrl: 'pulsar://localhost:6650'}}
        );
    }

}