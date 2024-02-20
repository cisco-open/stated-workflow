![Stated-Workflows](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/stated-workflows.svg)

<!-- TOC -->
* [Overview](#overview)
  * [Getting Started](#getting-started)
    * [Installation](#installation)
    * [Running the REPL](#running-the-repl)
    * [Configuration](#configuration)
* [Stated Template Jobs](#stated-template-jobs-)
  * [Job Concurrency](#job-concurrency)
  * [Internal Job Concurrency](#internal-job-concurrency)
* [Stated Workflow Functions](#stated-workflow-functions)
  * [Cloud Events](#cloud-events)
  * [Durability](#durability)
  * [Workflow Step Logs](#workflow-step-logs)
  * [Error Handling](#error-handling)
    * [retries](#retries)
<!-- TOC -->

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
stateflow
```
The REPL will launch, allowing you to interact with the stated-js library. In order to launch properly you need to have
`node` on your path.`stateflow` is a wrapper script that simply calls `stated-workflow.js`, which contains this
`#!/usr/bin/env node --experimental-vm-modules`.

For example you can enter this command in the REPL:
```bash 
> .init -f "example/homeworld.json"
```

# Stated Templates
Ordinary [stated templates](https://github.com/cisco-open/stated?tab=readme-ov-file#stated) run a change graph called a
[DAG](https://github.com/cisco-open/stated?tab=readme-ov-file#dag). 
Stated flattens the DAG and executes it as a sequence of expressions called the `plan`. The following characteristics of an
ordinary stated data-flow `plan` are not optimized for long running I/O-bound 'workflows' in the traditional sense:
* _**Serialized Plan**_ - Stated templates serialize `plan` execution
  when multiple concurrent input changes occur. This guarantees data correctness and avoids the problem of shared-state
  that occurs when concurrent programs operate on the same data. When a `step` takes relatively long to run (like querying a REST service),
  (see [$setData](https://github.com/cisco-open/stated?tab=readme-ov-file#setting-values-in-the-stated-repl))
  concurrently arriving changes will cause their excution plans to queue. Which is why ordinary stated templates are geared toward local data computations,
  not I/O bound workflows.
* _**No Durability**_ - Stated templates provide no mechanism out of the box to persist or recover execution of 'in flight'
  plans. This is acceptable for local dataflow computations like dashboard expression calculation or config file generation
  but it is not acceptable for long-running, multi-step, high value workflows
* _**No connectors**_ - Stated templates do not provide out-of-box subscriptions for messaging systems such as kafka 
  and pulsar that can generate asynchronous inputs.

# Ordinary Templates: Exploring the problem
Let's review an ordinary template thaat tries to do something workflow-like. Here is an ordinary template that uses the Starwars API to search for Luke Skywalker's details,
extract the homeworld URL, retrieve the homeworld details, and extract the homeworld's name. This is a multi-step
I/O heavy workload that spends most of its time just waiting for HTTP responses.
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
![homeworld workflow](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow.svg)



## Batching of Data in the Plan's Steps
Let's look at what happens when we try to send a batch of data through the
template. In the example below we create a small batch of inputs called `people' defaulting `[luke, leia]` that will execute when the template loads.
Then we change the people batch using the command `.set /people ["luke","han","leia"]`

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
calling `.set /people ["luke","han","leia"]` causes a new plan to be queued. The plan will execute expressions
indicated by the JSON Pointers in the plan's array, in this order.

`[
"/lukePersonDetails",
"/lukeHomeworldURL",
"/homeworldDetails",
"/homeworldName"
]`

The image below shows each of the 4 plan steps, and shows that there is no pipelining. In other words, 'luke' does not
move through the plan stages, followed by `han`, followed by 'leia'. Instead, the batch `["luke","han","leia"]` moves 
as a unit. For example, in the diagram below we can see that all three personDetails must be fetched from three separate
SWAP REST API calls before the batch moves to the next stage. There is no pipelining. The plan will never have multiple open
REST calls to get person details at the same time as getting homeworld details. Lack of pipelining causes increased latency
and batching will increase the latency at each stage.

![](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow%20-%20Page%204.svg)
## Why are plan's serialized?
Consider the stated data flow template shown below
![serialized plan](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow%20-%20Page%205.svg)
A `dataChangeListener` registered on `/d`  (the final step of the plan) would be invoked once, with the expected output: 
'xx:xx+xx:xx*X'. Calling `.set /in "y"` will set `in` to `y`, re-execute the plan and produce a second deterministic output
`yy:yy+yy:yy*Y'

What would happen if we allowed overlapping plan execution? I.e., if instead of running only one plan at a time, we allowed a 
second arriving input, `y` to begin concurrently executing a plan before the prior plan had completed? Such a scenario is 
shown in the image below. As we can see, if the plans run concurrently the plan for `x` becomes corrupted with values introduced by `y`. 
The output for input `x` will be `xx:xx+xx:xx*Y`, a combination of x and y. This is wh

![serialized plan](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow%20-%20Page%206.svg)

You may see where this is going. As long as the steps of the plan are quick, in-memory evaluations, serializing plans in the 
node vm is quite efficient. However, what if the expression takes a very long time to run. For example, hitting a REST
service. You can immediately see why serialized plan execution will lead to very poor performance for plans that 
involve accessing the network, since there will be no pipelining or parallelism within the serialized plan execution.

but what would happe


How can we make data continuously flow through the template rather than passing batches through the plan in stages? And, 
since the template defines a discrete set of variables, and expressions can reference any of the fields, how do we prevent
concurrently mutating template state if we continuously apply a set of changes? 


# Stated Workflow Functions
Stated alone is a powerful and concise workflow engine. So why do
we need Stated-Workflows and what is it? Stated-Workflows is a set
of functions that provide integration with cloud events, concurrency, durability and high
availability to workflows.

## Cloud Events
Stated-Workflows provides a set of functions that allow you to integrate with cloud events, consuming and producing from
Kafka or Pulsar message buses, as well as HTTP. The following example shows how to use the `publish` and `subscribe`  
functions. Below producer and subscriber configs are using `test` clients, but `kafka` and `pulsar` clients can be used
to communicate with the actual message buses. Data for testing can be fed in by setting the `data` field of the `produceParams`.
As shown below, the test data is set to `['luke', 'han', 'leia']`. The subscriber's `to` function, `joinResistance`, appends
each received rebel to the `rebelForces` array.

```yaml
falken$> cat example/pubsub.yaml
# producer will be sending some test data
produceParams:
  type: "my-topic"
  data: ['luke', 'han', 'leia']
  client:
    type: test
# the subscriber's 'to' function will be called on each received event
subscribeParams: #parameters for subscribing to an event
  source: cloudEvent
  type: /${ produceParams.type } # subscribe to the same topic as we are publishing to test events
  to: /${joinResistance}
  subscriberId: rebelArmy
  initialPosition: latest
  client:
    type: test
joinResistance:  /${ function($rebel){ $set('/rebelForces', rebelForces~>$append($rebel))}  }
# starts producer function
send$: $publish(produceParams)
# starts consumer function
recv$: $subscribe(subscribeParams)
# the subscriber's `to` function will write the received data here
rebelForces: [ ]
````
We can use the REPL to run the pubsub.yaml example, and monitor the `/rebelForces` by tailing it until it contains all
three of the published messages.
```json ["data=['luke', 'han', 'leia']"]
> .init -f "example/pubsub.yaml" --tail "/rebelForces until $=['luke', 'han', 'leia']"
Started tailing... Press Ctrl+C to stop.
[
"luke",
"han",
"leia"
]

```



## Durability
Stated Workflows provide durability. This means a workflow can crash and restart, and will run to completion. Some steps that
have started, but not ended at the time of the crash, will be restarted. 

## Workflow Step Logs
Stated Workflow provides durability by defining the Step as the unit of durability. A step
is nothing more than a json object that has a field named 'function', that is a JSONata `function`
```json
{
  "function": "${ function($in){ $in + 42 } }"
}
```
Once the workflow begins running, every time your step's function is called,  

Let's recast our homeworld example using Steps. Now each step is its own object where invocation logs can be stored.
Waring: the `keepLogs` option causes all invocation logs to be retained. This should be done only for illustrative
purposes. I.E so *you* can see the logs for yourself when learning Stated Workflows. Logs grow without bound with `keepLogs`
enabled and would eventually absorb all available memory.
```json
> .init -f "example/homeworlds-steps.json" --options={"keepLogs":true}
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
```
By encapsulating your step function in an object, you provide a home for stated to store invocation logs for the
step. When stated runs your function it uses the step object in the template `output` as both a Write Ahead Log (WAL) that records the `start`
of your idempotent function, and a response, `end`,  from your function. When a step function is called, the step's log is populated with
an entry corresponding to a unique `invocationId` for the workflow. For example, our homeworlds example will contain an log like this for
its first step. Every step will contain a log, partitioned by invocation ids. Notice how `log` is now present next to the step's `function`:
```json
{
  "function": "{function:}",
  "log": {
    "2023-11-14-1699922094477-8e85": {
      "start": {
        "timestamp": 1699922094477,
        "args": "luke"
      },
      "end": {
        "timestamp": 1699922095809,
        "out": {
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
        }
      }
    }
  }
}

```
This unique approach to maintaining workflow state as a visible, transparent part of the template output
make it easy for Stated Workflows to provide snapshotting and restoration. Once a snapshot has been
persisted, the step logs that were persisted are removed from the runtime instance. This prevents log volume
from growing without bound.


The steo logs will give the Job durability, so that it
can fail and be restarted. In the diagram below, the tables on the right side represent two potentially
concurrent flows of execution through the graph, each with a different invocationId. Each table represents
a visualiation of the corresponding Step's log. On the left side we follow the execution through the 
graph for invocationId `2083-11-02-166741648653-x0yv`

![steps](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/homeworld-workflow%20-%20Page%202.svg)
The `maxLogs` option controls how many `invocationId` logs are kept in each step. The default value is 10. Combining 
this option with `snapshot` options allows Stated Workflows to persist a snapshot that you can restart from like a regular template. 
```json
> .init -f "example/homeworlds-steps.json" --options={"keepLogs":true}
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
```

<details>
<summary>Execution output with keepLogs enabled (click to expand)</summary>

```json ["output=['Tatooine','Corellia']"]
> .out
{
  "output": [
    "Tatooine",
    "Corellia"
  ],
  "workflow": "{function:}",
  "steps": [
    {
      "function": "{function:}",
      "log": {
        "2024-01-25-1706159105500-40ff": {
          "start": {
            "timestamp": 1706159105500,
            "args": "luke"
          },
          "end": {
            "timestamp": 1706159106777,
            "out": {
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
            }
          }
        },
        "2024-01-25-1706159108206-se1m": {
          "start": {
            "timestamp": 1706159108206,
            "args": "han"
          },
          "end": {
            "timestamp": 1706159109303,
            "out": {
              "name": "Han Solo",
              "height": "180",
              "mass": "80",
              "hair_color": "brown",
              "skin_color": "fair",
              "eye_color": "brown",
              "birth_year": "29BBY",
              "gender": "male",
              "homeworld": "https://swapi.dev/api/planets/22/",
              "films": [
                "https://swapi.dev/api/films/1/",
                "https://swapi.dev/api/films/2/",
                "https://swapi.dev/api/films/3/"
              ],
              "species": [],
              "vehicles": [],
              "starships": [
                "https://swapi.dev/api/starships/10/",
                "https://swapi.dev/api/starships/22/"
              ],
              "created": "2014-12-10T16:49:14.582000Z",
              "edited": "2014-12-20T21:17:50.334000Z",
              "url": "https://swapi.dev/api/people/14/"
            }
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2024-01-25-1706159105500-40ff": {
          "start": {
            "timestamp": 1706159106777,
            "args": {
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
            }
          },
          "end": {
            "timestamp": 1706159106778,
            "out": "https://swapi.dev/api/planets/1/"
          }
        },
        "2024-01-25-1706159108206-se1m": {
          "start": {
            "timestamp": 1706159109304,
            "args": {
              "name": "Han Solo",
              "height": "180",
              "mass": "80",
              "hair_color": "brown",
              "skin_color": "fair",
              "eye_color": "brown",
              "birth_year": "29BBY",
              "gender": "male",
              "homeworld": "https://swapi.dev/api/planets/22/",
              "films": [
                "https://swapi.dev/api/films/1/",
                "https://swapi.dev/api/films/2/",
                "https://swapi.dev/api/films/3/"
              ],
              "species": [],
              "vehicles": [],
              "starships": [
                "https://swapi.dev/api/starships/10/",
                "https://swapi.dev/api/starships/22/"
              ],
              "created": "2014-12-10T16:49:14.582000Z",
              "edited": "2014-12-20T21:17:50.334000Z",
              "url": "https://swapi.dev/api/people/14/"
            }
          },
          "end": {
            "timestamp": 1706159109308,
            "out": "https://swapi.dev/api/planets/22/"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2024-01-25-1706159105500-40ff": {
          "start": {
            "timestamp": 1706159106781,
            "args": "https://swapi.dev/api/planets/1/"
          },
          "end": {
            "timestamp": 1706159108189,
            "out": {
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
            }
          }
        },
        "2024-01-25-1706159108206-se1m": {
          "start": {
            "timestamp": 1706159109313,
            "args": "https://swapi.dev/api/planets/22/"
          },
          "end": {
            "timestamp": 1706159111220,
            "out": {
              "name": "Corellia",
              "rotation_period": "25",
              "orbital_period": "329",
              "diameter": "11000",
              "climate": "temperate",
              "gravity": "1 standard",
              "terrain": "plains, urban, hills, forests",
              "surface_water": "70",
              "population": "3000000000",
              "residents": [
                "https://swapi.dev/api/people/14/",
                "https://swapi.dev/api/people/18/"
              ],
              "films": [],
              "created": "2014-12-10T16:49:12.453000Z",
              "edited": "2014-12-20T20:58:18.456000Z",
              "url": "https://swapi.dev/api/planets/22/"
            }
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2024-01-25-1706159105500-40ff": {
          "start": {
            "timestamp": 1706159108190,
            "args": {
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
            }
          },
          "end": {
            "timestamp": 1706159108197,
            "out": [
              "/output/-"
            ]
          }
        },
        "2024-01-25-1706159108206-se1m": {
          "start": {
            "timestamp": 1706159111221,
            "args": {
              "name": "Corellia",
              "rotation_period": "25",
              "orbital_period": "329",
              "diameter": "11000",
              "climate": "temperate",
              "gravity": "1 standard",
              "terrain": "plains, urban, hills, forests",
              "surface_water": "70",
              "population": "3000000000",
              "residents": [
                "https://swapi.dev/api/people/14/",
                "https://swapi.dev/api/people/18/"
              ],
              "films": [],
              "created": "2014-12-10T16:49:12.453000Z",
              "edited": "2014-12-20T20:58:18.456000Z",
              "url": "https://swapi.dev/api/planets/22/"
            }
          },
          "end": {
            "timestamp": 1706159111232,
            "out": [
              "/output/-"
            ]
          }
        }
      }
    }
  ]
}
```
</details>

## Error Handling
If a step function throws an `Error`, or returns `undefined`, the invocation log will contain a `fail`. In the
example below we intentionally break the second step by concatenating "--broken--" to the homeword URL.
```json
> .init -f "example/homeworlds-steps-error.json" --options={"keepLogs":true}
{
  "output": "${   ['luke', 'han']~>$map(workflow) }",
  "workflow": "${ function($person){$person~>$serial(steps)} }",
  "steps": [
    {
      "function": "${  function($person){$fetch('https://swapi.dev/api/people/?search='& $person).json().results[0]}   }"
    },
    {
      "function": "${  function($personDetail){$personDetail.homeworld & '--broken--'}  }"
    },
    {
      "function": "${  function($homeworldURL){$fetch($homeworldURL).json() }  }"
    },
    {
      "function": "${  function($homeworldDetail){$homeworldDetail.name }  }"
    }
  ]
}
```
Note the `fail` that occurs in logs for luke and han in the below execution output. Also note that the final fourth step
contains no `start` entry as $serial execution halts on fail.

<details>
<summary>Execution output with keepLogs enabled (click to expand)</summary>

```json ["steps[2].log.*.fail ~> $count = 2"]
> .out
{
  "output": null,
  "workflow": "{function:}",
  "steps": [
    {
      "function": "{function:}",
      "log": {
        "2023-11-14-1699923328135-1dsf": {
          "start": {
            "timestamp": 1699923328136,
            "args": "luke"
          },
          "end": {
            "timestamp": 1699923329596,
            "out": {
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
            }
          }
        },
        "2023-11-14-1699923330297-49lm": {
          "start": {
            "timestamp": 1699923330297,
            "args": "han"
          },
          "end": {
            "timestamp": 1699923331417,
            "out": {
              "name": "Han Solo",
              "height": "180",
              "mass": "80",
              "hair_color": "brown",
              "skin_color": "fair",
              "eye_color": "brown",
              "birth_year": "29BBY",
              "gender": "male",
              "homeworld": "https://swapi.dev/api/planets/22/",
              "films": [
                "https://swapi.dev/api/films/1/",
                "https://swapi.dev/api/films/2/",
                "https://swapi.dev/api/films/3/"
              ],
              "species": [],
              "vehicles": [],
              "starships": [
                "https://swapi.dev/api/starships/10/",
                "https://swapi.dev/api/starships/22/"
              ],
              "created": "2014-12-10T16:49:14.582000Z",
              "edited": "2014-12-20T21:17:50.334000Z",
              "url": "https://swapi.dev/api/people/14/"
            }
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2023-11-14-1699923328135-1dsf": {
          "start": {
            "timestamp": 1699923329596,
            "args": {
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
            }
          },
          "end": {
            "timestamp": 1699923329596,
            "out": "https://swapi.dev/api/planets/1/--broken--"
          }
        },
        "2023-11-14-1699923330297-49lm": {
          "start": {
            "timestamp": 1699923331417,
            "args": {
              "name": "Han Solo",
              "height": "180",
              "mass": "80",
              "hair_color": "brown",
              "skin_color": "fair",
              "eye_color": "brown",
              "birth_year": "29BBY",
              "gender": "male",
              "homeworld": "https://swapi.dev/api/planets/22/",
              "films": [
                "https://swapi.dev/api/films/1/",
                "https://swapi.dev/api/films/2/",
                "https://swapi.dev/api/films/3/"
              ],
              "species": [],
              "vehicles": [],
              "starships": [
                "https://swapi.dev/api/starships/10/",
                "https://swapi.dev/api/starships/22/"
              ],
              "created": "2014-12-10T16:49:14.582000Z",
              "edited": "2014-12-20T21:17:50.334000Z",
              "url": "https://swapi.dev/api/people/14/"
            }
          },
          "end": {
            "timestamp": 1699923331417,
            "out": "https://swapi.dev/api/planets/22/--broken--"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2023-11-14-1699923328135-1dsf": {
          "start": {
            "timestamp": 1699923329596,
            "args": "https://swapi.dev/api/planets/1/--broken--"
          },
          "fail": {
            "error": {
              "position": null,
              "token": "json"
            },
            "timestamp": 1699923330296
          },
          "retryCount": 0
        },
        "2023-11-14-1699923330297-49lm": {
          "start": {
            "timestamp": 1699923331417,
            "args": "https://swapi.dev/api/planets/22/--broken--"
          },
          "fail": {
            "error": {
              "position": null,
              "token": "json"
            },
            "timestamp": 1699923332071
          },
          "retryCount": 0
        }
      }
    },
    {
      "function": "{function:}"
    }
  ]
}
```
</details>

### retries
Each step can provide an optional boolean function `shouldRetry`. On a workflow invocation failure the function will be
called with an invocation log passed as an argument. If the function returns true, the function will be retried.
The invocatiopn log contains a `retryCount` field that can be used to limit the number of retries.

The following example shows how to use the `shouldRetry` function to retry a step 4 times before failing.
```json
> .init -f example/homeworlds-steps-with-retry.json --options={"keepLogs":true}
{
  "output": "${   ['luke']~>$map(workflow) }",
  "workflow": "${ function($person){$person~>$serial(steps)} }",
  "connectionError": true,
  "steps": [
    {
      "function": "${  function($person){$fetch('https://swapi.dev/api/people/?search='& $person).json().results[0]}   }"
    },
    {
      "function": "${  function($personDetail){$personDetail.homeworld }  }"
    },
    {
      "function": "/${ function($homeworldURL){ ($url := connectionError ? $homeworldURL & '--broken--' : $homeworldURL ; $set('/connectionError', $not(connectionError)); $fetch($url).json(); ) }  }",
      "shouldRetry": "${  function($log){ $log.end ? false : $log.retryCount < 4 }  }"
    },
    {
      "function": "${  function($homeworldDetail){$homeworldDetail.name }  }"
    }
  ]
}
```

<details>
<summary>Execution output (click to expand)</summary>

```json ["steps[2].log.*.retryCount = 1 and $not($exists(steps[2].log.*.fail))"]
> .out
{
  "output": "Tatooine",
  "workflow": "{function:}",
  "connectionError": true,
  "steps": [
    {
      "function": "{function:}",
      "log": {
        "2023-11-14-1699922094477-8e85": {
          "start": {
            "timestamp": 1699922094477,
            "args": "luke"
          },
          "end": {
            "timestamp": 1699922095809,
            "out": {
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
            }
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2023-11-14-1699922094477-8e85": {
          "start": {
            "timestamp": 1699922095809,
            "args": {
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
            }
          },
          "end": {
            "timestamp": 1699922095809,
            "out": "https://swapi.dev/api/planets/1/"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "shouldRetry": "{function:}",
      "log": {
        "2023-11-14-1699922094477-8e85": {
          "start": {
            "timestamp": 1699922095809,
            "args": "https://swapi.dev/api/planets/1/"
          },
          "retryCount": 1,
          "end": {
            "timestamp": 1699922097891,
            "out": {
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
            }
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2023-11-14-1699922094477-8e85": {
          "start": {
            "timestamp": 1699922097891,
            "args": {
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
            }
          },
          "end": {
            "timestamp": 1699922097891,
            "out": "Tatooine"
          }
        }
      }
    }
  ]
}
```
</details>
