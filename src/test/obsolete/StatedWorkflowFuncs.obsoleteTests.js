
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
import {StatedWorkflow} from '../../workflow/StatedWorkflow.js';
import fs from 'fs';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import path from 'path';
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import {EnhancedPrintFunc} from "./../TestTools.js";
import {rateLimit} from "stated-js/dist/src/utils/rateLimit.js";
import util from "util";
import {PulsarClientMock} from "./../PulsarMock.js";
import TemplateProcessor from "stated-js/dist/src/TemplateProcessor.js";
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const unlink = util.promisify(fs.unlink);

import wtf from 'wtfnode';

wtf.init();


test("test all functions", async () => {
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow({
        "startEvent": "tada",
        // a,b,c,d are workflow stages, which include a callable stated expression, and an output object to
        // store the results of the expression and any errors that occur
        // it will allow workflow stages to be skipped if they have already been run or stop processing next
        // stages if the current stage fails.
        "a": {
            "function": "${ function($in) { ( $console.log($in); [$in, 'a'] ~> $join('->') )} }"
        },
        "b": {
            "function": "${ function($in) { [$in, 'b'] ~> $join('->') } }"
        },
        "c": {
            "function": "${ function($in) { ( $console.log($in); [$in, 'c'] ~> $join('->') )} }"
        },
        "d": {
            "function": "${ function($in) { ( $console.log($in); [$in, 'd'] ~> $join('->') )} }"
        },
        "workflow1": "${ function($startEvent) { $startEvent ~> $serial([a, b]) } }",
        "workflow1out": "${ workflow1(startEvent)}",
        "workflow2": "${ function($startEvent) { $startEvent ~> $parallel([c,d]) } }",
        "workflow2out": "${ workflow2(startEvent)}"
    });
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true};
    await tp.initialize();
    expect(tp.output.workflow1out)
        .toEqual('tada->a->b');
    expect(tp.output.workflow2out)
        .toEqual(expect.arrayContaining(['tada->c', 'tada->d']));
});

test("Multiple template processors", async () => {
    const t  = {
        "startEvent": "tada",
        // a,b,c,d are workflow stages, which include a callable stated expression, and an output object to
        // store the results of the expression and any errors that occur
        // it will allow workflow stages to be skipped if they have already been run or stop processing next
        // stages if the current stage fails.
        "a": {
            "function": "${ function($in) { ( $console.log($in); [$in, 'a'] ~> $join('->') )} }"
        },
        "b": {
            "function": "${ function($in) { [$in, 'b'] ~> $join('->') } }"
        },
        "c": {
            "function": "${ function($in) { ( $console.log($in); [$in, 'c'] ~> $join('->') )} }"
        },
        "d": {
            "function": "${ function($in) { ( $console.log($in); [$in, 'd'] ~> $join('->') )} }"
        },
        "workflow1": "${ function($startEvent) { $startEvent ~> $serial([a, b]) } }",
        "workflow1out": "${ workflow1(startEvent)}",
        "workflow2": "${ function($startEvent) { $startEvent ~> $parallel([c,d]) } }",
        "workflow2out": "${ workflow2(startEvent)}"
    };
    const {templateProcessor:tp1} = await StatedWorkflow.newWorkflow(t);
    const {templateProcessor:tp2} = await StatedWorkflow.newWorkflow(t);
    tp1.options = {'keepLogs': true};
    await tp1.initialize();
    tp2.options = {'keepLogs': true};
    await tp2.initialize();
    expect(tp1.output.workflow1out)
        .toEqual('tada->a->b');
    expect(tp1.output.workflow2out)
        .toEqual(expect.arrayContaining(['tada->c', 'tada->d']));
    expect(tp2.output.workflow1out)
        .toEqual('tada->a->b');
    expect(tp2.output.workflow2out)
        .toEqual(expect.arrayContaining(['tada->c', 'tada->d']));

});


// this function gets skipped, as the callback gets overridden by Stated Workflow
// TODO: fix stated to allow for multiple callbacks
test.skip("Template Data Change Callback with rate limit", async () => {
    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'pubsub-data-function.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);
    // instantiate template processor
    const {templateProcessor: tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}

    const counts = [];

    const dataChangeCallback = rateLimit(async (output, theseThatChanged) => {
        counts.push(output.interceptedMessages.length);
    }, 1000);
    tp.setDataChangeCallback('/', dataChangeCallback);

    await tp.initialize();
    while (tp.output.stop$ === 'still going') {
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }
    while (counts.length < 2) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }

    // Assertions
    expect(tp.output.stop$).toEqual('missionAccomplished');
    // Assert that the data change callback was called twice by rate limit function, on the first and the last events
    // on the first data change callback this happens before setData (which is called after the change callback)
    // on the last data change callback this happens after all setData calls succeeded (change callback is hold until
    // wait time in rate limit function is over).
    expect(counts).toEqual([0,10]);

});


/**
 * This test validates that the workflow can be recovered from a snapshot.
 */
test("Snapshot and recover for workflow", async () => {
    // Logging function to console.log with date stamps
    const logWithDate = (message) => {
        console.log(`${new Date().toISOString()}: ${message}`);
    };

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'inhabitants-with-delay.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    var template = yaml.load(templateYaml);

    const sw = await StatedWorkflow.newWorkflow(template);
    const {templateProcessor: tp} = sw;

    const snapshotFile = 'SnapshotAndRecoverForWorkflowTest.json';
    tp.options = {'snapshot': {'snapshotIntervalSeconds': 0.01, path: `./${snapshotFile}`}};

    const snapshotFilePath = path.join(__dirname, '../', '../', snapshotFile);

    // Make sure snapshot is deleted before the test
    try {
        await unlink(snapshotFilePath);
        logWithDate(`Deleted previous snapshot file: ${snapshotFilePath}`);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }

    await tp.initialize();
    logWithDate("Initialized stated workflow template...");

    let anyResidentsSnapshotted = false;
    let snapshot;

    // Wait for the snapshot file to include at least 10 residents
    while (!anyResidentsSnapshotted) {
        try {
            const snapshotContent = fs.readFileSync(snapshotFilePath, 'utf8');
            snapshot = JSON.parse(snapshotContent);
            logWithDate(`Snapshot has ${snapshot.output.residents.length} residents`);
            if (snapshot.output?.residents?.length > 5) {
                anyResidentsSnapshotted = true;
                break;
            }
        } catch (e) {
            logWithDate(`Error checking snapshot residents: ${e.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s
    }

    // Kill the wf
    logWithDate("Stopping stated workflow...");
    await sw.close();
    logWithDate(`Stopped stated workflow, with ${tp.output.residents.length} residents`);

    logWithDate(`Recovering from a snapshot with ${snapshot.output.residents.length} residents`);
    await tp.initialize(snapshot.template, '/', snapshot.output);

    // Calculate residents
    let residents = 0;
    do {
        // uniqResidents = Object.keys(tp.output?.residents.reduce((counts, o)=>{ counts[o.name] = (counts[o.name] || 0) + 1; return counts }, {})).length;
        residents = tp.output?.residents;
        logWithDate(`Got ${residents} unique residents processed`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    } while (residents < 32)

    logWithDate(`We got ${residents} unique residents processed with ${tp.output.residents.length} total residents`);
    await sw.close();
    logWithDate("Stopped stated workflow before test end");
}, 20000); // 20s timeout for times swapi not behaving
