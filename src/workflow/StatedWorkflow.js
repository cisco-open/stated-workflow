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
import {createPersistence} from "./Persistence.js";
import DependencyFinder from "stated-js/dist/src/DependencyFinder.js";
import jp from "stated-js/dist/src/JsonPointer.js";

//This class is a wrapper around the TemplateProcessor class that provides workflow functionality
export class StatedWorkflow {
    // static express = require('express');
    static app = express();
    static port = 8080;
    static logger = winston.createLogger({
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

    static persistence = new createPersistence();

    static FUNCTIONS = {
        "id": StatedWorkflow.generateDateAndTimeBasedID.bind(this),
        // "serial": StatedWorkflow.serial.bind(this),
        "parallel": StatedWorkflow.parallel.bind(this),
        "onHttp": StatedWorkflow.onHttp.bind(this),
        "subscribe": StatedWorkflow.subscribe.bind(this),
        "publish": StatedWorkflow.publish.bind(this),
        "recover": StatedWorkflow.recover.bind(this),
        "logFunctionInvocation": StatedWorkflow.logFunctionInvocation.bind(this),
        //"workflow": StatedWorkflow.workflow.bind(this)
    };

    constructor(templateProcessor, persistence ){
        this.templateProcessor = templateProcessor;
        this.persistence = persistence;
    }

    // this method returns a StatedWorkflow instance with TemplateProcesor with the default functions and Stated Workflow
    // functions. It also initializes persistence store, and set generator functions.
    static async newWorkflow(template, persistenceType = 'noop') {
        const persistence = new createPersistence({persistenceType: persistenceType});
        await persistence.init();
        // TODO: fix CliCore.setupContext to respect context passed to the constructor
        // const tp = new TemplateProcessor(template, {...TemplateProcessor.DEFAULT_FUNCTIONS, ...StatedWorkflow.FUNCTIONS});
        TemplateProcessor.DEFAULT_FUNCTIONS = {...TemplateProcessor.DEFAULT_FUNCTIONS, ...StatedWorkflow.FUNCTIONS};
        const tp = new TemplateProcessor(template);
        tp.functionGenerators.set("serial", StatedWorkflow.serialGenerator);
        tp.logLevel = logLevel.ERROR; //log level must be ERROR by default. Do not commit code that sets this to DEBUG as a default
        tp.onInitialize = WorkflowDispatcher.clear; //must remove all subscribers when template reinitialized
        await tp.initialize();
        return new StatedWorkflow(tp, persistence);
    }

    static async logFunctionInvocation(stage, args, result, error = null, log) {
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

    static async subscribe(subscribeOptions) {
        const {source} = subscribeOptions;
        StatedWorkflow.logger.debug(`subscribing ${StatedREPL.stringify(source)}`);
        if (source === 'http') {
            return StatedWorkflow.onHttp(subscribeOptions);
        }
        if (source === 'cloudEvent') {
            return StatedWorkflow.subscribeCloudEvent(subscribeOptions);
        }
        if (!source) {
            throw new Error("Subscribe source not set");
        }
        throw new Error(`Unknown subscribe source ${source}`);
    }

    static ensureClient(params) {
        if (!params || params.type == 'pulsar') {
            StatedWorkflow.createPulsarClient(params);
        } else if (params.type == 'kafka') {
            StatedWorkflow.createKafkaClient(params);
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

    static createPulsarClient(params) {
        if (StatedWorkflow.pulsarClient) return;
    
        StatedWorkflow.pulsarClient = new Pulsar.Client({
            serviceUrl: 'pulsar://localhost:6650',
        });
    }
    static createKafkaClient(params) {
        if (StatedWorkflow.kafkaClient) return;

        StatedWorkflow.kafkaClient = new Kafka({
            clientId: 'workflow-kafka-client',
            brokers: [`${StatedWorkflow.host}:9092`],
            logLevel: logLevel.DEBUG,
        });/**/
    }

    static publish(params) {
        StatedWorkflow.logger.debug(`publish params ${StatedREPL.stringify(params)} }`);

        const {data, type, client:clientParams={}} = params;
        if (clientParams  && clientParams.type === 'test') {
            this.logger.debug(`test client provided, will not publish to 'real' message broker for publish parameters ${StatedREPL.stringify(params)}`);
            WorkflowDispatcher.addBatchToAllSubscribers(type, data);
            return "done";
        }

        const {type:clientType} = clientParams
        if (clientType=== 'kafka') {
            StatedWorkflow.publishKafka(params, clientParams);
        } else if(clientType==="pulsar") {
            StatedWorkflow.publishPulsar(params, clientParams);
        }else{
            throw new Error(`Unsupported clientType: ${clientType}`);
        }
        return "done";
    }

    static publishKafka(params, clientParams) {
        StatedWorkflow.logger.debug(`kafka publish params ${StatedREPL.stringify(params)}`);
        const {type, data} = params;

        (async () => {
            const producer = StatedWorkflow.kafkaClient.producer();

            await producer.connect();

            try {
                let _data = data;
                if (data._jsonata_lambda === true) {
                    _data = await data.apply(this, []); //data is a function, call it
                }
                StatedWorkflow.logger.debug(`kafka producer sending ${StatedREPL.stringify(_data)} to ${type}`);

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

    static publishPulsar(params, clientParams) {
        StatedWorkflow.logger.debug(`pulsar publish params ${StatedREPL.stringify(params)}`);
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
                StatedWorkflow.logger.debug(`pulsar producer sending ${StatedREPL.stringify(_data)}`);
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

    static subscribePulsar(subscriptionParams) {
        const {type, initialPosition = 'earliest', maxConsume = -1} = subscriptionParams;
        StatedWorkflow.logger.debug(`pulsar subscribe params ${StatedREPL.stringify(subscriptionParams)}`);
        let consumer, dispatcher;
        //make sure a dispatcher exists for the combination of type and subscriberId
        WorkflowDispatcher.getDispatcher(subscriptionParams);
        // Check if a consumer already exists for the given subscription
        if (StatedWorkflow.consumers.has(type)) {
            StatedWorkflow.logger.debug(`pulsar subscriber already started. Bail.`);
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
                    WorkflowDispatcher.dispatchToAllSubscribers(type, obj);
                    if(countdown && --countdown===0){
                        break;
                    }
                } catch (error) {
                    console.error("Error receiving or dispatching message:", error);
                } finally {
                    if (data !== undefined) {
                        consumer.acknowledge(data);
                    }
                }
            }
            StatedWorkflow.logger.debug(`closing consumer with params ${StatedREPL.stringify(subscriptionParams)}`);
            await consumer.close()
        })();
    }

    static async subscribeKafka(subscriptionParams) {
        const { type, initialOffset = 'earliest', maxConsume = -1 } = subscriptionParams;
        StatedWorkflow.logger.debug(`Kafka subscribe params ${StatedREPL.stringify(subscriptionParams)} with clientParams ${StatedREPL.stringify(clientParams)}`);

        // Make sure a dispatcher exists for the combination of type and subscriberId
        WorkflowDispatcher.getDispatcher(subscriptionParams);
    
        // Check if a consumer already exists for the given subscription
        if (StatedWorkflow.consumers.has(type)) {
            StatedWorkflow.logger.debug(`Kafka subscriber already started. Bail.`);
            return; // Bail, we are already consuming and dispatching this type
        }
    
        const consumer = StatedWorkflow.kafkaClient.consumer({ groupId: type });
    
        try {
            await consumer.connect();
            await consumer.subscribe({ topic: type, fromBeginning: true });
  
        } catch (e) {
            StatedWorkflow.logger.debug(`Kafka subscriber - failed, e: ${e}`);
        }
        StatedWorkflow.logger.debug(`Kafka subscriber - subscribed.`);
    
        // Store the consumer in the map
        StatedWorkflow.consumers.set(type, consumer);
        let countdown = maxConsume;
    
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                let data;
                StatedWorkflow.logger.debug(`Kafka subscriber got ${message} from ${topic}:${partition}.`);
                try {
                    const str = message.value.toString();
                    data = JSON.parse(str);
                } catch (error) {
                    console.error("Unable to parse data to JSON:", error);
                }
    
                WorkflowDispatcher.dispatchToAllSubscribers(type, data);
    
                if (countdown && --countdown === 0) {
                    // Disconnect the consumer if maxConsume messages have been processed
                    await consumer.disconnect();
                }
            }
        });
    }

    static async subscribeCloudEvent(subscriptionParams) {

        const {testData, client:clientParams={type:'test'}} = subscriptionParams;
        const {type:clientType} = clientParams;
        if (testData !== undefined) {
            if(testData !== undefined){
                this.logger.debug(`No 'real' subscription created because testData provided for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
                const dispatcher = WorkflowDispatcher.getDispatcher(subscriptionParams);
                dispatcher.addBatch(testData);
                await dispatcher.drainBatch(); // in test mode we wanna actually wait for all the test events to process
                return;
            }
        }
        if(clientType==='test'){
            this.logger.debug(`No 'real' subscription created because client.type='test' set for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
            const dispatcher = WorkflowDispatcher.getDispatcher(subscriptionParams); // we need a dispatched even if no real message bus
        }else if (clientType === 'kafka') {
            this.logger.debug(`subscribing to kafka using ${clientParams}`)
            StatedWorkflow.createKafkaClient(clientParams);
            StatedWorkflow.subscribeKafka(subscriptionParams);
        }else if(clientType === 'pulsar') {
            this.logger.debug(`subscribing to pulsar (default) using ${clientParams}`)
            StatedWorkflow.createPulsarClient(clientParams);
            StatedWorkflow.subscribePulsar(subscriptionParams);
        }else{
            throw new Error(`unsupported client.type in ${StatedREPL.stringify(subscriptionParams)}`);
        }
        return `listening clientType=${clientType} ... `
    }

    static onHttp(subscriptionParams) {
        const dispatcher = new WorkflowDispatcher(
            subscriptionParams
        );

        StatedWorkflow.app.all('*', (req, res) => {
            // Push the request and response objects to the dispatch queue to be handled by callback
            dispatcher.addToQueue({req, res});
        });

        StatedWorkflow.app.listen(StatedWorkflow.port, () => {
            console.log(`Server started on http://localhost:${StatedWorkflow.port}`);
        });

        return "listening http ..."

    }

    /**
     *
     * @param resolvedJsonPointers
     * @param steps
     * @param metaInf
     */
    static validateStepPointers(resolvedJsonPointers, steps, metaInf) {
        if (resolvedJsonPointers.length !== steps.length) {
            throw new Error(`At ${metaInf.jsonPointer__},
            '$serial(...)' was passed ${steps.length} steps, but found ${resolvedJsonPointers.length} step locations in the document.`);
        }
    }

    static async resolveEachStepToOneLocationInTemplate(metaInf, tp){
        const jsonPointers = await StatedWorkflow.findSerialStepDependenciesInTemplate(metaInf);
        const resolvedPointers = StatedWorkflow.drillIntoStepArrays(jsonPointers, tp);
        return resolvedPointers;
    }

    static async findSerialStepDependenciesInTemplate(metaInf){
        const ast = metaInf.compiledExpr__.ast();
        let depFinder = new DependencyFinder(ast);
        depFinder = await depFinder.withAstFilterExpression("**[procedure.value='serial']");
        if(depFinder.ast){
            return depFinder.findDependencies().map(jp.compile)
        }
        return [];
    }

    /**
     * make sure that if the serial function has numSteps, that have located storage for each of the steps in the
     * document.
     * @param jsonPointers
     */
    static drillIntoStepArrays(jsonPointers=[], tp){
        const resolved = [];
        jsonPointers.forEach(p=>{
            if(!jp.has(tp.output, p)){
                throw new Error(`Cannot find ${p} in the template`);
            }
            const loc = jp.get(tp.output, p);
            //if serial has a dependency on an array, for example $serial(stepsArray) or
            // $serial(step1~>append(otherStepsArray)), the we drill into the array and mine out json pointers
            // to each element of the array
            if(Array.isArray(loc)){
                for(let i=0;i<loc.length;i++){
                    resolved.push(p+"/"+i);
                }
            }else{
                resolved.push(p);
            }

        });
        return resolved;

    }

    static async serialGenerator(metaInf, tp) {
        let serialDeps = {};
        return async (input, steps, context) => {

            const resolvedJsonPointers = await StatedWorkflow.resolveEachStepToOneLocationInTemplate(metaInf, tp); //fixme todo we should avoid doing this for every jsonata evaluation
            StatedWorkflow.validateStepPointers(resolvedJsonPointers, steps, metaInf);

            return serial(input, steps, context, resolvedJsonPointers, tp);
        }
    }

    static async serial(input, steps, context={}, resolvedJsonPointers = {}, tp = undefined) {
        let {workflowInvocation} = context;

        if (workflowInvocation === undefined) {
            workflowInvocation = StatedWorkflow.generateDateAndTimeBasedID();
        }

        let currentInput = input;
        for (let i = 0; i < steps.length; i++) {
            const stepJson = steps[i];
            if(currentInput !== undefined) {
                currentInput = await StatedWorkflow.runStep(workflowInvocation, stepJson, currentInput, resolvedJsonPointers?.[i], tp);
            }
        }

        return currentInput;
    }

    // This function is called by the template processor to execute an array of steps in parallel
    static async parallel(input, steps, context = {}) {
        let {workflowInvocation} = context;

        if (workflowInvocation === undefined) {
            workflowInvocation = this.generateDateAndTimeBasedID();
        }

        let promises = [];
        for (let stepJson of steps) {
            const promise = StatedWorkflow.runStep(workflowInvocation, stepJson, input)
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

        return await Promise.all(promises);
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

    static async recover(stepJson){
        const stepLog = new StepLog(stepJson);
        for  (let workflowInvocation of stepLog.getInvocations()){
            await this.runStep(workflowInvocation, stepJson);
        }
    }

    static async runStep(workflowInvocation, stepJson, input, stepJsonPtr, tp){

        const stepLog = new StepLog(stepJson);
        const {instruction, event:loggedEvent} = stepLog.getCourseOfAction(workflowInvocation);
        if(instruction === "START"){
            const step = new Step(stepJson, StatedWorkflow.persistence, stepJsonPtr, tp);
            return await step.run(workflowInvocation, input);
        }else if (instruction === "RESTART"){
            const step = new Step(stepJson, StatedWorkflow.persistence, stepJsonPtr, tp);
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

    static async workflow(input, steps, options={}) {
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
            currentInput = await StatedWorkflow.executeStep(step, currentInput, log[workflowName][id], stepRecord);
            serialOrdinal++;
            if (step.next) StatedWorkflow.workflow(currentInput, step.next, options);
        }

        StatedWorkflow.finalizeLog(log[workflowName][id]);
        StatedWorkflow.ensureRetention(log[workflowName]);

        return currentInput;
    }
}


export const id = StatedWorkflow.generateDateAndTimeBasedID;
export const serial = StatedWorkflow.serial;
export const parallel = StatedWorkflow.parallel;
export const onHttp = StatedWorkflow.onHttp;
export const subscribe = StatedWorkflow.subscribe;
export const publish = StatedWorkflow.publish;
export const logFunctionInvocation = StatedWorkflow.logFunctionInvocation;
export const workflow = StatedWorkflow.workflow;
export const serialGenerator = StatedWorkflow.serialGenerator;