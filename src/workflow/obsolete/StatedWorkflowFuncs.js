import {TemplateUtils} from "../utils/TemplateUtils.js";
import Step from "./Step.js";

export class StatedWorkflowFuncs {

    constructor() {
        // this.templateProcessor.functionGenerators.set("serial", this.serialGenerator.bind(this));
        // this.templateProcessor.functionGenerators.set("parallel", this.parallelGenerator.bind(this));
        // this.templateProcessor.functionGenerators.set("recoverStep", this.recoverStepGenerator.bind(this));
    }

    async serialGenerator(metaInf, tp) {
        return async (input, steps, context) => {

            const resolvedJsonPointers = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp,   'serial'); //fixme todo we should avoid doing this for every jsonata evaluation
            TemplateUtils.validateStepPointers(resolvedJsonPointers, steps, metaInf, 'serial');

            return this.serial(input, steps, context, resolvedJsonPointers, tp);
        }
    }

    async serial(input, stepJsons, context={}, resolvedJsonPointers = {}, tp = undefined) {
        let {workflowInvocation} = context;

        let workflowStart = new Date().getTime();

        if (workflowInvocation === undefined) {
            workflowInvocation = generateDateAndTimeBasedID();
        }

        if (input === '__recover__' && stepJsons?.[0]) {
            const step = new Step(stepJsons[0], resolvedJsonPointers?.[0], tp);
            for  (let workflowInvocation of step.log.getInvocations()){
                await this.serial(undefined, stepJsons, {workflowInvocation}, resolvedJsonPointers, tp);
            }
            return;
        }

        let currentInput = input;
        const steps = [];
        for (let i = 0; i < stepJsons.length; i++) {
            const step = new Step(stepJsons[i], resolvedJsonPointers?.[i], tp);
            steps.push(step);
            currentInput = await this.runStep(workflowInvocation, step, currentInput);
            if (currentInput !== undefined && currentInput.error) {
                this.workflowMetrics.workflowInvocationFailuresCounter.add(1, {workflowInvocation});
                return currentInput;
            }
        }

        // metrics
        this.workflowMetrics.workflowInvocationsCounter.add(1, {workflowInvocation});
        this.workflowMetrics.workflowInvocationLatency.record(new Date().getTime() - workflowStart, {workflowInvocation});

        //we do not need to await this. Deletion can happen async
        if (!tp.options.keepLogs) deleteStepsLogs(workflowInvocation, steps)
            .catch(e=>this.templateProcessor.logger.error(`failed to delete completed log with invocation id '${workflowInvocation}'`));

        return currentInput;
    }


    async parallelGenerator(metaInf, tp) {
        let parallelDeps = {};
        return async (input, steps, context) => {

            const resolvedJsonPointers = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp, 'parallel'); //fixme todo we should avoid doing this for every jsonata evaluation
            TemplateUtils.validateStepPointers(resolvedJsonPointers, steps, metaInf, 'parallel');

            return this.parallel(input, steps, context, resolvedJsonPointers, tp);
        }
    }

    // This function is called by the template processor to execute an array of steps in parallel
    async parallel(input, stepJsons, context = {}, resolvedJsonPointers = {}, tp = undefined) {
        let {workflowInvocation} = context;

        if (workflowInvocation === undefined) {
            workflowInvocation = generateDateAndTimeBasedID();
        }

        let promises = [];
        for (let i = 0; i < stepJsons.length; i++) {
            let step = new Step(stepJsons[i], resolvedJsonPointers?.[i], tp);
            const promise = this.runStep(workflowInvocation, step, input)
                .then(result => {
                    // step.output.results.push(result);
                    return result;
                })
                .catch(error => {
                    // step.output.errors.push(error);
                    return error;
                });
            promises.push(promise);
        }

        let result = await Promise.all(promises);

        if (!tp.options.keepLogs) await deleteStepsLogs(workflowInvocation, steps);

        return result;
    }


    async recoverStepGenerator(metaInf, tp) {
        let parallelDeps = {};
        return async (step, context) => {
            const resolvedJsonPointers = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp, 'recoverStep'); //fixme todo we should avoid doing this for every jsonata evaluation
            TemplateUtils.validateStepPointers(resolvedJsonPointers, [step], metaInf, 'recoverStep');
            return this.recoverStep(step, context, resolvedJsonPointers?.[0], tp);
        }
    }


    async recoverStep(stepJson, context, resolvedJsonPointer, tp){
        let step = new Step(stepJson, resolvedJsonPointer, tp);
        for  (let workflowInvocation of step.log.getInvocations()){
            await this.runStep(workflowInvocation, step);
        }
    }

    async recover(to) {
        return await to('__recover__');
    }

    async runStep(workflowInvocation, step, input){

        const {instruction, event:loggedEvent} = step.log.getCourseOfAction(workflowInvocation);
        if(instruction === "START"){
            return await step.run(workflowInvocation, input);
        }else if (instruction === "RESTART"){
            return await step.run(workflowInvocation, loggedEvent.args);
        } else if(instruction === "SKIP"){
            return loggedEvent.out;
        }else{
            throw new Error(`unknown courseOfAction: ${instruction}`);
        }
    }

    async workflow(input, steps, options={}) {
        const {name: workflowName, log} = options;
        let {id} = options;

        if (log === undefined) {
            throw new Error('log is missing from options');
        }

        if (id === undefined) {
            id = generateUniqueId();
            options.id = id;
        }

        initializeLog(log, workflowName, id);

        let currentInput = input;
        let serialOrdinal = 0;
        for (let step of steps) {
            const stepRecord = {invocationId: id, workflowName, stepName: step.name, serialOrdinal, branchType:"SERIAL"};
            currentInput = await this.executeStep(step, currentInput, log[workflowName][id], stepRecord);
            serialOrdinal++;
            if (step.next) this.workflow(currentInput, step.next, options);
        }

        //this.finalizeLog(log[workflowName][id]);
        //this.ensureRetention(log[workflowName]);

        return currentInput;
    }


    static async deleteStepsLogs(workflowInvocation, steps){
        await Promise.all(steps.map(s=>s.deleteLogs(workflowInvocation)));
    }


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
    }



    async executeStep(step, input, currentLog, stepRecord) {
        /*
        const stepLog = {
            step: step.name,
            start: new Date().getTime(),
            args: [input]
        };

        */

        if (currentLog.execution[stepRecord.stepName]?.out) {
            console.log(`step ${step.name} has been already executed. Skipping`);
            return currentLog.execution[stepRecord.stepName].out;
        }
        stepRecord["start"] = new Date().getTime();
        stepRecord["args"] = input;

        // we need to pass invocation id to the step expression
        step.workflowInvocation = stepRecord.workflowInvocation;

        try {
            const result = await step.function.apply(this, [input]);
            stepRecord.end = new Date().getTime();
            stepRecord.out = result;
            currentLog.execution[stepRecord.stepName] = stepRecord;
            persistLogRecord(stepRecord);
            return result;
        } catch (error) {
            stepRecord.end = new Date().getTime();
            stepRecord.error = {message: error.message};
            currentLog.info.status = 'failed';
            currentLog.execution[stepRecord.stepName] = stepRecord;
            persistLogRecord(stepRecord);
            throw error;
        }
    }
    finalizeLog(currentLog) {
        currentLog.info.end = new Date().getTime();
        if (currentLog.info.status !== 'failed') {
            currentLog.info.status = 'succeeded';
        }
    }

    ensureRetention(workflowLogs) {
        const maxLogs = 100;
        const sortedKeys = Object.keys(workflowLogs).sort((a, b) => workflowLogs[b].info.start - workflowLogs[a].info.start);
        while (sortedKeys.length > maxLogs) {
            const oldestKey = sortedKeys.pop();
            delete workflowLogs[oldestKey];
        }
    }

    static async persistLogRecord(stepRecord) {
        this.publish(
            {'type': stepRecord.workflowName, 'data': stepRecord},
            {type:'pulsar', params: {serviceUrl: 'pulsar://localhost:6650'}}
        );
    }


}