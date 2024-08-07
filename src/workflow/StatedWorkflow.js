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
import {WorkflowMetrics} from "./WorkflowMeters.js";
import express from 'express';
import Pulsar from 'pulsar-client';
import winston from "winston";
import {WorkflowDispatcher} from "./WorkflowDispatcher.js";
import {TemplateUtils} from "./utils/TemplateUtils.js";
import {createStorage} from "./Storage.js";
import {Delay} from "../test/TestTools.js"
import {SnapshotManager} from "./SnapshotManager.js";
import {PulsarClientMock} from "../test/PulsarMock.js";
import {SchemaRegistry} from "@kafkajs/confluent-schema-registry";
import LZ4 from "kafkajs-lz4";

// workaround for kafkajs issue
import kafkaPkg from 'kafkajs';
const {Kafka, KafkaConfig, CompressionTypes, CompressionCodecs, logLevel} = kafkaPkg;



//This class is a wrapper around the TemplateProcessor class that provides workflow functionality
export class StatedWorkflow {
    // static express = require('express');

    constructor(template, context, workflowContext = {}, storage){
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

        this.workflowContext = workflowContext;

        // TODO: parameterize
        this.host = process.env.HOST_IP


        this.customRestMetrics = {
            workflowInvocations: 0,
            workflowInvocationSuccesses: 0,
            workflowInvocationFailures: 0,
            // For latency, you might want to keep individual records or a summary
            workflowInvocationLatencies: [],
        };

        this.snapshotOpts = context.snapshot || {storage: 'fs', basePath: './.state'}
        this.storage = storage || createStorage(this.snapshotOpts);
        this.snapshotManager = new SnapshotManager(this.snapshotOpts, this.storage);
        this.consumers = new Map(); //key is type, value is pulsar consumer
        this.dispatchers = new Map(); //key is type, value Set of WorkflowDispatcher

        // TODO: fix CliCore.setupContext to respect context passed to the constructor
        // const tp = new TemplateProcessor(template, {...TemplateProcessor.DEFAULT_FUNCTIONS, ...StatedWorkflow.FUNCTIONS});
        TemplateProcessor.DEFAULT_FUNCTIONS = {...TemplateProcessor.DEFAULT_FUNCTIONS, ...{
                "id": StatedWorkflow.generateDateAndTimeBasedID.bind(this),
                "onHttp": this.onHttp.bind(this),
                "publish": this.publish.bind(this),
                "logFunctionInvocation": this.logFunctionInvocation.bind(this),
                "sleep": Delay.start,
                "ack": this.ack.bind(this),
            }
        };
        this.templateProcessor = new TemplateProcessor(template, context);
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
                        await this.snapshotManager.write(this.templateProcessor, workflowContext.id);
                        // we can acknowledge callbacks after persisting templateProcessor
                        if (workflowContext.ackOnSnapshot === true && this.workflowDispatcher) await this.workflowDispatcher.acknowledgeCallbacks();
                        this.hasChanged = false; //changeListener will alter this if the template changes so we are not permanently blocking snapshots
                    }
                }, seconds*1000)
            },
            //---  listen for changes so we can avoid snapshotting if nothing changed ---
            ()=>{
                this.templateProcessor.setDataChangeCallback("/", this.changeListener);
            },
        ];
        if (this.workflowContext.cbmon !== undefined) {
            this.templateProcessor.initCallbacks.push(
                ()=>{
                    this.templateProcessor.setDataChangeCallback("/", this.workflowContext.cbmon);
                });
        }
        //add a named initializer for stated-workflows that runs all of the stated-workflows init callbacks
        this.templateProcessor.onInitialize.set("stated-workflows",()=>this.templateProcessor.initCallbacks.map(cb=>cb())); //call all initCallbacks
    }

    // this method returns a StatedWorkflow instance with TemplateProcesor with the default functions and Stated Workflow
    // functions. It also initializes persistence store, and set generator functions.
    static async newWorkflow(template, context = {}, workflowContext) {
        return new StatedWorkflow(template, context, workflowContext);
    }

    //
    async ack(data) {
        this.templateProcessor.logger.debug(`acknowledging data: ${StatedREPL.stringify(data)}`);
        const dispatcherType = this.workflowDispatcher.dispatchers.get(data.type);
        for (let t of dispatcherType) {
            const dispatcher = this.workflowDispatcher.dispatcherObjects.get(t);
            const ackCallback = dispatcher.dataAckCallbacks?.get(data);
            if (ackCallback) {
                ackCallback(data);
                dispatcher.dataAckCallbacks.delete(data);
            }
            if (dispatcher.active > 0) dispatcher.active--;
            if (dispatcher.waitQueue.length > 0) {
                const next = dispatcher.waitQueue.shift();
                next();
            }
        }

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
        this.logger.debug(StatedREPL.stringify(logMessage));

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

        const {type, client:clientParams={}} = params;

        if(!this.workflowDispatcher) {
            this.workflowDispatcher = new WorkflowDispatcher(params);
        }

        if (clientParams.type === 'test' && clientParams.data !== undefined) {
            this.logger.debug(`test client provided, will not publish to 'real' message broker for publish parameters ${StatedREPL.stringify(params)}`);
            if (clientParams.explicitAck) {
                await this.workflowDispatcher.addBatchToAllSubscribersWithAck(type, clientParams);
            } else {
                await this.workflowDispatcher.addBatchToAllSubscribers(type, clientParams.data);
            }
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
                this.logger.error(`Error publishing to Kafka: ${err}`);
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

    async subscribe(subscribeOptions, resolvedJsonPointers = [], tp = undefined) {
        const {source} = subscribeOptions;
        this.logger.debug(`subscribing ${StatedREPL.stringify(source)}`);

        const subscribeOptionsJsonPointer = Array.isArray(resolvedJsonPointers) && resolvedJsonPointers.length > 0 ? resolvedJsonPointers[0] : undefined;
        if (tp && tp.out(subscribeOptionsJsonPointer) !== undefined) {
            subscribeOptions = tp.out(subscribeOptionsJsonPointer);
        }
        if(!this.workflowDispatcher) {
            this.workflowDispatcher = new WorkflowDispatcher(subscribeOptions);
        }

        if (source === 'cloudEvent') {
            return this.subscribeCloudEvent(subscribeOptions, subscribeOptionsJsonPointer);
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
            let countdown = maxConsume;

            while (true) {
                try {
                    const message = await consumer.receive();
                    let messageData;
                    try {
                        const messageDataStr = message.getData().toString();
                        messageData = JSON.parse(messageDataStr);
                    } catch (error) {
                        this.templateProcessor.logger.error("unable to parse data to json:", error);
                        // TODO - should we acknowledge the message here?
                        continue;
                    }
                    let resolve;

                    // create a callback to acknowledge the message
                    const dataAckCallback = async () => {
                        const promise =  consumer.acknowledge(message);
                    }

                    // if the dispatchers max parallelism is reached this loop should block, which is why we await
                    await this.workflowDispatcher.dispatchToAllSubscribers(type, messageData, dataAckCallback);
                    if(countdown && --countdown===0){
                        break;
                    }
                } catch (error) {
                    this.templateProcessor.logger.error("Error receiving or dispatching message:", error);
                } finally {
                    if (this.pulsarClient === undefined) {
                        break;
                    }
                }
            }
            this.logger.debug(`closing consumer with params ${StatedREPL.stringify(subscriptionParams)}`);
            try {
                await consumer.close();
            } catch (error) {
                this.templateProcessor.logger.error("Error closing consumer:", error);
            }
        })();
    }

    // this function provide access to COP CloudEvent sources when deployed as a Zodiac function
    subscribeCOPKafka(subscriptionParams) {
        const {type, initialOffset = 'earliest', maxConsume = -1} = subscriptionParams;

        //make sure a dispatcher exists for the combination of type and subscriberId
        this.workflowDispatcher.getDispatcher(subscriptionParams);

        // TODO: - validate
        const kafkaParams = subscriptionParams.client.params;
        kafkaParams.sasl.password = process.env.KAFKA_SASL_PASSWORD;

        CompressionCodecs[CompressionTypes.LZ4] = new LZ4().codec;
        this.kafkaClient = new Kafka(kafkaParams);

        // TODO: SCHEMA_REGISTRY_URL should be coming form the zodiac function
        const registry = new SchemaRegistry({ host: subscriptionParams.client.schemaRegistryUrl });

        // TODO: parameterize
        const defaultConsumerGroup = 'alerting.sys.stated-workflow';

        // TODO: merge the default client params with the allowed client params from the subscriptionParams
        const consumer = this.kafkaClient.consumer({ groupId: defaultConsumerGroup });

        (async () => {try {
            await consumer.connect();
            await consumer.subscribe({ topic: type, fromBeginning: true });

        } catch (e) {
            this.logger.debug(`Kafka subscriber - failed, e: ${e}`);
        }
        this.logger.debug(`Kafka subscriber - subscribed.`);

        this.consumers.set(type, consumer);
        let countdown = maxConsume;

        // main consumer processor
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                let data;
                this.logger.debug(`Kafka subscriber got ${message} from ${topic}:${partition}.`);
                try {
                    data = await registry.decode(message.value);
                } catch (error) {
                    this.logger.error("Unable to parse data to JSON:", error);
                }
                const ackFunction = async (data2ack) => {
                    this.logger.log(`acknowledging data: ${StatedREPL.stringify(data)} with data2ack: ${StatedREPL.stringify(data2ack)}`);
                    // TODO: add ack logic
                }
                await this.workflowDispatcher.dispatchToAllSubscribers(type, data, ackFunction);

                if (countdown && --countdown === 0) {
                    // Disconnect the consumer if maxConsume messages have been processed
                    await consumer.disconnect();
                }
            }
        })})();
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
                    this.logger.error("Unable to parse data to JSON:", error);
                }

                this.workflowDispatcher.dispatchToAllSubscribers(type, data, dataAckCallback);

    
                if (countdown && --countdown === 0) {
                    // Disconnect the consumer if maxConsume messages have been processed
                    await consumer.disconnect();
                }
            }
        });
    }

    // subscribeTest is a test function that is used to test the workflow without a real subscription
    //
    // it can operate in two modes
    // 1. If client.testData is provided, it will be added to the dispatcher and awaited processing
    // 2. If test publisher is provided, it will be used to publish data to the dispatcher
    // additional configuration:
    // - If client.acks is provided, it will be used to acknowledge the data
    async subscribeTest(subscriptionParams, subscribeParamsJsonPointer) {
        const {client:clientParams = {}} = subscriptionParams;
        let testDataAckFunctionGenerator;
        if (Array.isArray(clientParams.acks)) {
            testDataAckFunctionGenerator = (data) => {
                return (async () => {
                    if (Array.isArray(clientParams.acks)) {
                        this.logger.debug(`acknowledging data: ${StatedREPL.stringify(data)}`);
                        await this.templateProcessor.setData(subscribeParamsJsonPointer + '/client/acks/-',data);
                    }
                }).bind(this);
            };
        }

        this.logger.debug(`No 'real' subscription created because client.type='test' set for subscription params ${StatedREPL.stringify(subscriptionParams)}`);

        const dispatcher = this.workflowDispatcher.getDispatcher(subscriptionParams)
        if (clientParams.explicitAck) {
            this.workflowDispatcher.explicitAck = true; // ensure that the dispatcher knows that we are using explicit acks
        }
        dispatcher.testDataAckFunctionGenerator = testDataAckFunctionGenerator;

        // testData may contain some canned data to be used without a publisher.
        if (clientParams.type === "test" && clientParams.testData !== undefined) {
            this.logger.debug(`No 'real' subscription created because testData provided for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
            await dispatcher.addBatch(clientParams.testData);
            await dispatcher.drainBatch(); // in test mode we wanna actually wait for all the test events to process
        }
    }

    async subscribeCloudEvent(subscriptionParams, subscribeParamsJsonPointer) {
        const {client:clientParams={type:'test'}, to} = subscriptionParams;
        //to-do fixme do validation of subscriptionParams
        if(!to){
            throw new Error(`mandatory 'to' field was not provided for '${subscriptionParams.subscriberId}'`);
        }else if(!to._stated_function__ && !to.function?._stated_function__){
            throw new Error(`'to' parameter for '${subscriptionParams.subscriberId}' is neither a function or a step object with a function field`);
        }

        const {type:clientType} = clientParams;

        if(clientParams.type === "test"){
            await this.subscribeTest(subscriptionParams, subscribeParamsJsonPointer);
        } else if (clientType === 'dispatcher') {
            this.templateProcessor.logger.debug(`No 'real' subscription created because client.type='dispatcher' set for subscription params ${StatedREPL.stringify(subscriptionParams)}`);
            this.workflowDispatcher.getDispatcher(subscriptionParams);
        } else if (clientType === 'http') {
            this.onHttp(subscriptionParams);
        } else if (clientType === 'cop') {
            this.templateProcessor.logger.debug(`subscribing to cop cloud event sources ${clientParams}`)
            this.subscribeCOPKafka(subscriptionParams);
        }else if (clientType === 'kafka') {
            this.templateProcessor.logger.debug(`subscribing to kafka using ${clientParams}`)
            this.createKafkaClient(clientParams);
            this.subscribeKafka(subscriptionParams);
        }else if(clientType === 'pulsar') {
            this.templateProcessor.logger.debug(`subscribing to pulsar (default) using ${clientParams}`)
            this.createPulsarClient(clientParams);
            this.subscribePulsar(subscriptionParams);
        }else if(clientType === 'pulsarMock'){
            this.templateProcessor.logger.debug(`subscribing to pulsarMock using ${clientParams}`)
            this.createPulsarClientMock(clientParams);
            this.subscribePulsar(subscriptionParams);
        }else{
            throw new Error(`unsupported client.type in ${StatedREPL.stringify(subscriptionParams)}`);
        }
        return `listening clientType=${clientType} ... `
    }

    onHttp(subscriptionParams) {

        this.port = subscriptionParams.port ? subscriptionParams.port : 8080;
        this.app = express();
        this.app.use(express.json());
        this.app.listen(this.port, () => {
            this.templateProcessor.logger.log(`Server started on http://localhost:${StatedWorkflow.port}`);
        });
        // Path = /workflow/:workflowId
        // workflowIdToWorkflowDispatcher
        if (subscriptionParams.type === undefined) subscriptionParams.type = 'default-type';
        if (subscriptionParams.subscriberId === undefined) subscriptionParams.subscriberId = 'default-subscriberId';
        const dispatcher = this.workflowDispatcher.getDispatcher(subscriptionParams);
        this.app.all('*', async (req, res) => {
            this.templateProcessor.logger.debug("Received HTTP request: ", req.body, req.method, req.url);
            // Push the request and response objects to the dispatch queue to be handled by callback
            await dispatcher.addToQueue(req.body, ()=>{ res.send("sucess")});
        });

        return "listening http ..."

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

    async close() {

        if (this.pulsarClient !== undefined) {
            try {
                await this.pulsarClient.close();
            } catch (error) {
                this.logger.error("Error closing pulsar client:", error);
            }
            this.pulsarClient = undefined;
        }

        this.templateProcessor.removeDataChangeCallback(this.changeListener);

        // TODO: check if consumers can be closed without client

        try {
            if (this.workflowDispatcher) await this.workflowDispatcher.clear();
            if (this.templateProcessor) await this.templateProcessor.close();

        } catch (error) {
            this.logger.error("Error closing workflow dispatcher:", error);
        }
        clearInterval(this.snapshotInterval);
    }
}
