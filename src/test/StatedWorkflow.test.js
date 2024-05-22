
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
import {StatedWorkflow} from '../workflow/StatedWorkflow.js';
import fs from 'fs';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import path from 'path';
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import {EnhancedPrintFunc} from "./TestTools.js";
import {rateLimit} from "stated-js/dist/src/utils/rateLimit.js";
import util from "util";
import {fn} from "jest-mock";
import {PulsarClientMock} from "./PulsarMock.js";
import Pulsar from "pulsar-client";
import TemplateProcessor from "stated-js/dist/src/TemplateProcessor.js";
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const unlink = util.promisify(fs.unlink);

import wtf from 'wtfnode';

wtf.init();



test("pubsub", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'pubsub.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);
    // instantiate template processor
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    while(tp.output.rebelForces.length < 3){
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }
    expect(tp.output.rebelForces).toEqual(['luke', 'han', 'leia']);
}, 8000);

test("correlate", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'correlate.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    var template = yaml.load(templateYaml);
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    while(tp.output.state !== 'RECEIVED_RESPONSE'){
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }
    expect(tp.output.state).toBe("RECEIVED_RESPONSE");
}, 8000);

test("workflow perf", async () => {
    const startTime = Date.now(); // Start the total timer

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wfPerf01.yaml');
    const readFileStart = Date.now(); // Start the timer for reading the file
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    const readFileEnd = Date.now(); // End the timer for reading the file
    console.log("Read YAML file: " + (readFileEnd - readFileStart) + "ms");

    // Parse the YAML
    const parseYamlStart = Date.now(); // Start the timer for parsing the YAML
    var template = yaml.load(templateYaml);
    const parseYamlEnd = Date.now(); // End the timer for parsing the YAML
    console.log("Parse YAML: " + (parseYamlEnd - parseYamlStart) + "ms");

    // Initialize the template
    const initWorkflowStart = Date.now(); // Start the timer for initializing the workflow
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    const initWorkflowTimeMs = Date.now() - initWorkflowStart; // time taken to init workflow
    console.log("Initialize workflow: " + (initWorkflowTimeMs) + "ms");
    expect(initWorkflowTimeMs).toBeLessThan(6000); // usually takes ~800ms, but providing some safety here
    expect(Object.keys(tp.output.nozzles).length).toEqual(1001);
}, 10000);

test("downloaders", async () => {
    console.time("workflow perf total time"); // Start the timer with a label

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wfDownloads.yaml');
    console.time("Read YAML file"); // Start the timer for reading the file
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    console.timeEnd("Read YAML file"); // End the timer for reading the file

    // Parse the YAML
    console.time("Parse YAML"); // Start the timer for parsing the YAML
    var template = yaml.load(templateYaml);
    console.timeEnd("Parse YAML"); // End the timer for parsing the YAML

    // Initialize the template
    console.time("Initialize workflow"); // Start the timer for initializing the workflow
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    console.timeEnd("Initialize workflow"); // End the timer for initializing the workflow

    console.timeEnd("workflow perf total time"); // End the total time timer
}, 10000);


/**
 * Pulsar Integration Tests
 *
 *  1. start docker-compose
 *      docker-compose -f docker/docker-compose.yaml up -d
 *  2. run the tests with ENABLE_INTEGRATION_TESTS set to "true"
 *      ENABLE_INTEGRATION_TESTS=true yarn test StatedWorkflow.obsoleteTests.js
 */
if (process.env.ENABLE_INTEGRATION_TESTS === "true") {
    test("Pulsar consumer integration test", async () => {
        const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'pubsub-pulsar.yaml');
        const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
        let template = yaml.load(templateYaml);

        const {templateProcessor: tp} = await StatedWorkflow.newWorkflow(template);
        // keep steps execution logs for debugging
        tp.options = {'keepLogs': true, 'snapshot': {'snapshotIntervalSeconds': 0.01}};

        await tp.initialize();

        while (tp.output.rebelForces.length < 4) {
            await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
        }

        expect(tp.output.rebelForces).toEqual(['chewbacca', 'luke', 'han', 'leia']);

    })

    test("Pulsar consumer data function integration test", async () => {
        const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'pubsub-data-function-pulsar.yaml');
        const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');

        const savedTemplatePath = path.join(process.cwd(), '.state', 'template.json');
        // clean up tempalte
        try {
            await unlink(savedTemplatePath);
        } catch (e) {
            if (e.code !== 'ENOENT') {
                throw e;
            }
        }

        let template = yaml.load(templateYaml);

        let sw = await StatedWorkflow.newWorkflow(template);
        let {templateProcessor: tp} = sw;

        // keep steps execution logs for debugging
        tp.options = {'keepLogs': true}

        await tp.initialize();

        function copyStepLogs(objSrc, objDst) {
            Object.keys(objSrc).forEach(key => {
                if (key.match(/^step\d+$/)) {
                    if (objSrc[key].hasOwnProperty('log')) {
                        console.log(`Copying og ${key}/log:`, objSrc[key].log);
                        objDst[key].log = objSrc[key].log;
                    }
                }
            });
        }

        let beenInterrupted = false;
        while (tp.output.farFarAway?.length + tp.output.nearBy?.length < 2) {
            if (!beenInterrupted && tp.output.interceptedMessages?.length === 1) {
                console.log("checking if template was stored...");
                let savedTemplate = fs.readFileSync(savedTemplatePath, 'utf8');
                // template could be not stored yet
                if (savedTemplate !== '') {
                    console.log("interrupting the current template processor...");
                    await sw.close();

                    // double-check we re-read after tp.close
                    savedTemplate = fs.readFileSync(savedTemplatePath, 'utf8');
                    const templateWithLogs = JSON.parse(savedTemplate);
                    expect(templateWithLogs).toBeDefined();

                    template = yaml.load(templateYaml);
                    // step2 is an IO fetch, so we expect that step1 log was stored, while step3 log was not
                    expect(templateWithLogs.step3.log).toBeUndefined();

                    beenInterrupted = true;

                    copyStepLogs(templateWithLogs, template);
                    console.log("Updated template: " + JSON.stringify(template, null, 2));

                    sw = await StatedWorkflow.newWorkflow(template);
                    tp = sw.templateProcessor;
                    await tp.initialize();
                }
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
        }

        expect(tp.output.interceptedMessages?.length).toBeGreaterThanOrEqual(2)
        expect(tp.output.farFarAway?.length + tp.output.nearBy?.length).toEqual(2);

    }, 300000)
}

test("backpressure due to max parallelism", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'backpressure.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    var template = yaml.load(templateYaml);
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    let latch;
    new Promise((resolve)=>{latch=resolve});
    tp.setDataChangeCallback("/done", (d)=>{
        if(d==="bleeps received"){
            function testActivityRecord(r, expectedMaxActive){
                const {active, queue, backpressure} = r;
                expect(Math.max(...active)).toBe(expectedMaxActive);
                expect(Math.max(...queue)).toBe(0); //queue acts like a transfer queue and will not grow
                expect(backpressure.every(v=>v===true)).toBe(true);
            }
            /*  activity record is kind of interal thing for debugging, don't need to test it
            testActivityRecord(tp.output.slowSubscribeParams.activityRecord.slowAntenna, 4);
            testActivityRecord(tp.output.fastSubscribeParams.activityRecord.fastAntenna, 2);
            */
            expect(tp.output.rxSlow.length).toBe(10);
            expect(tp.output.rxFast.length).toBe(10);
            latch();
        }
    });
    await tp.initialize();
    await latch;
});



test.skip("subscribePulsar with pulsarMock client", async () => {

    const snapshotFile = 'subscribePulsarTest.json';
    const snapshotRelativePath = path.join(__dirname, '../', '../',`${snapshotFile}`);
    try {
        await unlink(snapshotRelativePath);
        console.log(`Deleted previous snapshot file: ${snapshotRelativePath}`);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }

    PulsarClientMock.clear();
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'rebelCommunication.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);

    const sw = await StatedWorkflow.newWorkflow(template);
    await sw.close();
    const {templateProcessor: tp} = sw;
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true, 'snapshot': {path: `./${snapshotFile}`}};

    await tp.initialize();

    while (tp.output.farFarAway?.length + tp.output.nearBy?.length < 10) {
        console.log(`Waiting for at least 10 messages. So far received from farFarAway: ${tp.output.farFarAway?.length}, from nearBy: ${tp.output.nearBy?.length}`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Poll every 50ms
    }
    console.log(`Received 10 or more messages. Received from farFarAway: ${tp.output.farFarAway?.length}, from nearBy: ${tp.output.nearBy?.length}`);

    expect(tp.output.interceptedMessages?.length).toBeGreaterThanOrEqual(10)
    expect(tp.output.farFarAway?.length + tp.output.nearBy?.length).toBeGreaterThanOrEqual(10);

    console.log("waiting for at least 10 messages to be acknowledged");
    const topic = PulsarClientMock.getTopics()[0]; // we use only one topic in the test
    const subscriberId = tp.output.subscribeParams.type;

    while (!Array.isArray(PulsarClientMock.getAcknowledgedMessages(topic))
            || PulsarClientMock.getAcknowledgedMessages(topic, subscriberId).length < 10) {
        console.log(`PulsarMock topic ${topic} stats for subscriberId ${subscriberId}: ${StatedREPL.stringify(PulsarClientMock.getStats(topic, subscriberId))}`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Poll every 500ms
    };
    console.log(`PulsarMock topic ${topic} stats for subscriberId ${subscriberId}: ${StatedREPL.stringify(PulsarClientMock.getStats(topic, subscriberId))}`);
    await sw.close();
    wtf.dump();
}, 10000)

if (process.env.ENABLE_API_INTEGRATION_TESTS === "true") {
    test("API integration test", async () => {
        const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'workflow-demo.yaml');
        const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
        let template = yaml.load(templateYaml);

        const sw = await StatedWorkflow.newWorkflow(template);
        const {templateProcessor: tp} = sw;
        // keep steps execution logs for debugging

        await tp.initialize();

        while (StatedREPL.stringify(tp.output.getWorkflow$) !== "{\n  \"workflowIds\": []\n}") {
            await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
        }

        await sw.close();
    }, 5000);
}