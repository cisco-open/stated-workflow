![Stated-Workflows](https://raw.githubusercontent.com/geoffhendrey/jsonataplay/main/stated-workflows.svg)

<!-- TOC -->
* [Overview](#overview)
  * [Getting Started](#getting-started)
    * [Installation](#installation)
    * [Running the REPL](#running-the-repl)
* [Why Not Ordinary Stated Templates?](#why-not-ordinary-stated-templates)
* [Stated Workflow Pipelines](#stated-workflow-pipelines)
  * [Concurrent, Event Driven, Non-blocking](#concurrent-event-driven-non-blocking)
  * [Atomic State Updates](#atomic-state-updates)
  * [Pure Function Pipelines - $serial and $parallel](#pure-function-pipelines---serial-and-parallel)
* [Pub/Sub Clients Configuration](#pubsub-clients-configuration)
  * [Test Data](#test-data)
  * [Dispatcher mode](#dispatcher-mode)
* [Durability](#durability)
  * [Pub/Sub durability models](#pubsub-durability-models)
    * [Test Client Durability](#test-client-durability)
    * [Pulsar Client Durability](#pulsar-client-durability)
    * [Kafka Client Durability](#kafka-client-durability)
  * [Workflow Step Logs](#workflow-step-logs)
  * [Workflow snapshots](#workflow-snapshots)
* [retries](#retries)
* [Workflow APIs](#workflow-apis)
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

# Why Not Ordinary Stated Templates?
Ordinary [stated templates](https://github.com/cisco-open/stated?tab=readme-ov-file#stated) run a change graph called a
[DAG](https://github.com/cisco-open/stated?tab=readme-ov-file#dag). 
Stated flattens the DAG and executes it as a sequence of expressions called the `plan`. The example below illustrates how a plan executes a sequence of REST calls and transformations in an ordinary Stated
template. 
```json
> .init -f "example/homeworld.json"
{
  "lukePersonDetails": "${ $fetch('https://swapi.tech/api/people/?name=luke').json().result[0].properties}",
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
queues execution plans, allowing one to complete before the next can enter. This is a clean way to prevent 
concurrent state mutations, and works well for in-memory computation DAGs. We can see that long
running I/O operations, however, will bottleneck the template. If the template engine is shutdown, there is no way to 'restart'
the work where it left off. We can see that for "workflows", which implies lots of I/O, and hence longer runtimes, we 
need a way to address these concerns.

# Stated Workflow Pipelines
Stated Workflows solves these problems in order to provide a suitable runtime for long-running, I/O heavy workflows:
 * _**Concurrent, Event Driven, Non-blocking**_ - Stated Workflows provide specific support for `$serial` and `$parallel` execution pipelines that can 
   be mixed together and safely run in parallel. Unlike an ordinary expression `plan`, `$serial` and `$parallel` are pipelined
   and nonblocking. As events arrive they can directly enter a `$serial` or `$parallel` without waiting. 
 * _**Atomic State Updates**_ - An atomic state update operator allows concurrent pipelies to avoid Lost Updates.
 * _**Durability**_ - Pipeline Functions (`$serial` and `parallel`) work with `--options={"snapshot":{...opts...}}` to 
   snapshot their state to various stores. Stated Workflows can be started from a snapshot, hence restoring all pipeline
   functions to their state at the time of the snapshot.
 * _**Pub/Sub Connectors**_ - Stated Workflows provide direct access to `$publish` and `subscribe` functions that can 
     dispatch events into execution pipelines with any desired parallelism. A simple change to the subscriber configuration
     allows your workflow to operate against Kafka, Pulsar, and other real-world messaging systems.

## Concurrent, Event Driven, Non-blocking
Stated-Workflows provides a set of functions that allow you to integrate with cloud events, consuming and producing from
Kafka or Pulsar message buses, as well as HTTP. Publishers and subscribers can be initialized with test data. This example,
`joinResistance.yaml`, generates URLS for members of the resistance, as test data. The data URLs are then published as 
events and dispatched to a subscriber with a settable `parallelism` factor. The subscriber `$fetches` the URL and extracts
the Star Wars character's full name from the REST response.

```yaml
start: ${ (produceParams.data; $millis()) } #record start time, after test dataset has been computed
# producer will be sending some test data
produceParams:
  type: "my-topic"
  client:
    type: test
    data: ${['luke', 'han', 'leia', 'R2-D2', 'Owen', 'Biggs', 'Obi-Wan', 'Anakin', 'Chewbacca', 'Wedge'].('https://swapi.tech/api/people/?search='&$)}
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
The runtime reflects the fact that `parallelism:1` causes the REST calls to happen in serial. Now let's run a modified 
version where `subscribeParams` have `"parallelism": 10`. We should expect a speedup because there should be as many as
10 concurrent REST calls.
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
"Rebel forces assembled in 775 ms"

```
Notice that the order of elements in `/rebelForces` is not the same as their order in the input data, reflecting the fact
that we have 10 concurrent events being processed. The speedup for `joinResistanceFast.yaml` shows that many REST calls
are happening in parallel. The `$parallelism` factor provides backpressure into the messaging system such as kafka which prevents the number of 
'in flight' events from exceeding the `$parallism` factor.

## Atomic State Updates
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
As we showed earlier, both `joinResistance.yaml` and  `joinResistanceFast.yaml` produce the expected 10 results. 
Let's consider what happens if we don't use an atomic write primitive. Instead, we will read the value of the `$rebelForces`
array and append $rebel to it, in order to illustrate the dangers of the well-known  [lost-update problem](https://medium.com/@bindubc/distributed-system-concurrency-problem-in-relational-database-59866069ca7c#:~:text=Lost%20Update%20Problem%3A&text=In%20simple%20words%2C%20when%20two,update%20of%20the%20first%20transaction.).
```yaml
joinResistance:  |
  /${ 
    function($url){(
        $rebel := $fetch($url).json().results[0].name;
        $set( "/rebelForces", $rebelForces~>$append($rebel)) /* BUG!! */
    )}  
  }
```
This type of update, where you read a value, mutate it, write it back is a classic example of the
[lost-update problem](https://medium.com/@bindubc/distributed-system-concurrency-problem-in-relational-database-59866069ca7c#:~:text=Lost%20Update%20Problem%3A&text=In%20simple%20words%2C%20when%20two,update%20of%20the%20first%20transaction.).
Each of the concurrent pipeline invocations read the array, update it in memory, and write the result. 
The problem is they all read, concurrently, the same initial value which is an empty array.
You can see below that using a naive update strategy to update `rebelForces` results in only one of the 10 names
appearing in the array.
```json ["$count(data)=1"]
> .init -f "example/joinResistanceBug.yaml" --tail "/rebelForces 10"
Started tailing... Press Ctrl+C to stop.
"Wedge Antilles"
```
This explains why you should use the "dash syntax", like `/rebelForces/-` to append an element to an array which is 
a safe operation to perform concurrently.

## Pure Function Pipelines - $serial and $parallel
A tried and true strategy for avoiding concurrent state mutation is to use pure functions like this, that pipeline the
output of function to the input to the next. If it is necessary to update shared state, it can be done at the end of the
pipeline, or at any point in between using atomic state mutations, like this.
 ```json
function($x){ $x ~> f1 ~> f2 ~> f3 ~> function($x){$set('/saveResult/-', $x) } }
```
This pipeline can be concurrently dispatched safely. 

# Pub/Sub Clients Configuration
Stated Workflow comes with built-in HTTP, Pulsar, Kafka, Dispatcher and Test clients for cloudEvent subscribe command. Each client
implements its own durability model.

## Test Data
Test clients for publisher and subscriber can be used to develop and test workflows. Test publisher may include `testData` array of data 
to send it directly to test subscriber dispatcher with acknowledgement in the template.

Example snippets from `example/joinResistanceRecovery.yaml` template.
```yaml
produceParams:
  type: "rebelDispatch"
  client:
    type: test # test client produces directly to the test subscriber dispatcher
    testData: ['luke', 'han', 'leia'] # test producer only makes sense when it includes test data
subscribeParams: #parameters for subscribing to an event
  source: cloudEvent
  type: /${ produceParams.type } # subscribe to the same topic as we are publishing to test events
  to: /${saveRebelWorkflow}
  subscriberId: rebelArmy
  initialPosition: latest
  parallelism: 1
  client:
    type: test
    data: ['obi-wan'] # test subscriber may include test data to run without a producer 
    acks: [] # if the acks are present in client: type: test, then the subscriber will be storing acknowledgement in this field
```

## Dispatcher mode
When subscriber client type is set to `dispatcher` or `test`, it will be running the workflow and expecting an external process to add data. 

# Durability
Stated Workflows provides a `$serial` and a `$parallel` function that should be used when you want to run continuous 
workflow with data coming from a HTTP or cloudEvent sources. Each workflow invocation input and step processing logs are 
persisted in the template in the beginning of step invocation and in the end. When the workflow is finished, the logs 
are removed. Periodic snapshots include TemplateProcessor template, output and options, and can be used to recover 
workflow processing from the last snapshotted state. 

StatedREPL `restore` command can be used to recover the template execution from a snapshot. 

## Pub/Sub durability models
Pub/Sub clients implement its own durability model. Pulsar and Kafka use server side acknowledgement to ensure that the message is not lost. Test client uses a simple 
acknowledgement in the template. HTTP client blocks the synchronous HTTP response until the first step persist.

### Test Client Durability
To develop and test workflows with the test client adding `acks` field will enable test acknowledgements in the client. Messages processed by 
the workflow will be added to the `acks` array.
```
  client:
    type: test
    data: ['obi-wan'] # test subscriber may include test data to run without a producer 
    acks: [] # if the acks are present in client: type: test, then the subscriber will be storing acknowledgement in this field
```

### Pulsar Client Durability
Pulsar pub/sub relies on server side acknowledgement, similar to the test data. On failure or restart, the subscriber 
will continue from the next unacknowledged message, and will skip steps already completed in the restored workflow 
snapshot.

### Kafka Client Durability
Kafka can rely on the consumer group commited offset. For parallelism greater than 1, the subscriber will be storing 
all unacknowledged messages and calculating the lowest offset to be commited. A combination of snapshotted stated and 
kafka server side consumer offset helps to minimize double-processing of already processed steps.

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
When a step completes, its invocation log is removed. 
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
The `$serial` and `$parallel` functions understand the logs. When a template is restored from a snapshot, `$serial` and 
`$parallel` use these logs to skip completed steps and resume their work at the last incomplete step in every invocation log.

## Workflow snapshots
Snapshots save the state of a stated template, repeatedly as it runs. Snapshotting allows a Stated Workflow to be stopped
non-gracefully, and restored from the snapshot. The step logs allow invocations to restart where they left off.  

`example/joinResistanceRecovery.yaml` shows a workflow with 2 serial steps - `fetchRebel` and `saveRebel`. The `saveRebel` step is design to 
fail after processing the first rebel to demonstrate how snapshot, restore, and step logs work. 

The `--options={"snapshot":{"seconds":1}}` option causes a snapshot to be saved to`defaultSnapshot.json` once a second 
(use `path` to change the snapshot file location, i.e. 
`--options={"snapshot":{"seconds":1, "path":"./example/resistanceSnapshot.json"}}`).  

Below command will start the workflow and tail the output until `simulateFailure` expression will be set to false.
```json ["$count(data.rebels)=1"]
> .init -f "example/joinResistanceRecovery.yaml" --options={"snapshot":{"seconds":1}} --tail "/ until $$.simulateFailure=false"
{
  "start": "${ (produceParams.data; $millis()) }",
  "produceParams": {
    "type": "rebelDispatch",
    "data": [
      "luke",
      "han",
      "leia"
    ],
    "client": {
      "type": "test"
    }
  },
  "subscribeParams": {
    "source": "cloudEvent",
    "type": "/${ produceParams.type }",
    "to": "/${saveRebelWorkflow}",
    "subscriberId": "rebelArmy",
    "initialPosition": "latest",
    "parallelism": 1,
    "acks": [],
    "client": {
      "type": "test"
    }
  },
  "saveRebelWorkflow": {
    "function": "/${ \n  function($rebel){ \n    $rebel ~> $serial(\n      [fetchRebel, saveRebel],\n      {'workflowInvocation': $rebel} \n    ) }  }\n"
  },
  "fetchRebel": {
    "function": "/${ \n  function($rebel){(\n    $console.debug('fetchRebel input: ' & $rebel);\n    $r := $rebel.$fetch('https://swapi.tech/api/people/?name='&$).json().result[0].properties;\n    $console.debug('fetchRebel fetched: ' & $r);  \n    $set('/fetchLog/-',$rebel);\n    $console.debug('logged fetch: ' & $r);\n    $r;\n  )}  \n}\n"
  },
  "saveRebel": {
    "function": "/${ \n  function($rebel){(\n    $console.debug('saveRebel input: ' & $rebel);\n    ($count(rebels) = 1 and simulateFailure)?(\n      $set('/simulateFailure', false); \n      $console.log('sleep forever on : ' & $rebel);\n      $sleep(1000000);\n    );\n    $rebel ? $set('/rebels/-',{'name':$rebel.name, 'url':$rebel.homeworld});\n    $console.debug('saveRebel saved: ' & {'name':$rebel.name, 'url':$rebel.homeworld});\n  )}  \n}\n"
  },
  "send$": "$publish(produceParams)",
  "recv$": "$subscribe(subscribeParams)",
  "rebels": [],
  "fetchLog": [],
  "simulateFailure": true,
  "runtime": "${ (rebelForces; \"Rebel forces assembled in \" & $string($millis()-start) & \" ms\")}"
}
```
The snapshot can be viewed with the `cat` command:
```shell
cat defaultSnapshot.json
```

On restore from the snapshot, the workflow will skip the first acknowledged data for the first rebel `luke`, skip 
complete logs of the first step `fetchRebel` and start from the second step `saveRebel` for `han`, and run both step 
for the last rebel `leia` in our test data. 

The below example shows how to restore the workflow from the snapshot, and will be tailing the `/rebels` output until we 
get all 3 of them there. 
```json ["$count(data)=3"]
> .restore -f "example/resistanceSnapshot.json" --tail "/rebels until $~>$count=3"
[
  {
    "name": "Luke Skywalker",
    "url": "https://www.swapi.tech/api/planets/1"
  },
  {
    "name": "Han Solo",
    "url": "https://www.swapi.tech/api/planets/22"
  },
  {
    "name": "Leia Organa",
    "url": "https://www.swapi.tech/api/planets/2"
  }
]
```

## Explicit Acknowledgement
The `ack` function can be used to acknowledge the message in the subscriber. Providing in the client configuration `explicitAck: true` will enable 
the explicit acknowledgement in the subscriber. The `ack` function should be called at the end of the subscriber workflow invocation to acknowledge the message.
```yaml
start: "${( $subscribe(subscribeParams); $publish(publishParams) )}"
subscribeParams: #parameters for subscribing to a http request
  to: ../${func}
  type: "rebel"
  parallelism: 2
  source: "cloudEvent"
  client:
    explicitAck: true
    acks: []
    type: dispatcher
publishParams:
  type: "rebel"
  source: "cloudEvent"
  client:
    type: test
    data: [{type: "rebel", name: "luke"},{type: "rebel", name: "han"},{type: "rebel", name: "leia"}]
func: "/${ function($data){( $console.log('got: ' & $data); $forked('/input',$data); )} }"
input: null
process: |
  ${( 
    $console.log('processing: ' & $$.input); 
    $$.input != null ? ( 
      $joined('/results/-', $$.input);
      $ack($$.input)
    ) 
    : 0 
  )}
results: []
report: "${( $console.log('result added: ' & $$.results) )}"
```

```yaml ["$count(data)=3"]
> .init -f "example/explicitAck.yaml" --tail "/results until $~>$count=3"
[
  {
    "type": "rebel",
    "name": "luke"
  },
  {
    "type": "rebel",
    "name": "han"
  },
  {
    "type": "rebel",
    "name": "leia"
  }
]
```

# retries
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
      "function": "${  function($person){$fetch('https://swapi.tech/api/people/?name='& $person).json().result[0].properties}   }"
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

# Workflow APIs
[README.API.md](README.API.md) provides a REST API to manage the workflow. The API can be used to start, stop, and view 
workflows. The API can also be used to fetch the latest snapshot and restore the workflow from the snapshot.
