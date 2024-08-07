
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

test("wf", async () => {
    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'wf.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);
    // instantiate template processor
    const statedWorkflow = await StatedWorkflow.newWorkflow(template);
    const {templateProcessor:tp} = statedWorkflow;
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    while(tp.output.stop$ === 'still going'){
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }
    let stepLog = tp.output.step1.log;
    expect(stepLog).toBeDefined();
    // TODO: fix, to access an object of a particula worklfow
    // stepLog: {
    //   "/myWorkflow$/step1": {
    //     "2024-01-06-1704575626583-jac1": {
    //       "start": {
    //         "timestamp": 1704575626583,
    //         "args": {
    //           "name": "nozzleTime",
    //           "order": 1
    //         }
    //       },
    //       "end": {
    //         "timestamp": 1704575626584,
    //         "out": {
    //           "name": "nozzleTime",
    //           "order": 1,
    //           "primed": true
    //         }
    //       }
    //     }
    //   },
    //   "/myWorkflow2$/step1": {
    //     "2024-01-06-1704575630312-8717": {
    //       "start": {
    //         "timestamp": 1704575630312,
    //         "args": {
    //           "name": "nozzleTime",
    //           "order": 1
    //         }
    //       },
    //       "end": {
    //         "timestamp": 1704575630312,
    //         "out": {
    //           "name": "nozzleTime",
    //           "order": 1,
    //           "primed": true
    //         }
    //       }
    //     }
    //   }
    // }
    let logEntry = stepLog[Object.keys(stepLog)[0]];
    expect(logEntry).toBeDefined();

    // expect(logEntry.start).toBeDefined();
    // expect(logEntry.start.args).toBeDefined();
    // expect(logEntry.end).toBeDefined();
    // expect(logEntry.end.out).toBeDefined();
    // stepLog = tp.output.step2.log;
    // expect(stepLog).toBeDefined();
    // logEntry = stepLog[Object.keys(stepLog)[0]];
    // expect(logEntry).toBeDefined();
    // expect(logEntry.start).toBeDefined();
    // expect(logEntry.start.args).toBeDefined();
    // expect(logEntry.end).toBeDefined();
    // expect(logEntry.end.out).toEqual({
    //     "name": "nozzleTime",
    //     "order": 1,
    //     "primed": true,
    //     "sprayed": true
    // });
}, 8000);

test("workflow logs", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'wf.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');

    // Parse the YAML
    var template = yaml.load(templateYaml);

    const {templateProcessor: tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    const {step1, step2} = tp.output;
    expect(step1).toBeDefined();
    expect(step1.log).toBeDefined();
    // expect(Object.keys(step1.log).length).toEqual(0);
    expect(step2).toBeDefined();
    expect(step2.log).toBeDefined();
    // expect(Object.keys(step2.log).length).toEqual(0);
    //correlate each workflowInvocation from step1's log to step2's log
    Object.keys(step1.log).forEach(workflowInvocation => {
          const removeUncomparableTimestamps = JSON.parse(StatedREPL.stringify(step2.log[workflowInvocation], EnhancedPrintFunc.printFunc));
          expect(removeUncomparableTimestamps).toMatchObject({
              "start": {
                  "args": {
                      "name": "nozzleTime",
                      "primed": true
                      //order: 1 ...note we don't test for order because we can't guarantee which workflowInvocation contains 1 or 2
                  },
                  "timestamp": "--timestamp--"
              },
              "end": {
                  "out": {
                      "name": "nozzleTime",
                      "primed": true,
                      "sprayed": true
                  },
                  "timestamp": "--timestamp--"
              }
          })
      }
    );
});

test("workflow logs with keepLogs", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'wf.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');

    // Parse the YAML
    var template = yaml.load(templateYaml);

    const {templateProcessor: tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    const {step1, step2} = tp.output;
    expect(step1).toBeDefined();
    expect(step1.log).toBeDefined();
    expect(Object.keys(step2.log).length).toEqual(1);
    expect(step2).toBeDefined();
    expect(step2.log).toBeDefined();
    expect(Object.keys(step2.log).length).toEqual(1);
    //correlate each workflowInvocation from step1's log to step2's log
    Object.keys(step1.log).forEach(workflowInvocation => {
          const removeUncomparableTimestamps = JSON.parse(StatedREPL.stringify(step2.log[workflowInvocation], EnhancedPrintFunc.printFunc));
          expect(removeUncomparableTimestamps).toMatchObject({
              "start": {
                  "args": {
                      "name": "nozzleTime",
                      "primed": true
                      //order: 1 ...note we don't test for order because we can't guarantee which workflowInvocation contains 1 or 2
                  },
                  "timestamp": "--timestamp--"
              },
              "end": {
                  "out": {
                      "name": "nozzleTime",
                      "primed": true,
                      "sprayed": true
                  },
                  "timestamp": "--timestamp--"
              }
          })
      }
    );
});


// This is WIP migrating to a new log format
// test("workflow logs", async () => {
//
//     // Load the YAML from the file
//     const yamlFilePath = path.join(__dirname, '../', '../', '../, 'example', 'wf.yaml');
//     const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
//
//     // Parse the YAML
//     var template = yaml.load(templateYaml);
//
//     const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);await
// tp.initialize();
await //     await tp.initialize();
//     const {step1, step2} = tp.output;
//     expect(step1).toBeDefined();
//     expect(step1.log).toBeDefined();
//     expect(step2).toBeDefined();
//     expect(step2.log).toBeDefined();
//     //correlate each workflowInvocation from step1's log to step2's log
//     Object.keys(step1.log["/myWorkflow$/step1"]).forEach(workflowInvocation=> {
//             const removeUncomparableTimestamps = JSON.parse(StatedREPL.stringify(step2.log["/myWorkflow$/step2"][workflowInvocation], EnhancedPrintFunc.printFunc));
//             expect(removeUncomparableTimestamps).toMatchObject({
//                 "start": {
//                     "args": {
//                         "name": "nozzleTime",
//                         "primed": true
//                         //order: 1 ...note we don't test for order because we can't guarantee which workflowInvocation contains 1 or 2
//                     },
//                     "timestamp": "--timestamp--"
//                 },
//                 "end": {
//                     "out": {
//                         "name": "nozzleTime",
//                         "primed": true,
//                         "sprayed": true
//                     },
//                     "timestamp": "--timestamp--"
//                 }
//             })
//         }
//     );
//
//     const expectedOutput = {
//         "log": {
//             "retention": {
//                 "maxWorkflowLogs": 100
//             }
//         },
//         "myWorkflow$": "{function:}",
//         "name": "nozzleWork",
//         "start$": null,
//         "step1": {
//             "function": "{function:}",
//             "log": {
//                 "1697347459331-9nhaf": {
//                     "end": {
//                         "out": {
//                             "name": "nozzleTime",
//                             "order": 1,
//                             "primed": true
//                         },
//                         "timestamp": "--timestamp--"
//                     },
//                     "start": {
//                         "args": {
//                             "name": "nozzleTime",
//                             "order": 1
//                         },
//                         "timestamp": "--timestamp--"
//                     }
//                 },
//                 "1697347459331-fb9gc": {
//                     "end": {
//                         "out": {
//                             "name": "nozzleTime",
//                             "order": 2,
//                             "primed": true
//                         },
//                         "timestamp": "--timestamp--"
//                     },
//                     "start": {
//                         "args": {
//                             "name": "nozzleTime",
//                             "order": 2
//                         },
//                         "timestamp": "--timestamp--"
//                     }
//                 }
//             },
//             "name": "primeTheNozzle"
//         },
//         "step2": {
//             "function": "{function:}",
//             "log": {
//                 "1697347459331-9nhaf": {
//                     "end": {
//                         "out": {
//                             "name": "nozzleTime",
//                             "order": 1,
//                             "primed": true,
//                             "sprayed": true
//                         },
//                         "timestamp": "--timestamp--"
//                     },
//                     "start": {
//                         "args": {
//                             "name": "nozzleTime",
//                             "order": 1,
//                             "primed": true
//                         },
//                         "timestamp": "--timestamp--"
//                     }
//                 },
//                 "1697347459331-fb9gc": {
//                     "end": {
//                         "out": {
//                             "name": "nozzleTime",
//                             "order": 2,
//                             "primed": true,
//                             "sprayed": true
//                         },
//                         "timestamp": "--timestamp--"
//                     },
//                     "start": {
//                         "args": {
//                             "name": "nozzleTime",
//                             "order": 2,
//                             "primed": true
//                         },
//                         "timestamp": "--timestamp--"
//                     }
//                 }
//             },
//             "name": "sprayTheNozzle"
//         },
//         "subscribeParams": {
//             "filter$": "{function:}",
//             "parallelism": 2,
//             "source": "cloudEvent",
//             "subscriberId": "nozzleWork",
//             "testData": [
//                 {
//                     "name": "nozzleTime",
//                     "order": 1
//                 },
//                 {
//                     "name": "nozzleTime",
//                     "order": 2
//                 }
//             ],
//             "to": "{function:}",
//             "type": "my-topic"
//         }
//     };
// }, 10000);

// in this test we have a log invocation with both start and stop for step0, so recover should
// not rerun the steps.
test("recover completed workflow - should do nothing", async () => {

    const templateYaml =
      `
    recover$: $recoverStep(step0)
    name: nozzleWork
    step0:
      name: entrypoint
      function: /\${  function($e){$e ~> $serial([step1, step2])}  }
      "log": {
        "1697402819332-9q6gg": {
          "start": {
            "timestamp": 1697402819332,
            "args": {
              "name": "nozzleTime",
              "order": 1
            }
          },
          "end": {
            "timestamp": 1697402826805,
            "out": {
              "name": "nozzleTime",
              "order": 1,
              "primed": true,
              "sprayed": true
            }
          }
        }
      }
    step1:
      name: primeTheNozzle
      function: \${   function($e){ $e~>|$|{'primed':true}|}  }
    step2:
      name: sprayTheNozzle
      function: \${function($e){ $e~>|$|{'sprayed':true}|  }}
`
    // Parse the YAML
    var template = yaml.load(templateYaml);

    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();


    const {recover$, step0, step1, step2} = tp.output;
    expect(recover$).toBeUndefined(); // make sure no error is returned
    expect(step1.log).toBeUndefined();
    expect(step2.log).toBeUndefined();
    expect(step0.log).toEqual({ //the entry point log is completed (it has a start and an end) - so we don't do anything
        "1697402819332-9q6gg": {
            "start": {
                "timestamp": 1697402819332,
                "args": {
                    "name": "nozzleTime",
                    "order": 1
                }
            },
            "end": {
                "timestamp": 1697402826805,
                "out": {
                    "name": "nozzleTime",
                    "order": 1,
                    "primed": true,
                    "sprayed": true
                }
            }
        }
    });
}, 10000);

// in this test the workflow log includes a start but not end, and it should trigger the
// workflow to rerun this event
test("recover incomplete workflow - should rerun all steps", async () => {

    // Load the YAML from the file
    const templateYaml =
        `
    recover$: $recoverStep(step0)
    name: nozzleWork
    step0:
      name: entrypoint
      function: /\${  function($e, $context){$e ~> $serial([step1, step2], $context)}  }
      "log": {
            "1697402819332-9q6gg": {
              "start": {
                "timestamp": 1697402819332,
                "args": {
                  "name": "nozzleTime",
                  "order": 1
                }
              }
          }
      }
    step1:
      name: primeTheNozzle
      function: \${   function($e){ $e~>|$|{'primed':true}|}  }
    step2:
      name: sprayTheNozzle
      function: \${function($e){ $e~>|$|{'sprayed':true}|  }}
`

    // Parse the YAML
    var template = yaml.load(templateYaml);

    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    const {step0, step1, step2} = tp.output;
    while(tp.output.step2.log['1697402819332-9q6gg'] === undefined || tp.output.step2.log['1697402819332-9q6gg'].end === undefined){
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }
    expect(step0.log['1697402819332-9q6gg'].end).exists;
    expect(step1.log['1697402819332-9q6gg'].start).exists;
    expect(step1.log['1697402819332-9q6gg'].end).exists;
    expect(step2.log['1697402819332-9q6gg'].start).exists;
    expect(step2.log['1697402819332-9q6gg'].end).exists;
    expect(step2.log['1697402819332-9q6gg'].end.out).toMatchObject({
        "name": "nozzleTime",
        "primed": true,
        "sprayed": true
    })
}, 10000);

test("recover incomplete workflow - step 1 is incomplete - should rerun steps 1 and 2", async () => {

    // Load the YAML from the file
    const templateYaml =
        `
    recover$: $recoverStep(step0)
    name: nozzleWork
    step0:
      name: entrypoint
      function: /\${  function($e, $context){$e ~> $serial([step1, step2], $context)}  }
      "log": {
            "1697402819332-9q6gg": {
              "start": {
                "timestamp": 1697402819332,
                "args": {
                  "name": "nozzleTime",
                  "order": 1
                }
              }
          }
      }
    step1:
      name: primeTheNozzle
      function: \${   function($e){ $e~>|$|{'primed':true}|}  }
      "log": {
            "1697402819332-9q6gg": {
              "start": {
                "timestamp": 1697402819336,
                "args": {
                  "name": "nozzleTime",
                  "order": 1
                }
              }
          }
      }
    step2:
      name: sprayTheNozzle
      function: \${function($e){ $e~>|$|{'sprayed':true}|  }}
`

    // Parse the YAML
    var template = yaml.load(templateYaml);

    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}
    await tp.initialize();
    const {step0, step1, step2} = tp.output;
    while(tp.output.step2.log['1697402819332-9q6gg'] === undefined || tp.output.step2.log['1697402819332-9q6gg'].end === undefined){
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }

    expect(step0.log['1697402819332-9q6gg'].end).toBeDefined();
    expect(step1.log['1697402819332-9q6gg'].start).toBeDefined();
    expect(step1.log['1697402819332-9q6gg'].end).toBeDefined();

    expect(step2.log['1697402819332-9q6gg'].start).toBeDefined();
    expect(step2.log['1697402819332-9q6gg'].end).toBeDefined();
    expect(step2.log['1697402819332-9q6gg'].end.out).toMatchObject({
        "name": "nozzleTime",
        "primed": true,
        "sprayed": true
    })
}, 10000);

//
// // TODO: webserver does not shut down after initialization. We will need to implement a shutdown callback
// /*
// test("webserver", async () => {
//     console.time("workflow perf total time"); // Start the timer with a label
//
//     // Load the YAML from the file
//     const yamlFilePath = path.join(__dirname, '../', '../', '../, 'example', 'wfHttp01.yaml');
//     console.time("Read YAML file"); // Start the timer for reading the file
//     const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
//     console.timeEnd("Read YAML file"); // End the timer for reading the file
//
//     // Parse the YAML
//     console.time("Parse YAML"); // Start the timer for parsing the YAML
//     var template = yaml.load(templateYaml);
//     console.timeEnd("Parse YAML"); // End the timer for parsing the YAML
//
//     // Initialize the template
//     console.time("Initialize workflow"); // Start the timer for initializing the workflow
//     const tp await = StatedWorkflow.newWorkflow(template);
// await //     await tp.initialize();
//     console.timeEnd("Initialize workflow"); // End the timer for initializing the workflow
//
//     console.timeEnd("workflow perf total time"); // End the total time timer
//     tp.close();
// });
// */


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
        const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'pubsub-pulsar.yaml');
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
        const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'pubsub-data-function-pulsar.yaml');
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
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'backpressure.yaml');
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


/**
 * This test validates that the workflow can be recovered from a snapshot.
 */
test("Snapshot and recover for workflow", async () => {
    // Logging function to console.log with date stamps
    const logWithDate = (message) => {
        console.log(`${new Date().toISOString()}: ${message}`);
    };

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'inhabitants-with-delay.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    var template = yaml.load(templateYaml);

    const sw = await StatedWorkflow.newWorkflow(template);
    const {templateProcessor: tp} = sw;

    const snapshotFile = 'SnapshotAndRecoverForWorkflowTest.json';
    tp.options = {'snapshot': {'snapshotIntervalSeconds': 0.01, path: `./${snapshotFile}`}};

    const snapshotFilePath = path.join(__dirname, '../', '../', '../', snapshotFile);

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


test.skip("subscribePulsar with pulsarMock client", async () => {

    const snapshotFile = 'subscribePulsarTest.json';
    const snapshotRelativePath = path.join(__dirname, '../', '../', '../',`${snapshotFile}`);
    try {
        await unlink(snapshotRelativePath);
        console.log(`Deleted previous snapshot file: ${snapshotRelativePath}`);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }

    PulsarClientMock.clear();
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'rebelCommunication.yaml');
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


/**
 * This test validates
 * 1. that the workflow can be restored from a snapshot
 * 2. Test Client with acknowledgement
 * 3. Step logs
 *
 * How it works:
 * 1. Test publisher sends 3 messages with rebel names to the test subscriber - ['luke', 'han', 'leia']
 * 2. The subscriber function runs with parallelism one and executes a workflow with 2 steps: fetchRebel and saveRebel
 * 3. The test is designed so that on the .init of the tempalate
 *   3.1 Workflow processes luke, and saves and acknowledges it
 *   3.2 Workflow completes the first step fetchRebel for han, but hangs on the second step saveRebel and sets simulateFailure=false
 * 4. test waits for successful snapshot with simulateFailure=false, and then shuts down the workflow
 * 5. the test validates that the fetchRebel.log.han has both start and end, and saveRebel.log.han has start but no end
 * 6. the test restores the workflow from the snapshot and waits for the workflow to process all 3 rebels
 * 7. validates exactly once processing for all 3 rebels
 * 8. validates that the fetchRebel step was completed exactly once for each rebel, because 'han' completed this step
 *    before the snapshot was taken.
 * 8. validates the acks for each rebel
 */
test.skip("workflow snapshot and restore", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'joinResistanceRecovery.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);

    let sw = await StatedWorkflow.newWorkflow(template);
    let {templateProcessor: tp} = sw;
    const snapshotFile = 'workflowSnapshotAndRestoreTest.json';
    tp.options = {'snapshot': {'snapshotIntervalSeconds': 1, path: `./${snapshotFile}`}};

    const snapshotRelativePath = path.join(__dirname, '../', '../', '../',`${snapshotFile}`);

    // Make sure snapshot is deleted before the test
    try {
        await unlink(snapshotRelativePath);
        console.log(`Deleted previous snapshot file: ${snapshotRelativePath}`);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }

    await tp.initialize();
    console.log("Initialized stated workflow template...");

    let snapshot;

    // Wait for snapshot to capture field simulateFailure set to true
    while (true) {
            // read snapshot and check if output.simulateFailure is set to true
            try {
                const snapshotContent = fs.readFileSync(snapshotRelativePath, 'utf8');
                snapshot = JSON.parse(snapshotContent);
            } catch (e) {
                if (e.code === 'ENOENT' || e.message === 'Unexpected end of JSON input') {
                    console.log(`Snapshot is not ready yet: ${snapshotRelativePath}, waiting...`)
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s
                    continue; // waiting for snapshot to be made
                }
                console.error(`Error checking snapshot residents: ${e.message}`);
                throw e;
            }
            console.log(`Snapshot has ${snapshot.output.rebels.length} rebels, waiting for output.simulateFailure set to true...`);
            if (snapshot.output.simulateFailure === false) {
                // by the test design, failure occurs when we're processing second rebel 'han'. 'luke' should be saved and
                // acknowledged.
                expect(snapshot.output.rebels.length).toEqual(1);
                expect(StatedREPL.stringify(snapshot.output.rebels)).toEqual(StatedREPL.stringify([
                    {"name": "Luke Skywalker", "url": "https://www.swapi.tech/api/planets/1"}]));
                expect(StatedREPL.stringify(snapshot.output.subscribeParams.client.acks)).toEqual(StatedREPL.stringify(["luke"]));
                // the output should also have a log for 'han' invocationId complete for fetchRebel
                expect (snapshot.output.fetchRebel.log.han.end).toBeDefined();

                // the second step saveRebel is designed to hang on 'han' and not to complete.
                // ... it should have a start log
                expect (snapshot.output.saveRebel.log.han.start).toBeDefined();
                // ... but no end log.
                expect (snapshot.output.saveRebel.log.han.end).toBeUndefined();
                break;
            }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s
    };

    // Kill the wf
    console.log("Stopping stated workflow with ${tp.output.rebels.length} rebels saved in the output...");
    await sw.close();
    console.log(`Stopped stated workflow`);

    console.log(`Restore from a snapshot...`);
    sw = await StatedWorkflow.newWorkflow(template);
    tp = sw.templateProcessor;
    await TemplateProcessor.prepareSnapshotInPlace(snapshot);
    await tp.initialize(snapshot.template, '/', snapshot.output);

    while (tp.output.rebels.length !== 3) {
        console.log(`Waiting for 3 rebels. So far saved: ${tp.output.rebels.length}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s
    }

    // Validate each rebel saved exactly once
    expect(StatedREPL.stringify(tp.output.rebels)).toEqual(StatedREPL.stringify([
        {"name": "Luke Skywalker", "url": "https://www.swapi.tech/api/planets/1"},
        {"name": "Han Solo", "url": "https://www.swapi.tech/api/planets/22"},
        {"name": "Leia Organa", "url": "https://www.swapi.tech/api/planets/2"}
    ]));
    // Expect that each rebel data was acknowledged once.
    expect(StatedREPL.stringify(tp.output.subscribeParams.client.acks)).toEqual(StatedREPL.stringify(["luke", "han", "leia"]));
    // validate that fetchRebel step was completed exactly once. On the first try, it leaves a log for 'han' with start
    // and end. On the second try the workflow starts from 'han', which hasn't been acknowledged, but has a complete
    // fetchRebel log and will be skipped.
    expect(tp.output.fetchLog).toEqual( ["luke", "han", "leia"]);

    await sw.close();
}, 100000); //


// This test is for running a demo template with a custom API
test.skip("run example/workflow-demo.yaml", async () => {
    const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'workflow-demo.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);
    let apiProcess;

    const sw = await StatedWorkflow.newWorkflow(
        template, undefined,
        {
            startApi: async ()=>{
                return new Promise((resolve, reject) => {
                    try {
                        apiProcess = exec('node stated-workflow-api', (error, stdout, stderr) => {
                            if (error) {
                                console.error(`exec error: ${error}`);
                                reject(error); // Reject the promise on error.
                                return;
                            }
                        });
                        console.log(`started stated-workflow-api with pid ${apiProcess.pid}`);

                        apiProcess.stdout.on('data', (data) => {
                            console.log(`stdout: ${data}`);
                            if (data.includes('Server running on port 8080')) {
                                resolve('success'); // Resolve the promise when the server is ready.
                            }
                        });
                        apiProcess.stderr.on('data', (data) => {
                            console.error(`stderr: ${data}`);
                        });

                        apiProcess.on('error', (error) => {
                            console.error(`Failed to start process: ${error}`);
                            reject(error);
                        });
                    } catch (error) {
                        console.error(`error starting stated-workflow-api: ${error}`);
                        reject(error);
                    }
                })
            },
            readObject: async (file) => {
                return new Promise((resolve, reject) => {
                    if (file === undefined) {
                        console.log(`file is undefined`);
                        return;
                    }
                    if (file[0] === '~') {
                        file = file.replace('~', process.env.HOME);
                    }
                    file = path.resolve(file);

                    console.log(`opening file ${file}`);

                    if (!fs.existsSync(file)) {
                        console.log(`file ${file} does not exist`);
                        return;
                    }
                    const fileContent = fs.readFileSync(file, 'utf8');
                    try {
                        resolve(JSON.parse(fileContent));
                    } catch (e) {
                        console.log(`error parsing file as json: ${e.message}`);
                    }
                    try {
                        resolve(yaml.load(fileContent));
                    } catch (e) {
                        console.log(`error parsing file as yaml: ${e.message}`);
                    }
                    console.log(`file ${file} could not be parsed as json or yaml`);
                    reject(`file ${file} could not be parsed as json or yaml`);
                });
            },
            toJson: async (obj) => {
                return JSON.stringify(obj);
            }
        }
    );
    const {templateProcessor: tp} = sw;
    // keep steps execution logs for debugging

    await tp.initialize();

    console.log("template output", tp.output);
    while (StatedREPL.stringify(tp.output.getWorkflow$) !== "{\n  \"workflowIds\": []\n}") {
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }

    // cleanup
    await sw.close();
    if (apiProcess) {
        apiProcess.kill();
    }
}, 5000);

if (process.env.ENABLE_API_INTEGRATION_TESTS === "true") {
    test("API integration test", async () => {
        const yamlFilePath = path.join(__dirname, '../', '../', '../', 'example', 'workflow-demo.yaml');
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

