![Stated-Workflows](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/stated-workflows.svg)

# Overview
Stated Workflows is a collection of functions for a lightweight and scalable event-driven workflow engine using 
[Stated](https://github.com/cisco-open/stated) template engine.
This README assumes some familiarity with the [Stated REPL](https://github.com/cisco-open/stated#running-the-repl).
If you don't have Stated, [get it now](https://github.com/cisco-open/stated#getting-started). The key benefits of 
Stated Worklflows are:
 * __Easy__ - Stated Workflows are easier to express and comprehend than other workflow languages
 * __Testable__ - Stated Workflows are testable. Every Stated Workflow can be tested from a REPL and behaves exactly locally as it does in Stated Workflow cluster.
 * __Interactive__ - As you can see from the exmaples in this README, you can interact directly with workflows from the REPL
 * __Transparent__ - Stated Workflows takes a "What You See Is What You Get" approach to workflows. Stated-Workflows is the only workflow engine with a JSON-centric approach to data and durability.
 * __Highly Available__ - Stated Workflows can be run in an easy-to-scale, k8s-friendly cluster for scaling, durability, and high availability

## Getting Started

### Installation

To install the `stated-js` package, you can use yarn or npm. Open your terminal and run one of the following commands:

Using Yarn:

```shell
yarn global add stated-workflows
````

Using Npm:

```shell
npm install -g stated-workflows
````
Verify you have node:
```shell
node -v | grep -Eo 'v([0-9]+)\.' | grep -E 'v19|v[2-9][0-9]' && echo "Node is 19 or higher" || echo "Node is below 19"

```

### Running the REPL
To use the Stated Workflows REPL (Read-Eval-Print Loop) it is recommended to have at least version 19.2 or higher of node.js. The
Stated REPL is built on [Node REPL](https://nodejs.org/api/repl.html#repl).
You can start the REPL by running the `stateflow` command in your terminal:
```shell
luke$ stateflow
```
The REPL will launch, allowing you to interact with the stated-js library. In order to launch properly you need to have
`node` on your path.`stateflow` is a wrapper script that simply calls `stated-workflow.js`, which contains this 
`#!/usr/bin/env node --experimental-vm-modules`. 

For example you can enter this command in the REPL:
```bash
> .init -f "example/homeworld.json"
```
# Jobs
A job is a Stated Workflow template that runs to completion and does not receive any asynchronous inputs.
A job has a beginning, and an end. Here is a job that uses the Starwars API to search for Luke Skywalker's details,
extract the homeworld URL, retrieve the homeworld details, and extract the homeworld's name.
```json
{
  "lukePersonDetails": "${ $fetch('https://swapi.dev/api/people/?search=luke').json().results[0]}",
  "lukeHomeworldURL": "${ lukePersonDetails.homeworld }",
  "homeworldDetails": "${ $fetch(lukeHomeworldURL).json() }",
  "homeworldName": "${ homeworldDetails.name }"
}
```
![homeworld workflow](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow.svg)

Try it, from the [Stated REPL](https://github.com/cisco-open/stated#running-the-repl). The `.init` command loads the 
example

```json
luke$ stateflow
> .init -f "example/homeworld.json"
{
  "lukePersonDetails": "${ $fetch('https://swapi.dev/api/people/?search=luke').json().results[0]}",
  "lukeHomeworldURL": "${ lukePersonDetails.homeworld }",
  "homeworldDetails": "${ $fetch(lukeHomeworldURL).json() }",
  "homeworldName": "${ homeworldDetails.name }"
}
> .out
{
  "lukePersonDetails": {
    "name": "Luke Skywalker",
    "height": "172",
    "mass": "77",
    "hair_color": "blond",
    "skin_color": "fair",
    "eye_color": "blue",
    "birth_year": "19BBY",
    "gender": "male",
    "homeworld": "https://swapi.dev/api/planets/1/",
    "films": [
      "https://swapi.dev/api/films/1/",
      "https://swapi.dev/api/films/2/",
      "https://swapi.dev/api/films/3/",
      "https://swapi.dev/api/films/6/"
    ],
    "species": [],
    "vehicles": [
      "https://swapi.dev/api/vehicles/14/",
      "https://swapi.dev/api/vehicles/30/"
    ],
    "starships": [
      "https://swapi.dev/api/starships/12/",
      "https://swapi.dev/api/starships/22/"
    ],
    "created": "2014-12-09T13:50:51.644000Z",
    "edited": "2014-12-20T21:17:56.891000Z",
    "url": "https://swapi.dev/api/people/1/"
  },
  "lukeHomeworldURL": "https://swapi.dev/api/planets/1/",
  "homeworldDetails": {
    "name": "Tatooine",
    "rotation_period": "23",
    "orbital_period": "304",
    "diameter": "10465",
    "climate": "arid",
    "gravity": "1 standard",
    "terrain": "desert",
    "surface_water": "1",
    "population": "200000",
    "residents": [
      "https://swapi.dev/api/people/1/",
      "https://swapi.dev/api/people/2/",
      "https://swapi.dev/api/people/4/",
      "https://swapi.dev/api/people/6/",
      "https://swapi.dev/api/people/7/",
      "https://swapi.dev/api/people/8/",
      "https://swapi.dev/api/people/9/",
      "https://swapi.dev/api/people/11/",
      "https://swapi.dev/api/people/43/",
      "https://swapi.dev/api/people/62/"
    ],
    "films": [
      "https://swapi.dev/api/films/1/",
      "https://swapi.dev/api/films/3/",
      "https://swapi.dev/api/films/4/",
      "https://swapi.dev/api/films/5/",
      "https://swapi.dev/api/films/6/"
    ],
    "created": "2014-12-09T13:50:49.641000Z",
    "edited": "2014-12-20T20:58:18.411000Z",
    "url": "https://swapi.dev/api/planets/1/"
  },
  "homeworldName": "Tatooine"
}
```
As you can see, for this workflow, there is nothing required beyond a standard Stated template.
Stated already provides the mechanism to parse and analyze expressions and build an execution plan
based on the DAG. Let's look at the execution plan Stated has built.
```json
> .init -f "example/homeworld.json"
{
  "lukePersonDetails": "${ $fetch('https://swapi.dev/api/people/?search=luke').json().results[0]}",
  "lukeHomeworldURL": "${ lukePersonDetails.homeworld }",
  "homeworldDetails": "${ $fetch(lukeHomeworldURL).json() }",
  "homeworldName": "${ homeworldDetails.name }"
}
> .plan 
[
  "/lukePersonDetails",
  "/lukeHomeworldURL",
  "/homeworldDetails",
  "/homeworldName"
]
```
The `.plan` REPL command shows us that Stated understands that there is a list of fields that must
be computed sequentially. This has nothing to do with the apparent order of the fields in the
JSON document. We can scramble the original file's key order and verify that
the execution plan is unchanged:
```json
> .init -f "example/homeworld-scrambled.json"
{
  "homeworldName": "${ homeworldDetails.name }",
  "lukePersonDetails": "${ $fetch('https://swapi.dev/api/people/?search=luke').json().results[0]}",
  "homeworldDetails": "${ $fetch(lukeHomeworldURL).json() }",
  "lukeHomeworldURL": "${ lukePersonDetails.homeworld }"
}
> .plan
[
  "/lukePersonDetails",
  "/lukeHomeworldURL",
  "/homeworldDetails",
  "/homeworldName"
]
```
Stated's DAG also understands the flow of data from any field outwards.
For example, let's see what will be recomputed if `homeWorldDetails`changes. The `.from` command
shows us that for an origin of `/homeworldDetails`, the DAG flows to `/homeworldName`
```json
> .init -f "example/homeworld-scrambled.json"
{
  "homeworldName": "${ homeworldDetails.name }",
  "lukePersonDetails": "${ $fetch('https://swapi.dev/api/people/?search=luke').json().results[0]}",
  "homeworldDetails": "${ $fetch(lukeHomeworldURL).json() }",
  "lukeHomeworldURL": "${ lukePersonDetails.homeworld }"
}
> .from /homeworldDetails
[
  "/homeworldDetails",
  "/homeworldName"
]
```


Let's compare this to it's equivalent in CNCF Serverless Workflows. As you can see, with no expression analyzer and
no internal DAG builder, the developer of a CNCF workflow must specify the states, and the transition between states. 
<details>
<summary>CNCF Serverless Workflow (click to expand...a lot)</summary>
<pre>
{
  "id": "starwars-luke-search",
  "version": "1.0",
  "name": "Star Wars API - Luke Search",
  "start": "Fetch Skywalker Details",
  "functions": [
    {
      "name": "getLukeSkywalkerDetails",
      "operation": "https://swapi.dev/api/people/?search={$.parameters.name}",
      "type": "rest",
      "metadata": {
        "method": "GET",
        "content-type": "application/json"
      }
    },
    {
      "name": "getHomeworldDetails",
      "operation": "https://{$.parameters.homeworld}",
      "type": "rest",
      "metadata": {
        "method": "GET",
        "content-type": "application/json"
      }
    }
  ],
  "states": [
    {
      "name": "Fetch Skywalker Details",
      "type": "operation",
      "actions": [
        {
          "functionRef": {
            "refName": "getLukeSkywalkerDetails",
            "arguments": {
              "name": "luke"
            }
          }
        }
      ],
      "transition": "Fetch Homeworld Details"
    },
    {
      "name": "Fetch Homeworld Details",
      "type": "operation",
      "actions": [
        {
          "functionRef": {
            "refName": "getHomeworldDetails",
            "arguments": {
              "homeworld": "${ .results[0].homeworld }"
            }
          }
        }
      ],
      "end": true
    }
  ]
}
</pre>

</details>

Stated alone is a powerful and concise workflow engine. So why do 
we need Stated-Workflows and what is it? Stated-Workflows is a set
of functions that provide integration with cloud events, and high
availability to workflows, when they are executed in the Stated-Workflows
clustered runtime.

# Job Concurrency
Job's can be run concurrently because each job's state is totally encapsulated 
in its template variables. The following JS code shows how to launch 10 jobs
in parallel.

```javascript
// This example uses the stated-js package to process a template that fetches
// Luke Skywalker's details and his homeworld information from the Star Wars API.
// It demonstrates initializing ten TemplateProcessor instances in parallel.

import TemplateProcessor from 'stated-js';

const template = {
  "lukePersonDetails": "${ $fetch('https://swapi.dev/api/people/?search=luke').json().results[0]}",
  "lukeHomeworldURL": "${ lukePersonDetails.homeworld }",
  "homeworldDetails": "${ $fetch(lukeHomeworldURL).json() }",
  "homeworldName": "${ homeworldDetails.name }"
};

async function runParallel(template, count) {
  const processors = Array.from({ length: count }, () => new TemplateProcessor(template));
  const initPromises = processors.map(tp => tp.initialize().then(() => tp));

  try {
    const initializedProcessors = await Promise.all(initPromises);
    initializedProcessors.forEach((tp, index) => {
      console.log(`Processor ${index + 1} output:`, tp.output);
      // Any additional logic for processor output can go here
    });
  } catch (error) {
    // Error handling can be implemented here
    console.error('Error initializing TemplateProcessors:', error);
  }
}

//run 10 templates in parallel
runParallel(template, 10)
        .then(() => console.log('All TemplateProcessors have been initialized.'))
        .catch(error => console.error(error));

```
# Internal Job Concurrency
let's modify our homeworlds example to make a concurrent homeworlds example. 
We have used the stated `!` operator to remove `personDetails` and `homeworldDetails` from the output to avoid clutter.
JSONata automatically makes array 
```json
> .init -f "example/concurrent-homeworlds.json"
{
  "people": [
    "luke",
    "han"
  ],
  "personDetails": "!${ people.$fetch('https://swapi.dev/api/people/?search='& $).json().results[0]}",
  "homeworldURLs": "${ personDetails.homeworld }",
  "homeworldDetails": "!${ homeworldURLs.$fetch($).json() }",
  "homeworldName": "${ homeworldDetails.name }"
}
> .set /people ["luke","han","leia"]
{
  "people": [
    "luke",
    "han",
    "leia"
  ],
  "homeworldURLs": [
    "https://swapi.dev/api/planets/1/",
    "https://swapi.dev/api/planets/22/",
    "https://swapi.dev/api/planets/2/"
  ],
  "homeworldName": [
    "Tatooine",
    "Corellia",
    "Alderaan"
  ]
}
```
# Durability
Up until now we have showed how to use pure Stated to build simple jobs. Pure Stated does not provide durability
or high availability. Stated-workflows adds
the dimension of _durability_ and _high-availability_ to template execution. To achieve these "ilities", Stated-workflows must
run in Stated-Workflow cluster. However, it is not necessary to run in a cluster to write, test, and debug 
Stated-Workflows locally. As long as you don't "unplug" the stated REPL, it will produce functionally the same result
as running in Stated-Workflow cluster. Stated-Workflows provides a "local cluster" option where you can test the 
_durability_ of stated workflows by unceremoniously "killing" the REPL and then restarting the workflow at a later time.

## Steps
Stated provides durability by defining the Step as the unit of durability. A step
is nothing more than a json object that has a field named 'function', that is a JSONata `function`
```json
{
  "function": "${ function($in){ $in + 42 } }"
}
```
Let's recast our homeworld example using Steps. This will give the Job durability, so that it 
can fail and be restarted. When a step function is called, the step's log is populated with 
an entry corresponding to a uniqe `invocationId` for the workflow. The log captures the `args` 
that were passed to the step function, as well the functions output (`out`).

![steps](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow%20-%20Page%202.svg)
WHen a workflow invocation completes, its logs are deleted from each step. Here we show invoking
the `homeworld-steps.json` workflow, with `--options` that preserve the logs of completed steps.
```json
> .init -f "example/homeworlds-steps.json" --options={"workflows":{"keepLogs":true}}
{
  "output": "${   ['luke', 'han']~>$map(workflow) }",
  "workflow": "${ function($person){$person~>$serial(steps)} }",
  "steps": [
    {
      "function": "${  function($person){$fetch('https://swapi.dev/api/people/?search='& $person).json().results[0]}   }"
    },
    {
      "function": "${  function($personDetail){$personDetail.homeworld}  }"
    },
    {
      "function": "${  function($homeworldURL){$homeworldURL.$fetch($).json() }  }"
    },
    {
      "function": "${  function($homeworldDetail){$homeworldDetail.name }  }"
    }
  ]
}
> .out
{
  "output": [
    "Tatooine",
    "Corellia"
  ],
  "steps": [
    {
      "function": "{function:}",
      "log": {
        "--ignore--": {
          "end": {
            "out": {
              "birth_year": "29BBY",
              "created": "2014-12-10T16:49:14.582000Z",
              "edited": "2014-12-20T21:17:50.334000Z",
              "eye_color": "brown",
              "films": [
                "https://swapi.dev/api/films/1/",
                "https://swapi.dev/api/films/2/",
                "https://swapi.dev/api/films/3/"
              ],
              "gender": "male",
              "hair_color": "brown",
              "height": "180",
              "homeworld": "https://swapi.dev/api/planets/22/",
              "mass": "80",
              "name": "Han Solo",
              "skin_color": "fair",
              "species": [],
              "starships": [
                "https://swapi.dev/api/starships/10/",
                "https://swapi.dev/api/starships/22/"
              ],
              "url": "https://swapi.dev/api/people/14/",
              "vehicles": []
            },
            "timestamp": "--timestamp--"
          },
          "start": {
            "args": "han",
            "timestamp": "--timestamp--"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "--ignore--": {
          "end": {
            "out": "https://swapi.dev/api/planets/22/",
            "timestamp": "--timestamp--"
          },
          "start": {
            "args": {
              "birth_year": "29BBY",
              "created": "2014-12-10T16:49:14.582000Z",
              "edited": "2014-12-20T21:17:50.334000Z",
              "eye_color": "brown",
              "films": [
                "https://swapi.dev/api/films/1/",
                "https://swapi.dev/api/films/2/",
                "https://swapi.dev/api/films/3/"
              ],
              "gender": "male",
              "hair_color": "brown",
              "height": "180",
              "homeworld": "https://swapi.dev/api/planets/22/",
              "mass": "80",
              "name": "Han Solo",
              "skin_color": "fair",
              "species": [],
              "starships": [
                "https://swapi.dev/api/starships/10/",
                "https://swapi.dev/api/starships/22/"
              ],
              "url": "https://swapi.dev/api/people/14/",
              "vehicles": []
            },
            "timestamp": "--timestamp--"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "--ignore--": {
          "end": {
            "out": {
              "climate": "temperate",
              "created": "2014-12-10T16:49:12.453000Z",
              "diameter": "11000",
              "edited": "2014-12-20T20:58:18.456000Z",
              "films": [],
              "gravity": "1 standard",
              "name": "Corellia",
              "orbital_period": "329",
              "population": "3000000000",
              "residents": [
                "https://swapi.dev/api/people/14/",
                "https://swapi.dev/api/people/18/"
              ],
              "rotation_period": "25",
              "surface_water": "70",
              "terrain": "plains, urban, hills, forests",
              "url": "https://swapi.dev/api/planets/22/"
            },
            "timestamp": "--timestamp--"
          },
          "start": {
            "args": "https://swapi.dev/api/planets/22/",
            "timestamp": "--timestamp--"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "--ignore--": {
          "end": {
            "out": "Corellia",
            "timestamp": "--timestamp--"
          },
          "start": {
            "args": {
              "climate": "temperate",
              "created": "2014-12-10T16:49:12.453000Z",
              "diameter": "11000",
              "edited": "2014-12-20T20:58:18.456000Z",
              "films": [],
              "gravity": "1 standard",
              "name": "Corellia",
              "orbital_period": "329",
              "population": "3000000000",
              "residents": [
                "https://swapi.dev/api/people/14/",
                "https://swapi.dev/api/people/18/"
              ],
              "rotation_period": "25",
              "surface_water": "70",
              "terrain": "plains, urban, hills, forests",
              "url": "https://swapi.dev/api/planets/22/"
            },
            "timestamp": "--timestamp--"
          }
        }
      }
    }
  ],
  "workflow": "{function:}"
}
```


## Example Workflows
### Simple workflow
 
```json
> .init -f "example/wf.yaml"
{
  "myWorkflow$": "function($e){\n    $e ~> $serial([step1, step2])\n}\n",
  "name": "nozzleWork",
  "start$": "$subscribe(subscribeParams, {})",
  "step1": {
    "function": "${function($e){ $e~>|$|{'primed':true}|  }}",
    "name": "primeTheNozzle"
  },
  "step2": {
    "function": "${function($e){ $e~>|$|{'sprayed':true}|  }}",
    "name": "sprayTheNozzle"
  },
  "subscribeParams": {
    "filter$": "function($e){ $e.name='nozzleTime' }",
    "parallelism": 2,
    "source": "cloudEvent",
    "subscriberId": "../${name}",
    "testData": "${  [1].([{'name': 'nozzleTime', 'order':$}])  }",
    "to": "../${myWorkflow$}",
    "type": "my-topic"
  }
}
```
The result will include logs for each invocation in the template itself.
<details>
<summary>Execution output</summary>

```json
> .out
{
  "start$": null,
  "name": "nozzleWork",
  "subscribeParams": {
    "source": "cloudEvent",
    "testData": [
      {
        "name": "nozzleTime",
        "order": 1
      }
    ],
    "type": "my-topic",
    "filter$": "{function:}",
    "to": "{function:}",
    "parallelism": 2,
    "subscriberId": "nozzleWork"
  },
  "myWorkflow$": "{function:}",
  "step1": {
    "name": "primeTheNozzle",
    "function": "{function:}",
    "log": {
      "--ignore--": {
        "start": {
          "timestamp": "--timestamp--",
          "args": {
            "name": "nozzleTime",
            "order": 1
          }
        },
        "end": {
          "timestamp": "--timestamp--",
          "out": {
            "name": "nozzleTime",
            "order": 1,
            "primed": true
          }
        }
      }
    }
  },
  "step2": {
    "name": "sprayTheNozzle",
    "function": "{function:}",
    "log": {
      "--ignore--": {
        "start": {
          "timestamp": "--timestamp--",
          "args": {
            "name": "nozzleTime",
            "order": 1,
            "primed": true
          }
        },
        "end": {
          "timestamp": "--timestamp--",
          "out": {
            "name": "nozzleTime",
            "order": 1,
            "primed": true,
            "sprayed": true
          }
        }
      }
    }
  }
}
```
</details>

### pubsub example
```json
> .init -f "example/pubsub.yaml"
{
  "produceParams": {
    "type": "my-topic",
    "testData": "${ [1..5].({'name': 'nozzleTime', 'rando': $random()})  }",
    "client": {
      "type": "test"
    }
  },
  "subscribeParams": {
    "source": "cloudEvent",
    "type": "/${ produceParams.type }",
    "to": "/${ function($e){( $set('/rxLog', rxLog~>$append($e)); )}  }",
    "subscriberId": "dingus",
    "initialPosition": "latest",
    "client": {
      "type": "test"
    }
  },
  "send$": "$setInterval(function(){$publish(produceParams)}, 100)",
  "recv$": "$subscribe(subscribeParams)",
  "rxLog": [],
  "stop$": "($count(rxLog)=5?($clearInterval(send$);'done'):'still going')"
}
```

<details>
<summary>Execution output</summary>

```json
.out
{
  "produceParams": {
    "type": "my-topic",
    "testData": [
      {
        "name": "nozzleTime",
        "rando": "--rando--"
      },
      {
        "name": "nozzleTime",
        "rando": "--rando--"
      },
      {
        "name": "nozzleTime",
        "rando": "--rando--"
      },
      {
        "name": "nozzleTime",
        "rando": "--rando--"
      },
      {
        "name": "nozzleTime",
        "rando": "--rando--"
      }
    ],
    "client": {
      "type": "test"
    }
  },
  "subscribeParams": {
    "source": "cloudEvent",
    "type": "my-topic",
    "to": "{function:}",
    "subscriberId": "dingus",
    "initialPosition": "latest",
    "client": {
      "type": "test"
    }
  },
  "send$": "--interval/timeout--",
  "recv$": null,
  "rxLog": [  
    {
      "name": "nozzleTime",
      "rando": "--rando--"
    },
    {
      "name": "nozzleTime",
      "rando": "--rando--"
    },
    {
      "name": "nozzleTime",
      "rando": "--rando--"
    },
    {
      "name": "nozzleTime",
      "rando": "--rando--"
    },
    {
      "name": "nozzleTime",
      "rando": "--rando--"
    }
  ],
  "stop$": "done"
}
```
</details>

# Workflow deployment model
Workflows can be run on any nodejs runtime, but suggested production deployment is using contaner-based orchestration 
such as Kubernetes. This repo provides a helm chart for deploying stated-workflow to Kubernetes.
TODO: provide the helm chart :) 
## Scalability
Stated workflow is designed to focus on IO-bound operations, and should scale fairly well within a single-process 
leveraging nodejs event loop. Each customer facing workflow will be consuming a single per-tenant per-type pulsar queue, 
and run serve a number of events with predefined parallelism for this workflow.

However, since each node will be performing a lot of IO-bound operations, each node process will be limited to a number
of workflows it can serve. 

For scaling beyond single node, we will leverage a message queue supporting exclusive access on per-event base with a 
timeout (such as Pulsar). Each node will have a process, which can start N workflow processes, and will be responsible 
to consuming new CDC events for tenant subscriptions to workflow, and persisting the list of the workflows in an orion
table. 
```text



    Node heartbeat status and                                                          Pulsar Sunscription Queue
    WF allocations                                                                            ┌──────┐
  ┌────────────────────────┐ ┌───────────────┐                                                │      │
  │                        │ │               │                                                │      │
  │ ┌────┬──────┬────────┐ │ │  ┌──────────┐ │                                                │T3WF4 │
  │ │node│h-beat│wf list │ │ │  │Tenant1WF1├─┼──Initial┼Reconcile────┐    ┌─CDC subscriptions─► ...  │
  │ ├────┼──────┼────────┤ │ │  │Tenant2WF1│ │                       │    │                   │ ...  │
  │ │ 0  │active│T1WF1,..│ │ │  │Tenant3WF2│ │             ┌─────────┼────┼────────┐          │T1WF3 │     ┌────────────────────────┐
  │ │ 1  │failed│T3WF4,..│ │ │  │Tenant1WF3│ │             │ Node0   │    │        │          │ ...  │     │ Node1                  │
  │ │    │      │        │ │ │  │   ...    │ │             │  ┌──────▼────┴────┐   │          │T2WF1 │     │                        │
  │ └───▲└───▲──┴────────┘ │ │  └──────────┘ │             │  │Consume kafka   │   │          │T1WF1 │     │                        │
  │     │    │             │ │               │ ┌───────────┼──►Domain Event Bus│   │          └┬───┬─┘     │                        │
  └─────┼────┼─────────────┘ └───────┬───────┘ │           │  │-> Pulsar CDC mq│   │           │   │       │                        │
        │    │                       │         │           │  ─────────────────┴   │           │   │       │                        │
        │    │                 ┌─────▼─────────┼───┐       │                       │           │   │       │                        │
        │    │                 │ Domain        │   │       │  ┌────────────────┐   │           │   │       │  ┌─────────────────┐   │
        │    │                 │ Event             │       │  │WF Manager      ◄───┼───────────┘   └───────┼─►│WF Manager       ├───┼────┐
        │    │                 │ Bus               │   ┌───┼──┤                │   │  takes N WF           │  │                 │   │    │
        │    │                 └───────────────────┘   │   │  └────────────────┘   │  subscriptions        │  └─────────────────┘   │    │
        │    │                                         │   │                       │                       │                        │    │
        │    │                                         │   │  ┌─────────────────┐  ├──Autoscale────────────┤►┌───────────────────┐  │    │
        │    └─────────────────────────────────────────┘   │  │T1WF1            │  │                       │ │T3WF4              │  │    │
        │                                                  │  └─────────────────┘  │   Auto-scale after    │ └───────────────────┘  │    │
        │                                                  │                       │   Node0 shows N       │                        │    │
        │                                                  │  ┌─────────────────┐  │   number of WFs       │         ...            │    │
        │                                                  │  │T2WF1            │  │   serving             │                        │    │
        │                                                  │  └─────────────────┘  │                       │                        │    │
        │                                                  │       ...             │                       │                        │    │
        │                                                  │       ...             │                       │                        │    │
        │                                                  │  ┌─────────────────┐  │                       │                        │    │
        │                                                  │  │T1WF3            │  │                       │                        │    │
        │                                                  │  └─────────────────┘  │                       │                        │    │
        │                                                  │                       │                       │                        │    │
        │                                                  └───────────────────────┘                       └────────────────────────┘    │
        │                                                                                                                                │
        │                                                                                                                                │
        └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘




 ```
## Workflow process
Workflow process is a nodejs process which is responsible for consuming events from an event source and processing them.

## Dispatcher 
The dispatcher is a nodejs workflow process which is responsible for consuming events from an event source and dispatching 
them to per-workflow queues, so it can be processed by the workflow process. This pattern is useful for ensuring that 
each workflow runs in its own event loop, and is not impacted by other workflows. 

## Building a continer

Build a container
```yaml
docker build -t my_workflow_image .
```

Run a workflow in your docker desktop
```yaml
docker run -e STATED_TEMPLATE="`cat example/pubsub.yaml`" my_workflow_image
```

# Event sources
## HTTP Rest Server
```yaml
subscribeParams: #parameters for subscribing to a http request
  source: http
  to: /${ function($e){(
    $console.log('received - ' & $string($e) );
    )}  }
  parallelism: 2
```
## Kafka Consumer
A single stated workflow process which reads data from a kafka topic (all partitions) and runs it within its event loop. 
This is a perfect model when a kafka topic emits a reasonable number of events, which are mostly IO bound. 
```yaml
subscribeParams: #parameters for subscribing to a cloud event
  source: KafkaConsumer 
  type: 'my-topic'
  # processing function to invoke on each event. 
  # TODO: explain how the function can be outside of subscribeParams in stated 
  to: /${ function($e){(
            $console.log('received - ' & $string($e) );
      )}  }
  # where to start processing from (TODO: add all options here)
  initialPosition: latest
```
## Pulsar Consumer
```yaml
subscribeParams: #parameters for subscribing to a cloud event
  source: PulsarConsumer
  type: 'my-topic'
  # processing function to invoke on each event.
  # TODO: explain how the function can be outside of subscribeParams in stated 
  to: /${ function($e){( 
            $console.log('received - ' & $string($e) );
            $set('/rxLog', rxLog~>$append($e));            
      )}  }
  # optional subscriberId (TODO: describe what will be default behavior)
  subscriberId: dingus
  # where to start processing from (TODO: add all options here)
  initialPosition: latest
```
# Workflow Functions available to a developer

This module provides a set of functions which can be used to implement a workflow


### `generateDateAndTimeBasedID()`

Generates a unique ID based on the current date, time, and a random string.

- **Returns:** A string with the format: `YYYY-MM-DD-TIME-RANDOM_PART`.

### `serial(input, steps, options)`

Executes a series of steps (functions) in sequence (serially).

- **Parameters:**
    - `input`: Initial data for the steps.
    - `steps`: Array of functions to be executed serially.
    - `options`: Configuration object for the execution.
- **Returns:** Output from the last step in the sequence.

### `parallel(initialInput, stages, log)`

Executes a series of stages (functions) in parallel.

- **Parameters:**
    - `initialInput`: Initial data for the stages.
    - `stages`: Array of functions to be executed in parallel.
    - `log`: Logging object for recording the function invocations.
- **Returns:** An array containing the results of each stage.

### `nextCloudEvent(subscriptionParams)`

Subscribes to a cloud event. If in test mode, it pushes the test data for execution. In a real-life scenario, it reads messages from Pulsar.

- **Parameters:**
    - `subscriptionParams`: Configuration parameters for subscription.

### `onHttp(subscriptionParams)`

Sets up an HTTP server and handles incoming HTTP requests based on the provided subscription parameters.

- **Parameters:**
    - `subscriptionParams`: Configuration parameters for the HTTP server.

### `subscribe(subscribeOptions)`

Subscribes to a source. The source could be `http`, `cloudEvent`, or `data`.

- **Parameters:**
    - `subscribeOptions`: Configuration options for the subscription.

### `pulsarPublish(params)`

Publishes data to a Pulsar topic.

- **Parameters:**
    - `params`: Configuration parameters containing `type` and `data` for publishing.

### `logFunctionInvocation(stage, args, result, error, log)`

Logs the invocation details of a function, including any errors.

- **Parameters:**
    - `stage`: Current stage or step being logged.
    - `args`: Arguments provided to the function.
    - `result`: Result returned from the function.
    - `error`: Error object, if any error occurred.
    - `log`: Logging object to store the logs.

