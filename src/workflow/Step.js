
export default class Step {
    constructor(stepJson, persistence, jsonPath = null, tp) {
        this.stepJson = stepJson;
        this.persistence = persistence;
        this.stepJsonPtr = jsonPath;
        this.tp = tp;
    }

    async run(workflowInvocation, args) {
        if (this.tp !== undefined) {
            return this.runTP(workflowInvocation, args);
        }
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
                this.persistence.store(this.stepJson, workflowInvocation, invocationLog, this.stepJsonPtr);
                return out;
            } catch (error) {
                invocationLog['fail'] = {error, timestamp: new Date().getTime()}
            }

            if (invocationLog['retryCount'] === undefined) {
                invocationLog['retryCount'] = 0;
            }
            this.persistence.store(this.stepJson, workflowInvocation, invocationLog, this.stepJsonPtr);
            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);

    }


    /**
     * This function run the code if we have a TemplateProcessor defined. It uses template processor
     * setData() and out() functions for step log.
     * @param workflowInvocation
     * @param args
     * @returns {Promise<*>}
     */
    async runTP(workflowInvocation, args) {

        let {function: fn, shouldRetry=(invocationLog)=>false} = this.stepJson;

        const invocationLogJsonPtr = this.stepJsonPtr + "/log/" + workflowInvocation;
        let invocationLog = this.tp.out(invocationLogJsonPtr);

        if (invocationLog == undefined || invocationLog == null) {
            invocationLog = {start:
                  {
                      timestamp: new Date().getTime(),
                      args
                  }
            };
            await this.tp.setData(invocationLogJsonPtr, invocationLog);
        }

        let {retryCount}  = invocationLog;
        do {
            try {
                if (retryCount !== undefined) {
                    await this.tp.setData(invocationLogJsonPtr+"/retryCount", ++retryCount);
                }
                let out = await fn.apply(this, [args, {workflowInvocation}]);
                const end = {
                    timestamp: new Date().getTime(),
                    out
                };
                await this.tp.setData(invocationLogJsonPtr+"/end", end);
                // await this.tp.setData(invocationLogJsonPtr+"/fail", undefined);

                return out;
            } catch (error) {
                this.tp.setData(invocationLogJsonPtr+"/fail" , {error, timestamp: new Date().getTime()});
            }

            if (retryCount === undefined || retryCount === null) {
                this.tp.setData(invocationLogJsonPtr + "/retryCount", 0);
                // invocationLog['retryCount'] = 0;
            }
            // await this.tp.setData(this.jsonPath + '/log/' + workflowInvocation, invocationLog);

            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);

    }

    initLog(log) {
        if (log === undefined || log === null) {
            log = {};
        }
        if (this.tp === undefined) {
            this.stepJson.log = log; //init to empty log, no workflowInvocations in it
        }
        return log;
    }

    async changeLog(target, property, value) {
        // TODO: this has to implement chaning data through the TemplateProcessor.setData
        console.log(`Log changed - this.jsonPath: ${this.stepJsonPtr}, target: ${JSON.stringify(target)}, property: ${property}, value: ${JSON.stringify(value)}`);
        // jsonPath points to the step description. We store logs in jsonPath + '/log, and need to key it by workflowInvocation, which comes in property value.
        await this.tp.setData(this.stepJsonPtr + '/log/' + property, value, "set");
    }
}