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
Stated flattens the DAG and executes it as a sequence of expressions called the `plan`. The example below illustrates how a plan executes a sequence of REST calls and transformations in an ordinary Stated
template. 
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

As 'luke' moves through the `plan` two REST calls are made, and no new inputs can enter. This is because Stated 
quees execution plans, allowing one to complete before the next can enter. This is a clean way to prevent 
concurrent state mutations, and works well for in-memory computation DAGs. We can see that long
running I/O operations, however, will bottleneck the template. If the template engine is shutdown, there is no way to 'restart'
the work where it left off.

# Stated Workflow Pipelines
Stated Workflows pipeline functions expand the purview of stated templates from fast-running compute graphs into the realm of I/O-heavy, 
long running, concurrent workflows:
 * _**Pipeline Functions**_ - Stated Workflows provide specific support for `$serial` and `$parallel` execution pipelines that can 
   be mixed together and safely run in parallel. Unlike an ordinary expression `plan`, `$serial` and `$parallel` are pipelined
   and nonblocking. As events arrive they can directly enter a `$serial` or `$parallel` without waiting. 
 * _**Durability**_ - Pipeline Functions (`$serial` and `parallel`) work with `--options={"snapshot":{...opts...}}` to 
   snapshot their state to various stores. Stated Workflows can be started from a snapshot, hence restoring all pipeline
   functions to their state at the time of the snapshot.
 * _**State Safety**_ pipelines cannot access template state except at their inputs and outputs. Pipeline functions pass
   data from one pipeline step to the next. This means that each invocation of a pipeline function is isolated.
 * _**Pub/Sub Connectors**_ in an ordinary Stated Template, changes are injected into the template, either by using the REPL, or 
  by building a program that utilizes the [TemplateProcessor API](https://cisco-open.github.io/stated/classes/TemplateProcessor.default.html).
  Stated Workflows provide direct access to `$publish` and `subscribe` functions that can dispatch into execution pipelines
  with any desired parallelism. Events are typically dispatched into `$serial` or `$parallel` pipelines to 
  combine concurrent execution with durability

## Non-blocking Event Driven
Stated-Workflows provides a set of functions that allow you to integrate with cloud events, consuming and producing from
Kafka or Pulsar message buses, as well as HTTP. Publishers and subscribers can be initialized with test data. This example,
`joinResistance.yaml`, generates URLS for members of the resistance, as test data.

```yaml
start: ${ $millis() }
# producer will be sending some test data
produceParams:
  type: "my-topic"
  data: ${['luke', 'han', 'leia', 'R2-D2', 'Owen', 'Biggs', 'Obi-Wan', 'Anakin', 'Chewbacca', 'Wedge'].('https://swapi.dev/api/people/?search='&$)}
  client:
    type: test
# the subscriber's 'to' function will be called on each received event
subscribeParams: #parameters for subscribing to an event
  source: cloudEvent
  type: /${ produceParams.type } # subscribe to the same topic as we are publishing to test events
  to: /${joinResistance}
  subscriberId: rebelArmy
  initialPosition: latest
  parallelism: 1
  client:
    type: test
joinResistance:  |
  /${ 
    function($url){(
        $rebel := $fetch($url).json().results[0].name; 
        $set( "/rebelForces/-", $rebel) /* append rebel to rebelForces */
    )}  
  }
# starts producer function
send$: $publish(produceParams)
# starts consumer function
recv$: $subscribe(subscribeParams)
# the subscriber's `to` function will write the received data here
rebelForces: [ ]
runtime: ${ (rebelForces; "Rebel forces assembled in " & $string($millis()-start) & " ms")}
```

Let's see how long it takes to run, using a parallelism of 1 in the subscriber as shown above:
```json ["$count(data)=10", "$~>$contains('Rebel forces assembled in')"]
> .init -f "example/joinResistance.yaml" --tail "/rebelForces until $~>$count=10"
Started tailing... Press Ctrl+C to stop.
[
"Luke Skywalker",
"Han Solo",
"Leia Organa",
"R2-D2",
"Owen Lars",
"Biggs Darklighter",
"Obi-Wan Kenobi",
"Anakin Skywalker",
"Chewbacca",
"Wedge Antilles"
]
> .out /runtime
"Rebel forces assembled in 3213 ms"
```
Now let's run a modified version where `subscribeParams` have `"parallelism": 5`
```json  ["$count(data)=10", "$~>$contains('Rebel forces assembled in')"]
> .init -f "example/joinResistanceFast.yaml" --tail "/rebelForces until $~>$count=10"
Started tailing... Press Ctrl+C to stop.
[
"Owen Lars",
"Han Solo",
"R2-D2",
"Leia Organa",
"Luke Skywalker",
"Chewbacca",
"Obi-Wan Kenobi",
"Wedge Antilles",
"Anakin Skywalker",
"Biggs Darklighter"
]
> .out /runtime
"Rebel forces assembled in 1529 ms"

```
The speedup for `joinResistanceFast.yaml` shows that the events are processed concurrently without any `plan` serialization.


## Atomic Updates
The example above used an atomic write primitive to update `/rebelForces`. Let's consider what happens if we don't use 
an atomic write primitive. 
```yaml
joinResistance:  |
  /${ 
    function($url){(
        $rebel := $fetch($url).json().results[0].name; 
        $set( "/rebelForces", $rebelForces~>$append($rebel)) /* BUG!! */
    )}  
  }
```
The last writer wins, and we get a [lost-update problem](https://medium.com/@bindubc/distributed-system-concurrency-problem-in-relational-database-59866069ca7c#:~:text=Lost%20Update%20Problem%3A&text=In%20simple%20words%2C%20when%20two,update%20of%20the%20first%20transaction.).
You can see below that using a naive update strategy to update `rebelForces` results in only one of the 10 names
appearing in the array. The argument `--tail "/rebelForces 10"` instructs tail to stop tailing after 10 changes. Each
of the concurrent pipeline invocations have updated the array, but only the last writer will win.
```json ["$count(data)=1"]
> .init -f "example/joinResistanceBug.yaml" --tail "/rebelForces 10"
Started tailing... Press Ctrl+C to stop.
"Wedge Antilles"
```
Stated Workflows provides an atomic primitive that prevents [lost-updates](https://medium.com/@bindubc/distributed-system-concurrency-problem-in-relational-database-59866069ca7c#:~:text=Lost%20Update%20Problem%3A&text=In%20simple%20words%2C%20when%20two,update%20of%20the%20first%20transaction.) 
with concurrent mutations of arrays.  It does this by using a
special JSON pointer defined by [RFC 6902 JSON Patch for appending to an array](https://datatracker.ietf.org/doc/html/rfc6902#appendix-A.16).
The `joinResistanceFast.yaml` example shows how to use the syntax: `$set( "/rebelForces/-", $rebel)`
to safely append to an array.
```yaml
joinResistance:  |
  /${ 
    function($url){(
        $rebel := $fetch($url).json().results[0].name; 
        $set( "/rebelForces/-", $rebel) /* append rebel to rebelForces */
    )}  
  }
```
Again we can show that `joinResistanceFast.yaml` produces the expected 10 results.
```json ["$count(data)=10", "$count(data)<10"]
> .init -f "example/joinResistanceFast.yaml" --tail "/rebelForces 10"
Started tailing... Press Ctrl+C to stop.
[
  "Owen Lars",
  "Han Solo",
  "R2-D2",
  "Luke Skywalker",
  "Leia Organa",
  "Chewbacca",
  "Obi-Wan Kenobi",
  "Wedge Antilles",
  "Anakin Skywalker",
  "Biggs Darklighter"
]

```

## Pure Function Pipelines - $serial and $parallel
Although stated provides the primitive for atomic updates, it's still advisable to avoid concurrent mutation. We tried
and true way to avoid shared state mutation is with pure functions like this, that only update shared state at the end
of the pipeline.
 ```json
function($x){ $x ~> f1 ~> f2 ~> f3 ~> function($x){$set('/saveResult/-', $x) } }
```
This pipeline can be concurrently dispatched safely. 

# Durability
Stated Workflows provides a `$serial` and a `$parallel` function that should be used when you want each stage of a concurrent
pipeline to be snapshotted to durable storage. The `stateflow` REPL provides a local persistence option, as well as 
pluggable snapshot persistence. 

## Workflow Step Logs
The `$serial` and `$parallel` functions accept an array of object called "steps". A step is nothing but an object with
a field named 'function'. A durable workflow is formed by passing an array of steps to `$serial` or `$parallel`, like this:
```json
{
  "out": "${ 'luke' ~> $serial([f1, f2])}",
  "f1": {
    "function": "${ function($in){ $in & ' skywalker' } }"
  },
  "f2": {
    "function": "${ function($in){ $in ~> $uppercase } }"
  }  
}
```
`$serial` and `$parallel` generate a unique invocation id like `2023-11-14-1699922094477-8e85`, each time they are invoked. 
The id is used as a log key. The logs are stored inside each step. 
```json
{
  "out": "${ $serial([f1, f2])}",
  "f1": {
    "function": "${ function($in){ $in + 1 } }",
    "log": {
      "2023-11-14-1699922094477-8e85": {
        "start": {
          "timestamp": 1699922094477,
          "args": "luke"
        },
        "end": {
          "timestamp": 1699922095809,
          "out": "luke skywalker"
        }
      }
    },
    "f2": {
      "function": "${ function($in){ $in * 2 } }"
    }
  }
}
```
When the step completes, its invocation log is removed. 
```json
{
  "out": "${ $serial([f1, f2])}",
  "f1": {
    "function": "${ function($in){ $in + 1 } }",
    "log": {}
   },
  "f2": {
    "function": "${ function($in){ $in * 2 } }",
    "log": {}
  }
}
```
## snapshots
Snapshots save the state of a stated template, repeatedly as it runs. Snapshotting allows a Stated Workflow to be stopped
non-gracefully, and restored from the snapshot. The step logs allow invocations to restart where they left off. 
```json
> .init -f "example/inhabitants.yaml" --options={"snapshot":{"seconds":1}}
{
  "produceParams": {
    "type": "my-topic",
    "data": "${[1..6].($fetch('https://swapi.dev/api/planets/?page=' & $string($)).json().results)}",
    "client": {
      "type": "test"
    }
  },
  "subscribeResidents": {
    "source": "cloudEvent",
    "type": "/${ produceParams.type }",
    "to": "/${ getResidentsWorkflow }",
    "subscriberId": "subscribeResidents",
    "parallelism": 4,
    "client": {
      "type": "test"
    }
  },
  "getResidentsWorkflow": {
    "function": "/${ function($planetInfo){ $planetInfo ~> $serial([extractResidents, fetchResidents]) }  }"
  },
  "extractResidents": {
    "function": "/${ function($planet){$planet.residents.($fetch($).json())}  }"
  },
  "fetchResidents": {
    "function": "/${ function($resident){$resident?$set('/residents/-',{'name':$resident.name, 'url':$resident.url})}  }"
  },
  "residents": [],
  "send$": "$publish(produceParams)",
  "recv$": "$subscribe(subscribeResidents)"
}

```
The `--options={"snapshot":{"seconds":1}}` causes a snapshot to be saved to `defaultSnapshot.json` once a
second. The snapshot is just an ordinary json file with two parts: `{"template":{...}, "output":{...}}`

```shell
cat defaultSnapshot.json
```

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


A template can be restored, and each of its invocations begins again, by loading the snapshot
...coming soon
