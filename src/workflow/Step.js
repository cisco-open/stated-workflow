import {default as jp} from "stated-js/dist/src/JsonPointer.js";

export default class Step {
    constructor(stepJson, templateProcessor) {
        this.stepJson = stepJson;
        this.templateProcessor = templateProcessor;
    }

    async run(invocationLogJsonPtr, args) {
        const {templateProcessor:tp} = this;
        let invocationLog = jp.get(this.templateProcessor.output, invocationLogJsonPtr);
        if(invocationLog===undefined){
            invocationLog = {
                start: {
                    timestamp: new Date().getTime(),
                    args
                }
            };
            tp.setData(invocationLogJsonPtr, invocationLog );
        }

        let {function: fn, shouldRetry=(invocationLog)=>false} =  this.stepJson;
        let {retryCount}  = invocationLog;
        do {
            try {
                if (retryCount !== undefined) {
                    tp.setData(invocationLogJsonPtr+"/retryCount", ++retryCount);
                }
                let out = await fn.apply(this, [args]);
                const end = {
                    timestamp: new Date().getTime(),
                    out
                };
                tp.setData(invocationLogJsonPtr+"/end", {start});
                tp.removeData(invocationLogJsonPtr+"/fail")
                return out;
            } catch (error) {
                tp.setData(invocationLogJsonPtr+"/fail" , {error, timestamp: new Date().getTime()});
            }

            if (retryCount === undefined) {
                tp.setData(invocationLogJsonPtr + "/retryCount", 0);
            }

            const shouldRetryResult = await shouldRetry.apply(this, [invocationLog]);
            if (!shouldRetryResult) break;
        } while (true);

    }

}