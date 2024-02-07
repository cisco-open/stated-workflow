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
import {WorkflowDispatcher} from "./workflowDispatcher.js";
import {StepLog} from "./StepLog.js";
import Step from "./Step.js";
import {createStepPersistence} from "./StepPersistence.js";
import {TemplateUtils} from "./utils/TemplateUtils.js";
import {WorkflowPersistence} from "./WorkflowPersistence.js";

//This class is a wrapper around the TemplateProcessor class that provides workflow functionality
export class StatedWorkflow {
    // static express = require('express');
    static app = express();
    static port = 8080;


    static persistence = createStepPersistence();

    constructor(template, context, stepPersistence ){
        // this.templateProcessor = templateProcessor;
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
        // TODO: fix CliCore.setupContext to respect context passed to the constructor
        // const tp = new TemplateProcessor(template, {...TemplateProcessor.DEFAULT_FUNCTIONS, ...StatedWorkflow.FUNCTIONS});

        TemplateProcessor.DEFAULT_FUNCTIONS = {...TemplateProcessor.DEFAULT_FUNCTIONS, ...{
                "id": StatedWorkflow.generateDateAndTimeBasedID.bind(this),
                "onHttp": this.onHttp.bind(this),
                "subscribe": this.subscribe.bind(this),
                "publish": this.publish.bind(this),
                "recover": this.recover.bind(this),
                "logFunctionInvocation": this.logFunctionInvocation.bind(this),
                //"workflow": StatedWorkflow.workflow.bind(this)
            }
        };
        this.templateProcessor = new TemplateProcessor(template, context);
        this.templateProcessor.functionGenerators.set("serial", this.serialGenerator.bind(this));
        this.templateProcessor.functionGenerators.set("parallel", this.parallelGenerator.bind(this));
        this.templateProcessor.functionGenerators.set("recover", this.recoverGenerator.bind(this));
        this.templateProcessor.logLevel = logLevel.ERROR; //log level must be ERROR by default. Do not commit code that sets this to DEBUG as a default
    }

    // this method returns a StatedWorkflow instance with TemplateProcesor with the default functions and Stated Workflow
    // functions. It also initializes persistence store, and set generator functions.
    static async newWorkflow(template, stepPersistenceType = 'noop', context = {}) {
        const stepPersistence = createStepPersistence({persistenceType: stepPersistenceType});
        await stepPersistence.init();
        return new StatedWorkflow(template, context, stepPersistence);
    }

    async initialize() {
        await this.templateProcessor.initialize();
    }

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

    async subscribe(subscribeOptions) {
        const {source} = subscribeOptions;
        this.logger.debug(`subscribing ${StatedREPL.stringify(source)}`);

        if(!this.workflowDispatcher) {
            this.workflowDispatcher = new WorkflowDispatcher(subscribeOptions);
            this.templateProcessor.onInitialize = this.workflowDispatcher.clear; //must remove all subscribers when template reinitialized
        }


        if (source === 'http') {
            return StatedWorkflow.onHttp(subscribeOptions);
        }
        if (source === 'cloudEvent') {
            return this.subscribeCloudEvent(subscribeOptions);
        }
        if (!source) {
            throw new Error("Subscribe source not set");
        }
        throw new Error(`Unknown subscribe source ${source}`);
    }

    static ensureClient(params) {
        if (!params || params.type == 'pulsar') {
            this.createPulsarClient(params);
        } else if (params.type == 'kafka') {
            this.createKafkaClient(params);
        }
    }

    static pulsarClient = new Pulsar.Client({
        serviceUrl: 'pulsar://localhost:6650',
    });

    static host = process.env.HOST_IP

    static kafkaClient = new Kafka({
        clientId: 'workflow-kafka-client',
        brokers: [`${StatedWorkflow.host}:9092`],
        logLevel: logLevel.DEBUG,
    });

    static consumers = new Map(); //key is type, value is pulsar consumer
    static dispatchers = new Map(); //key is type, value Set of WorkflowDispatcher

    createPulsarClient(params) {
        if (StatedWorkflow.pulsarClient) return;
    
        StatedWorkflow.pulsarClient = new Pulsar.Client({
            serviceUrl: 'pulsar://localhost:6650',
        });
    }
    createKafkaClient(params) {
        if (StatedWorkflow.kafkaClient) return;

        StatedWorkflow.kafkaClient = new Kafka({
            clientId: 'workflow-kafka-client',
            brokers: [`${StatedWorkflow.host}:9092`],
            logLevel: logLevel.DEBUG,
        });/**/
    }

    publish(params) {
        this.logger.debug(`publish params ${StatedREPL.stringify(params)} }`);

        const {data, type, client:clientParams={}} = params;

        if(!this.workflowDispatcher) {
            this.workflowDispatcher = new WorkflowDispatcher(params);
            this.templateProcessor.onInitialize = this.workflowDispatcher.clear; //must remove all subscribers when template reinitialized
        }

        if (clientParams  && clientParams.type === 'test') {
            this.logger.debug(`test client provided, will not publish to 'real' message broker for publish parameters ${StatedREPL.stringify(params)}`);
            this.workflowDispatcher.addBatchToAllSubscribers(type, data);
            return "done";
        }

        const {type:clientType} = clientParams
        if (clientType=== 'kafka') {
            this.publishKafka(params, clientParams);
        } else if(clientType==="pulsar") {
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
            const producer = StatedWorkflow.kafkaClient.producer();

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
            const producer = await StatedWorkflow.pulsarClient.createProducer({
                topic: type,
            });

            try {
                let _data = data;
                if (data._jsonata_lambda === true) {
                    _data = await data.apply(this, []); //data is a function, call it
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

    subscribePulsar(subscriptionParams) {
        const {type, initialPosition = 'earliest', maxConsume = -1} = subscriptionParams;
        this.logger.debug(`pulsar subscribe params ${StatedREPL.stringify(subscriptionParams)}`);
        let consumer, dispatcher;
        //make sure a dispatcher exists for the combination of type and subscriberId
        this.workflowDispatcher.getDispatcher(subscriptionParams);
        // Check if a consumer already exists for the given subscription
        if (StatedWorkflow.consumers.has(type)) {
            this.logger.debug(`pulsar subscriber already started. Bail.`);
            return; //bail, we are already consuming and dispatching this type
        }
        (async () => {
            const consumer = await StatedWorkflow.pulsarClient.subscribe({
                topic: type,
                subscription: type, //we will have only one shared-mode consumer group per message type/topics and we name it after the type of the message
                subscriptionType: 'Shared',
                subscriptionInitialPosition: initialPosition
            });
            // Store the consumer in the map
            StatedWorkflow.consumers.set(type, consumer);
            let data;
            let countdown = maxConsume;
            let resolve;
            this.templateProcessor.setDataChangeCallback('/', async (data, jsonPtr, removed) => {
                if (jsonPtr === '/step0/log/*/args') { //TODO: regexify
                    // TODO: await persist the step
                    resolve();
                }
            });
            while (true) {
                try {
                    data = await consumer.receive();
                    let obj;
                    try {
                        const str = data.getData().toString();
                        obj = JSON.parse(str);
                    } catch (error) {
                        console.error("unable to parse data to json:", error);
                    }
                    this.latch = new Promise((_resolve) => {
                        resolve = _resolve; //we assign our resolve variable that is declared outside this promise so that our onDataChange callbacks can use  it
                    });


                    this.workflowDispatcher.dispatchToAllSubscribers(type, obj);
                    if(countdown && --countdown===0){
                        break;
                    }
                } catch (error) {
                    console.error("Error receiving or dispatching message:", error);
                } finally {
                    if (data !== undefined) {
                        // TODO: add a await of latch
                        await this.latch;
                        consumer.acknowledge(data);
                    }
                }
            }
            this.logger.debug(`closing consumer with params ${StatedREPL.stringify(subscriptionParams)}`);
            await consumer.close()
        })();
    }

    async subscribeKafka(subscriptionParams) {
        const { type, initialOffset = 'earliest', maxConsume = -1 } = subscriptionParams;
        this.logger.debug(`Kafka subscribe params ${StatedREPL.stringify(subscriptionParams)} with clientParams ${StatedREPL.stringify(clientParams)}`);

        // Make sure a dispatcher exists for the combination of type and subscriberId
        this.workflowDispatcher.getDispatcher(subscriptionParams);
    
        // Check if a consumer already exists for the given subscription
        if (StatedWorkflow.consumers.has(type)) {
            this.logger.debug(`Kafka subscriber already started. Bail.`);
            return; // Bail, we are already consuming and dispatching this type
        }
    
        const consumer = StatedWorkflow.kafkaClient.consumer({ groupId: type });
    
        try {
            await consumer.connect();
            await consumer.subscribe({ topic: type, fromBeginning: true });
  
        } catch (e) {
            this.logger.debug(`Kafka subscriber - failed, e: ${e}`);
        }
        this.logger.debug(`Kafka subscriber - subscribed.`);
    
        // Store the consumer in the map
        StatedWorkflow.consumers.set(type, consumer);
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

        const {testData, client:clientParams={type:'test'}} = subscriptionParams;
        const {type:clientType} = clientParams;

        if (testData !== undefined) {
            if(testData !== undefined){
                this.logger.debug(`No 'real' subscription created because testData provided for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
                const dispatcher = this.workflowDispatcher.getDispatcher(subscriptionParams);
                await dispatcher.addBatch(testData);
                await dispatcher.drainBatch(); // in test mode we wanna actually wait for all the test events to process
                return;
            }
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
        }else{
            throw new Error(`unsupported client.type in ${StatedREPL.stringify(subscriptionParams)}`);
        }
        return `listening clientType=${clientType} ... `
    }

    onHttp(subscriptionParams) {
        StatedWorkflow.app.all('*', (req, res) => {
            // Push the request and response objects to the dispatch queue to be handled by callback
            this.workflowDispatcher.addToQueue({req, res});
        });

        StatedWorkflow.app.listen(StatedWorkflow.port, () => {
            console.log(`Server started on http://localhost:${StatedWorkflow.port}`);
        });

        return "listening http ..."

    }

    async serialGenerator(metaInf, tp) {
        return async (input, steps, context) => {

            const resolvedJsonPointers = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp, 'serial'); //fixme todo we should avoid doing this for every jsonata evaluation
            TemplateUtils.validateStepPointers(resolvedJsonPointers, steps, metaInf, 'serial');

            return this.serial(input, steps, context, resolvedJsonPointers, tp);
        }
    }

    async serial(input, stepJsons, context={}, resolvedJsonPointers = {}, tp = undefined) {
        let {workflowInvocation} = context;

        if (workflowInvocation === undefined) {
            workflowInvocation = StatedWorkflow.generateDateAndTimeBasedID();
        }

        let currentInput = input;
        const steps = [];
        for (let i = 0; i < stepJsons.length; i++) {
            if(currentInput !== undefined) {
                const step = new Step(stepJsons[i], StatedWorkflow.persistence, resolvedJsonPointers?.[i], tp);
                steps.push(step);
                currentInput = await this.runStep(workflowInvocation, step, currentInput);
            }
        }

        if (!tp.options.keepLogs) await StatedWorkflow.deleteStepsLogs(workflowInvocation, steps);

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
        for (let i = 0; i < steps.length; i++) {

            await steps[i].deleteLogs(workflowInvocation);
        }
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
        StatedWorkflow.publish(
          {'type': stepRecord.workflowName, 'data': stepRecord},
          {type:'pulsar', params: {serviceUrl: 'pulsar://localhost:6650'}}
        );
    }

    async recoverGenerator(metaInf, tp) {
        let parallelDeps = {};
        return async (step, context) => {
            const resolvedJsonPointers = await TemplateUtils.resolveEachStepToOneLocationInTemplate(metaInf, tp, 'recover'); //fixme todo we should avoid doing this for every jsonata evaluation
            TemplateUtils.validateStepPointers(resolvedJsonPointers, [step], metaInf, 'recover');
            return this.recover(step, context, resolvedJsonPointers?.[0], tp);
        }
    }


    async recover(stepJson, context, resolvedJsonPointer, tp){
        let step = new Step(stepJson, StatedWorkflow.persistence, resolvedJsonPointer, tp);
        for  (let workflowInvocation of step.log.getInvocations()){
            await this.runStep(workflowInvocation, step);
        }
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

    static async executeStep(step, input, currentLog, stepRecord) {
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

    static finalizeLog(currentLog) {
        currentLog.info.end = new Date().getTime();
        if (currentLog.info.status !== 'failed') {
            currentLog.info.status = 'succeeded';
        }
    }

    static ensureRetention(workflowLogs) {
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

    // async workflow(input, steps, options={}) {
    //     const {name: workflowName, log} = options;
    //     let {id} = options;
    //
    //     if (log === undefined) {
    //         throw new Error('log is missing from options');
    //     }
    //
    //     if (id === undefined) {
    //         id = StatedWorkflow.generateUniqueId();
    //         options.id = id;
    //     }
    //
    //     StatedWorkflow.initializeLog(log, workflowName, id);
    //
    //     let currentInput = input;
    //     let serialOrdinal = 0;
    //     for (let step of steps) {
    //         const stepRecord = {invocationId: id, workflowName, stepName: step.name, serialOrdinal, branchType:"SERIAL"};
    //         currentInput = await StatedWorkflow.executeStep(step, currentInput, log[workflowName][id], stepRecord);
    //         serialOrdinal++;
    //         if (step.next) this.workflow(currentInput, step.next, options);
    //     }
    //
    //     StatedWorkflow.finalizeLog(log[workflowName][id]);
    //     StatedWorkflow.ensureRetention(log[workflowName]);
    //
    //     return currentInput;
    // }
}
