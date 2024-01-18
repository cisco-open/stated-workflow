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
stateflow
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
> .init -f "example/homeworlds-steps.json"
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
<summary>Execution output (click to expand)</summary>

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
        "2023-11-09-1699500721593-ok2z": {
          "start": {
            "timestamp": 1699500721593,
            "args": "luke"
          },
          "end": {
            "timestamp": 1699500723568,
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
        "2023-11-09-1699500725173-m7x6": {
          "start": {
            "timestamp": 1699500725173,
            "args": "han"
          },
          "end": {
            "timestamp": 1699500726505,
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
        "2023-11-09-1699500721593-ok2z": {
          "start": {
            "timestamp": 1699500723568,
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
            "timestamp": 1699500723568,
            "out": "https://swapi.dev/api/planets/1/"
          }
        },
        "2023-11-09-1699500725173-m7x6": {
          "start": {
            "timestamp": 1699500726505,
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
            "timestamp": 1699500726505,
            "out": "https://swapi.dev/api/planets/22/"
          }
        }
      }
    },
    {
      "function": "{function:}",
      "log": {
        "2023-11-09-1699500721593-ok2z": {
          "start": {
            "timestamp": 1699500723568,
            "args": "https://swapi.dev/api/planets/1/"
          },
          "end": {
            "timestamp": 1699500725173,
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
        "2023-11-09-1699500725173-m7x6": {
          "start": {
            "timestamp": 1699500726505,
            "args": "https://swapi.dev/api/planets/22/"
          },
          "end": {
            "timestamp": 1699500727297,
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
        "2023-11-09-1699500721593-ok2z": {
          "start": {
            "timestamp": 1699500725173,
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
            "timestamp": 1699500725173,
            "out": "Tatooine"
          }
        },
        "2023-11-09-1699500725173-m7x6": {
          "start": {
            "timestamp": 1699500727297,
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
            "timestamp": 1699500727297,
            "out": "Corellia"
          }
        }
      }
    }
  ]
}
```
</details>

# Error Handling
If a step function throws an `Error`, or returns `undefined`, the invocation log will contain a `fail`. In the 
example below we intentionally break the second step by concatenating "--broken--" to the homeword URL. 
```json
> .init -f "example/homeworlds-steps-error.json"
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
Note the
`fail` that occurs in logs for luke and han in the below execution output. Also note that the final fourth step contains no `start` entry as
$serial execution halts on fail.
<details>
<summary>Execution output (click to expand)</summary>

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

## retries
Each step can provide an optional boolean function `shouldRetry`, which should accept invocationLog argument. If it 
retruns trues, the function will be retried. 
```json
> .init -f example/homeworlds-steps-with-retry.json
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
json ["steps[2].log.*.retryCount = 1 and $not($exists(steps[2].log.*.fail))"]
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
