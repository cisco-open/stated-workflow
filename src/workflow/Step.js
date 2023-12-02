
export default class Step {
    constructor(stepJson, persistence) {
        this.stepJson = stepJson;
        this.persistence = persistence;
    }

    async run(workflowInvocation, args) {
        const start = {
            timestamp: new Date().getTime(),
            args
        };

        let {log, function: fn, shouldRetry=(invocationLog)=>false} = this.stepJson;
        log = this.initLog(log);
        let invocationLog;
        if (log[workflowInvocation] == undefined) {
            invocationLog = {start};
            log[workflowInvocation] = invocationLog
        } else {
            invocationLog = log[workflowInvocation];
        }

        do {
            try {
                if (invocationLog['retryCount'] !== undefined) {
                    invocationLog['retryCount']++;
                }
                let out = await fn.apply(this, [args, {workflowInvocation}]);
                const end = {
                    timestamp: new Date().getTime(),
                    out
                };
                delete invocationLog.fail;
                invocationLog['end'] = end;
                this.persistence.save(workflowInvocation, this.stepJson, invocationLog);
                return out;
            } catch (error) {
                invocationLog['fail'] = {error, timestamp: new Date().getTime()}
            }

            if (invocationLog['retryCount'] === undefined) {
                invocationLog['retryCount'] = 0;
            }
            this.persistence.save(workflowInvocation, this.stepJson, invocationLog);
            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);

    }

    initLog(log) {
        if (log === undefined) {
            log = {};
            this.stepJson.log = log; //init to empty log, no workflowInvocations in it
        }
        return log;
    }
}