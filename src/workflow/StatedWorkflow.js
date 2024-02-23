#!/usr/bin/env node --experimental-vm-modules
// Copyright 2023 Cisco Systems, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import TemplateProcessor from "stated-js/dist/src/TemplateProcessor.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import express from 'express';
import Pulsar from 'pulsar-client';
import {Kafka, logLevel} from 'kafkajs';
import winston from "winston";
import {WorkflowDispatcher} from "./WorkflowDispatcher.js";
import {StepLog} from "./StepLog.js";
import Step from "./Step.js";
import {createStepPersistence} from "./StepPersistence.js";
import {TemplateUtils} from "./utils/TemplateUtils.js";
import {WorkflowPersistence} from "./WorkflowPersistence.js";
import jp from "stated-js/dist/src/JsonPointer.js";
import util from "util";
import fs from "fs";
import path from "path";
import {Delay} from "../test/TestTools.js"
import {Snapshot} from "./Snapshot.js";
import {rateLimit} from "stated-js/dist/src/utils/rateLimit.js";
import {PulsarClientMock} from "../test/PulsarMock.js";

const writeFile = util.promisify(fs.writeFile);
const basePath = path.join(process.cwd(), '.state');

//This class is a wrapper around the TemplateProcessor class that provides workflow functionality
export class StatedWorkflow {
    // static express = require('express');
    static app = express();
    static port = 8080;


    static persistence = createStepPersistence();

    constructor(template, context, stepPersistence ){
        this.stepPersistence = stepPersistence;
        this.logger = winston.createLogger({
            format: winston.format.json(),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                      winston.format.colorize(),
                      winston.format.simple()
                    )
                })
            ],
            level: "error", //log level must be ERROR by default. Do not commit code that sets this to DEBUG as a default
        });

        // TODO: parameterize
        this.host = process.env.HOST_IP

        this.consumers = new Map(); //key is type, value is pulsar consumer
        this.dispatchers = new Map(); //key is type, value Set of WorkflowDispatcher

        // TODO: fix CliCore.setupContext to respect context passed to the constructor
        // const tp = new TemplateProcessor(template, {...TemplateProcessor.DEFAULT_FUNCTIONS, ...StatedWorkflow.FUNCTIONS});
        TemplateProcessor.DEFAULT_FUNCTIONS = {...TemplateProcessor.DEFAULT_FUNCTIONS, ...{
                "id": StatedWorkflow.generateDateAndTimeBasedID.bind(this),
                "onHttp": this.onHttp.bind(this),
                "publish": this.publish.bind(this),
                "logFunctionInvocation": this.logFunctionInvocation.bind(this),
                "workflow": this.workflow.bind(this),
                "recover": this.recover.bind(this),
                "sleep": Delay.start
            }
        };
        this.templateProcessor = new TemplateProcessor(template, context);
        this.templateProcessor.functionGenerators.set("serial", this.serialGenerator.bind(this));
        this.templateProcessor.functionGenerators.set("parallel", this.parallelGenerator.bind(this));
        this.templateProcessor.functionGenerators.set("recoverStep", this.recoverStepGenerator.bind(this));
        this.templateProcessor.functionGenerators.set("subscribe", this.subscribeGenerator.bind(this));
        this.templateProcessor.logLevel = logLevel.ERROR; //log level must be ERROR by default. Do not commit code that sets this to DEBUG as a default
        this.hasChanged = true;
        this.changeListener = ()=>{this.hasChanged=true};
        this.snapshotInterval = null;
        //functions can be added here for all things that need to run during templateProcessor.onInitialize()
        this.templateProcessor.initCallbacks = [
            // --- clear the dispatcher ---
            ()=>{this.workflowDispatcher && this.workflowDispatcher.clear()},
            //---  add rateLimited  ---
            // ()=>{
            ()=>{
                const {snapshot: snapshotOpts} = this.templateProcessor.options;
                if(!snapshotOpts){
                    return;
                }
                const {seconds = 1} = snapshotOpts;
                this.snapshotInterval = setInterval(async ()=>{
                    if(this.hasChanged){
                        await Snapshot.write(this.templateProcessor);
                        this.hasChanged = false; //changeListener will alter this if the template changes so we are not permanently blocking snapshots
                    }
                }, seconds*1000)
            },
            //---  listen for changes so we can avoid snapshotting if nothing changed ---
            ()=>{
                this.templateProcessor.setDataChangeCallback("/", this.changeListener);
            }


        ];
        //add a named initializer for stated-workflows that runs all of the stated-workflows init callbacks
        this.templateProcessor.onInitialize.set("stated-workflows",()=>this.templateProcessor.initCallbacks.map(cb=>cb())); //call all initCallbacks
    }

    // this method returns a StatedWorkflow instance with TemplateProcesor with the default functions and Stated Workflow
    // functions. It also initializes persistence store, and set generator functions.
    static async newWorkflow(template, stepPersistenceType = 'noop', context = {}) {
        const stepPersistence = createStepPersistence({persistenceType: stepPersistenceType});
        await stepPersistence.init();
        return new StatedWorkflow(template, context, stepPersistence);
    }


    /*
    async initialize() {
        await this.templateProcessor.initialize();
        this.pulsarClient = new Pulsar.Client({
            serviceUrl: 'pulsar://localhost:6650',
        });


        this.kafkaClient = new Kafka({
            clientId: 'workflow-kafka-client',
            brokers: [`${StatedWorkflow.host}:9092`],
            logLevel: logLevel.DEBUG,
        });

    }

     */

    setWorkflowPersistence() {
        const persistence = new WorkflowPersistence({workflowName: this.templateProcessor.input.name});
        const cbFn = async (data, jsonPtr, removed) => {
            try {
                await persistence.persist(this.templateProcessor);
            } catch (error) {
                console.error(`Error persisting workflow state: ${error}`);
            }
        }
        this.templateProcessor.removeDataChangeCallback('/');
        this.templateProcessor.setDataChangeCallback('/',cbFn);

    }

    async logFunctionInvocation(stage, args, result, error = null, log) {
        const logMessage = {
            context: stage.name,
            function: stage.function.name,
            start: new Date().toISOString(),
            args: args
        };

        if (error) {
            logMessage.error = {
                timestamp: new Date().toISOString(),
                message: error.message
            };
        } else {
            logMessage.finish = new Date().toISOString();
            logMessage.out = result;
        }
        console.log(StatedREPL.stringify(logMessage));

        // Assuming 'logs' array is inside 'log' object
        if (log.logs) {
            log.logs.push(logMessage);
        } else {
            log.logs = [logMessage];
        }
    }

    createPulsarClientMock(params) {
        if (this.pulsarClient) return;

        this.pulsarClient = new PulsarClientMock({
            serviceUrl: 'pulsar://localhost:6650',
        });
    }

    createPulsarClient(params) {
        if (this.pulsarClient) return;
    
        this.pulsarClient = new Pulsar.Client({
            serviceUrl: 'pulsar://localhost:6650',
        });
    }
    createKafkaClient(params) {
        if (this.kafkaClient) return;

        this.kafkaClient = new Kafka({
            clientId: 'workflow-kafka-client',
            brokers: [`${this.host}:9092`],
            logLevel: logLevel.DEBUG,
        });
    }

    async publish(params) {
        this.logger.debug(`publish params ${StatedREPL.stringify(params)} }`);

        const {data, type, client:clientParams={}} = params;

        if(!this.workflowDispatcher) {
            this.workflowDispatcher = new WorkflowDispatcher(params);
        }

        if (clientParams  && clientParams.type === 'test') {
            this.logger.debug(`test client provided, will not publish to 'real' message broker for publish parameters ${StatedREPL.stringify(params)}`);
            await this.workflowDispatcher.addBatchToAllSubscribers(type, data);
            return "done";
        }

        const {type:clientType} = clientParams
        if (clientType=== 'kafka') {
            this.publishKafka(params, clientParams);
        } else if(clientType==="pulsar") {
            this.publishPulsar(params, clientParams);
        }else if(clientType === 'pulsarMock'){
            this.logger.debug(`publishing to pulsarMock using ${clientParams}`)
            this.createPulsarClientMock(clientParams);
            this.publishPulsar(params, clientParams);
        }else{
            throw new Error(`Unsupported clientType: ${clientType}`);
        }
        return "done";
    }

    publishKafka(params, clientParams) {
        this.logger.debug(`kafka publish params ${StatedREPL.stringify(params)}`);
        const {type, data} = params;

        (async () => {
            const producer = this.kafkaClient.producer();

            await producer.connect();

            try {
                let _data = data;
                if (data._jsonata_lambda === true || data._stated_function__ === true) {
                    _data = await data(); //data is a function, call it
                }
                this.logger.debug(`kafka producer sending ${StatedREPL.stringify(_data)} to ${type}`);

                // Send a message
                await producer.send({
                    topic: type,
                    messages: [
                        { value: StatedREPL.stringify(_data, null, 2) },
                    ],
                });
            } catch (err) {
                console.error(`Error publishing to Kafka: ${err}`);
            } finally {
                // Close the producer when done
                await producer.disconnect();
            }
        })();
    }

    publishPulsar(params, clientParams) {
        this.logger.debug(`pulsar publish params ${StatedREPL.stringify(params)}`);
        const {type, data} = params;
        (async () => {


            // Create a producer
            const producer = await this.pulsarClient.createProducer({
                topic: type,
            });

            try {
                let _data = data;
                if (data._jsonata_lambda === true || data._stated_function__ === true) {
                    _data = await data(); //data is a function, call it
                }
                this.logger.debug(`pulsar producer sending ${StatedREPL.stringify(_data)}`);
                // Send a message
                const messageId = await producer.send({
                    data: Buffer.from(StatedREPL.stringify(_data, null, 2)),
                });
            }finally {
                // Close the producer and client when done
                producer.close();
            }
        })();

    }

    async subscribeGenerator(metaInf, tp) {
        return async (subscribeOptions) => {

            const resolvedJsonPointers = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp, 'subscribe'); //fixme todo we should avoid doing this for every jsonata evaluation
            // TemplateUtils.validateStepPointers(resolvedJsonPointers, steps, metaInf, 'subscribe');
            // const resolvedJsonPointers2 = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp, 'serial');
            // const metaInfo2 = jp.get(tp.templateMeta, subscribeOptions.to);

            return this.subscribe(subscribeOptions, resolvedJsonPointers, tp);
        }
    }

    async subscribe(subscribeOptions, resolvedJsonPointers = {}, tp = undefined) {
        const {source} = subscribeOptions;
        this.logger.debug(`subscribing ${StatedREPL.stringify(source)}`);

        if(!this.workflowDispatcher) {
            this.workflowDispatcher = new WorkflowDispatcher(subscribeOptions);
        }


        // let resolve;
        // this.templateProcessor.setDataChangeCallback('/', async (data, jsonPtr, removed) => {
        //     if (jsonPtr === '/step1/log/*/args') { //TODO: regexify
        //         // TODO: await persist the step
        //         resolve();
        //     }
        // });


        if (source === 'http') {
            return this.onHttp(subscribeOptions);
        }
        if (source === 'cloudEvent') {
            return this.subscribeCloudEvent(subscribeOptions);
        }
        if (!source) {
            throw new Error("Subscribe source not set");
        }
        throw new Error(`Unknown subscribe source ${source}`);
    }

    subscribePulsar(subscriptionParams) {
        const {type, initialPosition = 'earliest', maxConsume = -1} = subscriptionParams;
        this.logger.debug(`pulsar subscribe params ${StatedREPL.stringify(subscriptionParams)}`);
        //make sure a dispatcher exists for the combination of type and subscriberId
        this.workflowDispatcher.getDispatcher(subscriptionParams);
        // Check if a consumer already exists for the given subscription
        if (this.consumers.has(type)) {
            this.logger.debug(`pulsar subscriber already started. Bail.`);
            return; //bail, we are already consuming and dispatching this type
        }
        (async () => {
            const consumer = await this.pulsarClient.subscribe({
                topic: type,
                subscription: type, //we will have only one shared-mode consumer group per message type/topics and we name it after the type of the message
                subscriptionType: 'Shared',
                subscriptionInitialPosition: initialPosition
            });
            // Store the consumer in the map
            this.consumers.set(type, consumer);
            let data;
            let countdown = maxConsume;

            while (true) {
                try {
                    data = await consumer.receive();
                    let obj;
                    let messageId;
                    try {
                        const str = data.getData().toString();
                        messageId = data.getMessageId();
                        obj = JSON.parse(str);
                    } catch (error) {
                        console.error("unable to parse data to json:", error);
                        // TODO - should we acknowledge the message here?
                        continue;
                    }
                    let resolve;
                    this.latch = new Promise((_resolve) => {
                        resolve = _resolve; //we assign our resolve variable that is declared outside this promise so that our onDataChange callbacks can use  it
                    });

                    // TODO: switch to pass acknowledgement callback to dispatch
                    this.templateProcessor.setDataChangeCallback('/', async (data, jsonPtrs, removed) => {
                        for (let jsonPtr of jsonPtrs) {
                            // if (/^\/step\d+\/log\/.*$/.test(jsonPtr)) {
                            //     fs.writeFileSync(path.join(basePath,'template.json') , StatedREPL.stringify(data), 'utf8');
                            // }
                            if (/^\/step1\/log\/.*$/.test(jsonPtr)) {
                                // TODO: await persist the step
                                const dataThatChanged = jp.get(data, jsonPtr);
                                if (dataThatChanged.start !== undefined && dataThatChanged.end === undefined) {
                                    resolve();
                                    // consumer.acknowledgeId(data);
                                    consumer.acknowledgeId(messageId);
                                }
                            }
                        }

                    });


                    //if the dispatchers max parallelism is reached this loop should block, which is why we await
                    await this.workflowDispatcher.dispatchToAllSubscribers(type, obj);
                    if(countdown && --countdown===0){
                        break;
                    }
                } catch (error) {
                    console.error("Error receiving or dispatching message:", error);
                } finally {
                    if (data !== undefined) {
                        await this.latch;
                        consumer.acknowledge(data);
                    }

                    if (this.pulsarClient === undefined) {
                        break;
                    }
                }
            }
            this.logger.debug(`closing consumer with params ${StatedREPL.stringify(subscriptionParams)}`);
            try {
                await consumer.close();
            } catch (error) {
                console.error("Error closing consumer:", error);
            }
        })();
    }

    async subscribeKafka(subscriptionParams) {
        const { type, initialOffset = 'earliest', maxConsume = -1 } = subscriptionParams;
        this.logger.debug(`Kafka subscribe params ${StatedREPL.stringify(subscriptionParams)} with clientParams ${StatedREPL.stringify(clientParams)}`);

        // Make sure a dispatcher exists for the combination of type and subscriberId
        this.workflowDispatcher.getDispatcher(subscriptionParams);
    
        // Check if a consumer already exists for the given subscription
        if (this.consumers.has(type)) {
            this.logger.debug(`Kafka subscriber already started. Bail.`);
            return; // Bail, we are already consuming and dispatching this type
        }
    
        const consumer = this.kafkaClient.consumer({ groupId: type });
    
        try {
            await consumer.connect();
            await consumer.subscribe({ topic: type, fromBeginning: true });
  
        } catch (e) {
            this.logger.debug(`Kafka subscriber - failed, e: ${e}`);
        }
        this.logger.debug(`Kafka subscriber - subscribed.`);
    
        // Store the consumer in the map
        this.consumers.set(type, consumer);
        let countdown = maxConsume;
    
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                let data;
                this.logger.debug(`Kafka subscriber got ${message} from ${topic}:${partition}.`);
                try {
                    const str = message.value.toString();
                    data = JSON.parse(str);
                } catch (error) {
                    console.error("Unable to parse data to JSON:", error);
                }
    
                this.workflowDispatcher.dispatchToAllSubscribers(type, data);
    
                if (countdown && --countdown === 0) {
                    // Disconnect the consumer if maxConsume messages have been processed
                    await consumer.disconnect();
                }
            }
        });
    }

    async subscribeCloudEvent(subscriptionParams) {
        const {testData, client:clientParams={type:'test'}, to} = subscriptionParams;
        //to-do fixme do validation of subscriptionParams
        if(!to){
            throw new Error(`mandatory 'to' field was not provided for '${subscriptionParams.subscriberId}'`);
        }else if(!to._stated_function__ && !to.function?._stated_function__){
            throw new Error(`'to' parameter for '${subscriptionParams.subscriberId}' is neither a function or a step object with a function field`);
        }

        const {type:clientType} = clientParams;

        if (testData !== undefined) {
            this.logger.debug(`No 'real' subscription created because testData provided for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
            const dispatcher = this.workflowDispatcher.getDispatcher(subscriptionParams);
            await dispatcher.addBatch(testData);
            await dispatcher.drainBatch(); // in test mode we wanna actually wait for all the test events to process
            return;
        }
        if(clientType==='test'){
            this.logger.debug(`No 'real' subscription created because client.type='test' set for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
            const dispatcher = this.workflowDispatcher.getDispatcher(subscriptionParams); // we need a dispatched even if no real message bus
        }else if (clientType === 'kafka') {
            this.logger.debug(`subscribing to kafka using ${clientParams}`)
            this.createKafkaClient(clientParams);
            this.subscribeKafka(subscriptionParams);
        }else if(clientType === 'pulsar') {
            this.logger.debug(`subscribing to pulsar (default) using ${clientParams}`)
            this.createPulsarClient(clientParams);
            this.subscribePulsar(subscriptionParams);
        }else if(clientType === 'pulsarMock'){
            this.logger.debug(`subscribing to pulsarMock using ${clientParams}`)
            this.createPulsarClientMock(clientParams);
            this.subscribePulsar(subscriptionParams);
        }else{
            throw new Error(`unsupported client.type in ${StatedREPL.stringify(subscriptionParams)}`);
        }
        return `listening clientType=${clientType} ... `
    }

    onHttp(subscriptionParams) {
        StatedWorkflow.app.all('*', async (req, res) => {
            // Push the request and response objects to the dispatch queue to be handled by callback
            await this.workflowDispatcher.addToQueue({req, res});
        });

        StatedWorkflow.app.listen(StatedWorkflow.port, () => {
            console.log(`Server started on http://localhost:${StatedWorkflow.port}`);
        });

        return "listening http ..."

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

        if (workflowInvocation === undefined) {
            workflowInvocation = StatedWorkflow.generateDateAndTimeBasedID();
        }

        if (input === '__recover__' && stepJsons?.[0]) {
            const step = new Step(stepJsons[0], StatedWorkflow.persistence, resolvedJsonPointers?.[0], tp);
            for  (let workflowInvocation of step.log.getInvocations()){
                await this.serial(undefined, stepJsons, {workflowInvocation}, resolvedJsonPointers, tp);
            }
            return;
        }

        let currentInput = input;
        const steps = [];
        for (let i = 0; i < stepJsons.length; i++) {
            const step = new Step(stepJsons[i], StatedWorkflow.persistence, resolvedJsonPointers?.[i], tp);
            steps.push(step);
            currentInput = await this.runStep(workflowInvocation, step, currentInput);
        }


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
            let step = new Step(stepJsons[i], StatedWorkflow.persistence, resolvedJsonPointers?.[i], tp);
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

    static async persistLogRecord(stepRecord) {
        this.publish(
          {'type': stepRecord.workflowName, 'data': stepRecord},
          {type:'pulsar', params: {serviceUrl: 'pulsar://localhost:6650'}}
        );
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
        let step = new Step(stepJson, StatedWorkflow.persistence, resolvedJsonPointer, tp);
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
            StatedWorkflow.persistLogRecord(stepRecord);
            return result;
        } catch (error) {
            stepRecord.end = new Date().getTime();
            stepRecord.error = {message: error.message};
            currentLog.info.status = 'failed';
            currentLog.execution[stepRecord.stepName] = stepRecord;
            StatedWorkflow.persistLogRecord(stepRecord);
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

    static generateUniqueId() {
        return `${new Date().getTime()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    static generateDateAndTimeBasedID() {
        const date = new Date();
        const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
        const timeInMs = date.getTime();
        const randomPart = Math.random().toString(36).substring(2, 6);  // 4 random characters for added uniqueness

        return `${dateStr}-${timeInMs}-${randomPart}`;
    }

    async workflow(input, steps, options={}) {
        const {name: workflowName, log} = options;
        let {id} = options;

        if (log === undefined) {
            throw new Error('log is missing from options');
        }

        if (id === undefined) {
            id = StatedWorkflow.generateUniqueId();
            options.id = id;
        }

        StatedWorkflow.initializeLog(log, workflowName, id);

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


    async close() {

        if (this.pulsarClient !== undefined) {
            try {
                await this.pulsarClient.close();
            } catch (error) {
                console.error("Error closing pulsar client:", error);
            }
            this.pulsarClient = undefined;
        }

        this.templateProcessor.removeDataChangeCallback(this.changeListener);

        // TODO: check if consumers can be closed without client
        // for (let consumer of StatedWorkflow.consumers.values()) {
        //     console.log(consumer);
        //     await consumer.disconnect();
        // }
        try {
            await this.workflowDispatcher.clear();
            await this.templateProcessor.close();

        } catch (error) {
            console.error("Error closing workflow dispatcher:", error);
        }
        clearInterval(this.snapshotInterval);
    }
}
