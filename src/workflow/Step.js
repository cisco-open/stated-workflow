
export default class Step {
    constructor(stepJson) {
        this.stepJson = stepJson;
    }

    async run(workflowInvocation, args) {
        const start = {
            timestamp: new Date().getTime(),
            args
        };

        let {log, function: fn, shouldRetry} = this.stepJson; //the stepJson log is a map keyed by workflowInvocation
        log = this.initLog(log);
        let invocationLog;
        if (log[workflowInvocation] == undefined) {
            invocationLog = {start};
            log[workflowInvocation] = invocationLog
        } else {
            invocationLog = log[workflowInvocation];
        }
        if (shouldRetry === undefined || shouldRetry === null) {
            shouldRetry = () => true;
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
                invocationLog['end'] = end;
                return out;
            } catch (error) {
                console.error("Error encountered:", error);
                invocationLog['fail'] = {error, timestamp: new Date().getTime()}
            }

            if (invocationLog['retryCount'] === undefined) {
                invocationLog['retryCount'] = 0;
            }

            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            console.log("shouldRetry result:", shouldRetryResult);  // Debugging statement
            if (!shouldRetryResult) break;  // Exit the loop if shouldRetry returns false
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