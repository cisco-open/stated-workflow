
export default class Step {
    constructor(stepJson, persistence, jsonPath = null, tp) {
        this.stepJson = stepJson;
        this.persistence = persistence;
        this.jsonPath = jsonPath;
        this.tp = tp;
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
                this.persistence.store(this.stepJson, workflowInvocation, invocationLog, this.jsonPath);
                return out;
            } catch (error) {
                invocationLog['fail'] = {error, timestamp: new Date().getTime()}
            }

            if (invocationLog['retryCount'] === undefined) {
                invocationLog['retryCount'] = 0;
            }
            this.persistence.store(this.stepJson, workflowInvocation, invocationLog, this.jsonPath);
            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);

    }

    initLog(log) {
        if (log === undefined) {
            log = {};
            this.stepJson.log = log; //init to empty log, no workflowInvocations in it
        }
        if (this.tp === undefined) {
            return log;
        }
        // if (this.jsonPath) {
        //     log[this.jsonPath] = {};
        //     return new Proxy(log[this.jsonPath], {
        //         set: (target, property, value) => {
        //             this.changeLog(target, property, value);
        //             target[property] = value;
        //             return true; // indicates success
        //         }
        //     });
        // }
        return new Proxy(log, {
            set: (target, property, value) => {
                try {
                    this.changeLog(target, property, value);
                } catch (e) {
                    console.log(`Error in changeLog: ${e}`);
                    return false;
                }
                return true; // indicates success
            }
        });
    }

    changeLog(target, property, value) {
        // TODO: this has to implement chaning data through the TemplateProcessor.setData
        // console.log(`Log changed - this.jsonPath: ${this.jsonPath}, target: ${JSON.stringify(target)}, property: ${property}, value: ${JSON.stringify(value)}`);
        // jsonPath points to the step description. We store logs in jsonPath + '/log, and need to key it by workflowInvocation, which comes in property value.
        this.tp.setData(this.jsonPath + '/log/' + 'property', value, "set");
    }
}