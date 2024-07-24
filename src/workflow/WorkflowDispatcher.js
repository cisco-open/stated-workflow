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
import {StatedWorkflow} from "./StatedWorkflow.js";
import jp from "stated-js/dist/src/JsonPointer.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";

// This class is used to add events to a queue and dispatch them to one or more subscribed workflow function with the
// given parallelism. Tracks the number of active events and the number of events in the queue.
export class WorkflowDispatcher {
    constructor(subscribeParams, testDataAckFunctionGenerator) {
        const {to: workflowFunction, parallelism, type, subscriberId} = subscribeParams;
        this.subscribeParams = subscribeParams;
        this.testDataAckFunctionGenerator = testDataAckFunctionGenerator;
        this.workflowFunction = workflowFunction;
        this.parallelism = parallelism || 1;
        this.subscriberId = subscriberId;
        this.type = type;
        this.explicitAck = subscribeParams.client?.explicitAck; // if true, requires using explicit ack function
        this.queue = [];
        this.dataAckCallbacks = new Map();
        this.waitQueue = [];
        this.active = 0;
        this.promises = [];
        this.batchMode = false;
        this.batchCount = 0; // Counter to keep track of items in the batch
        this.dispatchers = new Map();       // key is type, value is a Set of keys
        this.dispatcherObjects = new Map(); // key is composite key, value is WorkflowDispatcher object
    }

    clear() {
        this.dispatchers = new Map();       // key is type, value is a Set of keys
        this.dispatcherObjects = new Map(); // key is composite key, value is WorkflowDispatcher object
    }
    _generateKey(type, subscriberId) {
        return `${type}-${subscriberId}`;
    }

    _addDispatcher(dispatcher) {
        if (!this.dispatchers.has(dispatcher.type)) {
            this.dispatchers.set(dispatcher.type, new Set());
        }
        const key = dispatcher._getKey();
        this.dispatchers.get(dispatcher.type).add(key);
        this.dispatcherObjects.set(key, dispatcher);
    }

    getDispatcher(subscriptionParams, ackFunctionGenerator) {
        const {type, subscriberId} = subscriptionParams;
        const key = this._generateKey(type, subscriberId);
        if (!this.dispatcherObjects.has(key)) {
            const newDispatcher = new WorkflowDispatcher(subscriptionParams, ackFunctionGenerator);
            this._addDispatcher(newDispatcher);
        }
        return this.dispatcherObjects.get(key);
    }

    async addBatchToAllSubscribers(type, testData) {
        const keysSet = this.dispatchers.get(type);
        if (keysSet) {
            for (let key of keysSet) {
                const dispatcher = this.dispatcherObjects.get(key);
                dispatcher.addBatch(testData); // You can pass the actual data you want to dispatch here
            }
        } else {
            console.log(`No subscribers found for type ${type}`);
        }
    }

    // this function is only used from test publisher
    async addBatchToAllSubscribersWithAck(type, clientParams = {}, ackFunc) {
        const promises = [];
        for (let data of clientParams.data) {
            type = data.type || type;
            const keysSet = this.dispatchers.get(type);
            if (keysSet) {
                for (let key of keysSet) {
                    const dispatcher = this.dispatcherObjects.get(key);
                    if (Array.isArray(clientParams.acks) && clientParams.acks.includes(data)) {
                        console.debug(`Skipping already acknowledged test data: ${StatedREPL.stringify(data)}`);
                    } else {
                        promises.push(dispatcher.addToQueue(data, ackFunc));
                    }
                }
            } else {
                console.log(`No subscribers found for type ${type}`);
            }
        }
        try {
            console.log("Waiting for all promises to resolve");
            return await Promise.all(promises);
        } catch (error) {
            console.error("Error processing events: ", error);
            return {"status": "failure", "error": error.message};
        }
    }

    async dispatchToAllSubscribers(type, data, dataAckCallback) {
        const keysSet = this.dispatchers.get(type);
        if (keysSet) {
            for (let key of keysSet) {
                const dispatcher = this.dispatcherObjects.get(key);
                await dispatcher.addToQueue(data, dataAckCallback); // You can pass the actual data you want to dispatch here
            }
        } else {
            StatedWorkflow.logger.warn(`No subscribers found for type ${type}`);
        }
    }

    _getKey() {
        return this._generateKey(this.type, this.subscriberId);
    }

    _dispatch() {
        while (this.active < this.parallelism && this.queue.length > 0) {
            this.active++;
            const eventData = this.queue.shift();
            if(this.workflowFunction === undefined){
                console.error(`undefined 'to' function for subscriberId=${this.subscriberId}`)
            }
            let promise;
            if (this.workflowFunction && this.workflowFunction.function) {
                promise = this.workflowFunction.function(eventData);
            } else {
                promise = this.workflowFunction(eventData);
            }
            promise.then(
                (result) => {
                    if (this.explicitAck) {
                        // explicitAck means that the workflow will invoke ack() function to acknowledge the invocation
                        console.log(`ExplicitAck is enabled, skipping dataAckCallback for ${StatedREPL.stringify(eventData)} in _dispatch`);
                    } else if (this.dataAckCallbacks.get(eventData)) {
                        const dataAckCallback = this.dataAckCallbacks.get(eventData);

                        // promisify the callback function, in case it is a sync one
                        const callbackPromise = Promise.resolve().then(() => {
                            dataAckCallback(eventData, result);
                        });
                        callbackPromise.catch(error => {
                            console.error(`Error calling dataAckCallback ${dataAckCallback}, error: ${error}`);
                        });

                        delete this.dataAckCallbacks.get(eventData);
                    }
                },
                (error) => {
                    console.error(`Error executing workflow: ${error} for event data: ${StatedREPL.stringify(eventData)}`);
                    if (this.explicitAck) {
                        // explicitAck means that the workflow will invoke ack() function to acknowledge the invocation
                        console.log(`ExplicitAck is enabled, skipping dataAckCallback for ${StatedREPL.stringify(eventData)} in _dispatch`);
                    } else if (this.dataAckCallbacks.get(eventData)) {
                        const dataAckCallback = this.dataAckCallbacks.get(eventData);

                        // promisify the callback function, in case it is a sync one
                        const callbackPromise = Promise.resolve().then(() => {
                            dataAckCallback(eventData, error);
                        });
                        callbackPromise.catch(error => {
                            console.error(`Error calling dataAckCallback ${dataAckCallback}, error: ${error}`);
                        });

                        delete this.dataAckCallbacks.get(eventData);
                    }
                }

            ).catch(error => {
                console.error("Error executing workflow:", error);
            }).finally(() => {
                if (!this.explicitAck) {
                    this.active--;
                }
                if (this.batchMode) {
                    this.batchCount--;
                }
                const index = this.promises.indexOf(promise);
                if (index > -1) {
                    this.promises.splice(index, 1);
                }
                this._dispatch();
            });

            this.promises.push(promise);
        }
    }

    _logActivity(key, val) {
        let record;
        const {subscribeParams} = this;
        if(!subscribeParams.logActivity){
            return;
        }
        const {maxLog = 10, subscriberId} = subscribeParams;
        const path = "/activityRecord/"+subscriberId+"/"+key;
        if(!jp.has(subscribeParams, path)){
            record = [];
            jp.set(subscribeParams, path, record);
        }else{
            record = jp.get(subscribeParams, path);
        }
        if (record.push(val) > maxLog) {
            record.shift(); //we keep a history of the active count for 10 values over time
        }
    }

    waitForAck() {
        return new Promise(resolve => {
            this.waitQueue.push(resolve);
        });
    }

    /**
     *
     * @param data - event data to be added to the queue
     * @param dataAckCallback - a callback function to be called when the event data is processe.
     * @returns {Promise<unknown>}
     */
    async addToQueue(data, dataAckCallback) {

        return new Promise(async (resolve, reject) => {
            const tryAddToQueue = async () => {
                this._logActivity("log", {"t": new Date().getTime(), "acivie": this.active, "queue": this.queue.length});
                if (this.active < this.parallelism) {
                    this.queue.push(data);
                    if (dataAckCallback) {
                        this.dataAckCallbacks.set(data, dataAckCallback);
                    } else if (this.testDataAckFunctionGenerator !== undefined) {
                        this.dataAckCallbacks.set(data, this.testDataAckFunctionGenerator(data));
                    }
                    resolve(); // Resolve the promise to signal that the data was queued
                    this._dispatch(); // Attempt to dispatch the next task
                } else {
                    // If parallelism limit is reached, wait for any active task to complete

                    try {
                        this._logActivity("backpressure", true);
                        //
                        if (this.explicitAck) {
                            // tryAddToQueue was called to add data to the queue, but the queue is full (active >= parallelism)
                            // so we need to wait for the queue to have space before trying to add the data again.
                            // with the blocking system call invocation, it was possible to wait for the promise to resolve
                            // however in this use-case we need to wait for the queue to have space before trying to add the data again.
                            await this.waitForAck();
                        } else {
                            await Promise.race(this.promises);
                        }
                        // Once a task completes, try adding to the queue again
                        tryAddToQueue();
                    } catch (error) {
                        reject(error); // If waiting for a task to complete results in an error, reject the promise
                    }
                }
            };

            tryAddToQueue();
        });
    }


    // this is used for testing.
    async addBatch(testData) {
        // check if testData is a function, and apply it to get the actual data
        try {
            if (typeof testData === 'function') {
                testData = await testData();
            }
        } catch (error) {
            console.error("Error executing testData function:", error);
            throw error;
        }

        this.batchMode = true;
        if (Array.isArray(testData)) {
            this.batchCount += testData.length;
            for(let i=0;i<testData.length;i++){
                if (this.subscribeParams.client !== undefined && Array.isArray(this.subscribeParams.client.acks) && this.subscribeParams.client.acks.includes(testData[i])) {
                    console.debug(`Skipping already acknowledged test data: ${testData[i]}`);
                } else {
                    await this.addToQueue(testData[i]);
                }
            }
        } else {
            this.batchCount += 1;
            await this.addToQueue(testData);
        }

    }

    //this is used for testing
    async drainBatch() {
        while (this.batchMode && this.batchCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
        }
        this.batchMode = false;
    }

    // We can acknowledge all data in-flight once we persist the data in the template snapshot
    async acknowledgeCallbacks() {
        for (const [data, dataAckCallback] of this.dataAckCallbacks.entries()) {
            console.log(`Acknowledging data: ${StatedREPL.stringify(data)}`);
            dataAckCallback(data);
        }
        for (const dispatcherKeys of this.dispatchers.values()) {
            for (const dispatcherKey of dispatcherKeys) {
                if (this.dispatcherObjects.has(dispatcherKey)) {
                    await this.dispatcherObjects.get(dispatcherKey).acknowledgeCallbacks();
                }
            }
        }
    }

}
