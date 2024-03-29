import {default as jp} from "stated-js/dist/src/JsonPointer.js";
import {StepLog} from "./StepLog.js";

export default class Step {
    constructor(stepJson, persistence, jsonPath = null, tp) {
        this.stepJson = stepJson;
        this.persistence = persistence;
        this.stepJsonPtr = jsonPath;
        this.tp = tp;
        this.log = new StepLog(stepJson);
    }

    /**
     * Runs the step function for the given workflowInvocation and args.
     *
     * @param workflowInvocation
     * @param args
     * @returns {Promise<*>}
     */
    async run(workflowInvocation, args) {

        const jsonPtr = this.stepJsonPtr + "/log/" + workflowInvocation;
        let invocationLog;
        let retryCount;

        let {function: fn, shouldRetry = (invocationLog) => false} = this.stepJson;
        do {
            try {
                if (jp.has(this.tp.output, jsonPtr)) {
                    invocationLog = jp.get(this.tp.output, jsonPtr);
                }
                if (invocationLog === undefined) {
                    invocationLog = {
                        start: {
                            timestamp: new Date().getTime(),
                            args
                        }
                    };
                    await this.tp.setData(jsonPtr, invocationLog);
                }
                let {retryCount} = invocationLog;
                if (retryCount !== undefined) {
                    await this.tp.setData(jsonPtr + "/retryCount", ++retryCount);
                }
                let out = await fn.apply(this, [args, {workflowInvocation}]);

                if (out !== undefined && out.error !== undefined) {
                    throw out.error;
                }

                const end = {
                    timestamp: new Date().getTime(),
                    out
                };
                await this.tp.setData(jsonPtr + "/end", end);
                if (invocationLog.fail !== undefined) {
                    jp.remove(this.tp.output, jsonPtr + "/fail");
                }
                return out;
            } catch (error) {
                const errorLog = {error, timestamp: new Date().getTime()};
                await this.tp.setData(jsonPtr + "/fail", errorLog);

                // each step returns an error object and never throws an exception
                return errorLog;
            }

            if (retryCount === undefined) {
                await this.tp.setData(jsonPtr + "/retryCount", 0);
            }

            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);
    }


    async deleteLogs(workflowInvocation) {
        const jsonPtr = this.stepJsonPtr + "/log/" + workflowInvocation;
        const invocationLog = jp.get(this.tp.output, jsonPtr);
        if (invocationLog === undefined || invocationLog.end === undefined) {
            return;
        }
        this.tp.setData(jsonPtr, undefined, "delete");
    }

}