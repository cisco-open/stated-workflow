<!-- TOC -->
* [Workflow Management API](#workflow-management-api)
  * [/workflow APIs](#workflow-apis)
  * [/restore APIs](#restore-apis)
* [Getting Started](#getting-started)
  * [Run locally](#run-locally)
  * [Run in Docker](#run-in-docker)
* [API Examples](#api-examples)
<!-- TOC -->

# Workflow Management API
Stated workflow can be run in a containerized environment and provide a REST API to manage the workflow.

## /workflow APIs
List all running workflows. Start, stop and view workflows. 

## /restore APIs
Fetch workflow's latest snapshot and restore the workflow from the snapshot.

## /workflow/{workflowId}/{type}/{subscriber} APIs
This API can be used to send an event to the workflow dispatcher. The event will be dispatched to the subscriber of the 
given type.

# Getting Started
## Run locally
```shell
node stated-workflow-api
```
## Run in Docker
Build image - the below command in docker should work for both amd64 and arm64 platforms
```shell
V=0.0.1 && docker buildx build --platform linux/amd64 . --tag sesergee773/statedworkflow:$V
```
Run it in your docker 
```shell
docker run -d -it  -p 8080:8080 sesergee773/statedworkflow:$V
```

# API Examples

```shell
# submit a workflow template
workflowId=`curl -H 'Content-Type:application/json' http://localhost:8080/workflow -X POST -d @example/joinResistanceRecovery.json | jq -r '.workflowId'`  && echo $workflowId || echo failed to start the workflow: $!
```

```shell
# list all workflows
curl -H 'Content-Type:application/json' http://localhost:8080/workflow | jq
```

```shell
# get te workflow output
curl -H 'Content-Type:application/json' http://localhost:8080/workflow/$workflowId | jq
```

```shell
# stop the workflow 
curl -H 'Content-Type:application/json' http://localhost:8080/workflow/$workflowId -X DELETE | jq
```

```shell
# show the latest workflow snapshot
curl -H 'Content-Type:application/json' http://localhost:8080/restore/$workflowId | jq
```

```shell
# restore the workflow from the latest snapshot
curl -H 'Content-Type:application/json' http://localhost:8080/restore/$workflowId -X POST | jq
```

```shell
# send an event with rebel named "obi" to the workflow dispatcher for "rebelDispatch" type and "rebelArmy" subscriber
curl -H 'Content-Type: application/json' http://localhost:8080/workflow/${workflowId}/rebelDispatch/rebelArmy -X POST -d '["obi"]'
```

