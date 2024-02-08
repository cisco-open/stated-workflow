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
import {WorkflowDispatcher} from "../workflow/WorkflowDispatcher.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import {EnhancedPrintFunc} from "./TestTools.js";
import {rateLimit} from "stated-js/dist/src/utils/rateLimit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("wf", async () => {
    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wf.yaml');
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

test("workflow logs", async () => {

    // Load the YAML from the file
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wf.yaml');
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
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wf.yaml');
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
//     const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wf.yaml');
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
    recover$: $recover(step0)
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
    recover$: $recover(step0)
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
    recover$: $recover(step0)
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
    expect(Object.keys(tp.output.step1.log).length).toEqual(300);
    expect(Object.keys(tp.output.step2.log).length).toEqual(300);
}, 10000);


//
// // TODO: webserver does not shut down after initialization. We will need to implement a shutdown callback
// /*
// test("webserver", async () => {
//     console.time("workflow perf total time"); // Start the timer with a label
//
//     // Load the YAML from the file
//     const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'wfHttp01.yaml');
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


test("test all", async () => {
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

test("Template Data Change Callback with rate limit", async () => {
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

test("Pulsar consumer WIP", async () => {
    const yamlFilePath = path.join(__dirname, '../', '../', 'example', 'pubsub-pulsar.yaml');
    const templateYaml = fs.readFileSync(yamlFilePath, 'utf8');
    let template = yaml.load(templateYaml);

    const {templateProcessor: tp} = await StatedWorkflow.newWorkflow(template);
    // keep steps execution logs for debugging
    tp.options = {'keepLogs': true}

    await tp.initialize();

    while (tp.output.rebelForces.length < 4) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Poll every 50ms
    }

    expect(tp.output.rebelForces).toEqual(['chewbacca', 'luke', 'han', 'leia']);

});