import {default as jp} from "stated-js/dist/src/JsonPointer.js";

export default class Step {
    constructor(stepJson, templateProcessor) {
        this.stepJson = stepJson;
        this.templateProcessor = templateProcessor;
    }

    async run(stepJsonPtr, workflowInvocation, args) {
        const {templateProcessor:tp} = this;
        const jsonPtr = stepJsonPtr + "/log/" + workflowInvocation
        let invocationLog;
        if(jp.has(this.templateProcessor.output, jsonPtr)){
            invocationLog = jp.get(this.templateProcessor.output, jsonPtr);
        }
        if(invocationLog===undefined){
            invocationLog = {
                start: {
                    timestamp: new Date().getTime(),
                    args
                }
            };
            tp.setData(jsonPtr, invocationLog );
        }

        let {function: fn, shouldRetry=(invocationLog)=>false} =  this.stepJson;
        let {retryCount}  = invocationLog;
        do {
            try {
                if (retryCount !== undefined) {
                    tp.setData(jsonPtr+"/retryCount", ++retryCount);
                }
                let out = await fn.apply(this, [args]);
                const end = {
                    timestamp: new Date().getTime(),
                    out
                };
                tp.setData(jsonPtr+"/end", end);
                //tp.removeData(jsonPtr+"/fail") FIXME TODDO
                return out;
            } catch (error) {
                tp.setData(jsonPtr+"/fail" , {error, timestamp: new Date().getTime()});
            }

            if (retryCount === undefined) {
                tp.setData(jsonPtr + "/retryCount", 0);
            }

            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);

    }

}