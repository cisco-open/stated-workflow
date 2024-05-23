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
            workflowInvocation = StatedWorkflow.generateDateAndTimeBasedID();
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
        if (!tp.options.keepLogs) StatedWorkflow.deleteStepsLogs(workflowInvocation, steps)
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
            workflowInvocation = StatedWorkflow.generateDateAndTimeBasedID();
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

        if (!tp.options.keepLogs) await StatedWorkflow.deleteStepsLogs(workflowInvocation, steps);

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
}