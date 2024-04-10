import {WorkflowManager} from '../workflow/WorkflowManager.js';

describe('WorkflowManager', () => {
    let workflowManager;

    beforeEach(() => {
        workflowManager = new WorkflowManager();
    });

    afterEach(async () => {
        await workflowManager.close()
    });

    test('createWorkflow should return a unique workflow ID', async () => {
        const template = {some: 'thing'};
        const workflowId = await workflowManager.createWorkflow(template);

        expect(workflowId).toBeDefined();
        expect(typeof workflowId).toBe('string');
        expect(workflowId.length).toBeGreaterThan(0);
        // Check if the workflow is stored correctly
        expect(workflowManager.workflows[workflowId].templateProcessor.output).toEqual(template);
    });

    // if no dispatchers registered to run event type, attempt to send event should return failure.
    test('Should return failure if no dispatchers registered for the event type', async () => {
        const r = await workflowManager.sendCloudEvent(
            [{type: 'myType', subscriberId: 'mySubscriberId', data: {k: 'v'}}]);
        expect(r).toEqual({status: 'failure', error: 'No subscriber found for type myType'});
    });

    // validates sending cloud events to a workflow and acknowledging on processing
    test('Sending multiple events - ack on processing', async () => {
        const t =
            {
                "start$": "$subscribe(subscribeParams)",
                "subscribeParams": {
                    "type": "myType",
                    "to": "/${ toFunc }",
                    "parallelism": 2,
                    "source": "cloudEvent",
                    "client": {
                        "type": "test"
                    }
                },
                "toFunc": "${ function($e) { $e } }"
            };
        await workflowManager.createWorkflow(t);
        const r = await workflowManager.sendCloudEvent(
            [
                {type: 'myType', subscriberId: 'mySubscriberId', data: {k1: 'v1'}},
                {type: 'myType', subscriberId: 'mySubscriberId', data: {k2: 'v2'}}
            ]);
        expect(r).toEqual({status: 'success'});
    });

    // validates sending cloud events to a workflow and acknowledging on snapshot
    test('Sending multiple events - ack on snapshot', async () => {
        const t =
            {
                "start$": "$subscribe(subscribeParams)",
                "subscribeParams": {
                    "type": "myType",
                    "to": "/${ toFunc }",
                    "parallelism": 2,
                    "source": "cloudEvent",
                    "client": {
                        "type": "test"
                    }
                },
                "toFunc": "${ function($e) { $sleep(10000) } }"
            };
        await workflowManager.createWorkflow(t);
        const r = await workflowManager.sendCloudEvent(
            [
                {type: 'myType', subscriberId: 'mySubscriberId', data: {k1: 'v1'}},
                {type: 'myType', subscriberId: 'mySubscriberId', data: {k2: 'v2'}}
            ]);
        expect(r).toEqual({status: 'success'});
    });

    // validates sending cloud events and partial failure
    test('Sending events - partial failure', async () => {
        const t =
            {
                "start$": "$subscribe(subscribeParams)",
                "subscribeParams": {
                    "type": "myType",
                    "to": "/${ toFunc }",
                    "parallelism": 2,
                    "source": "cloudEvent",
                    "client": {
                        "type": "test"
                    }
                },
                "toFunc": "${ function($e) { $e } }"
            };
        await workflowManager.createWorkflow(t);
        const r = await workflowManager.sendCloudEvent(
            [
                {type: 'myType', subscriberId: 'mySubscriberId', data: {k1: 'v1'}},
                {type: 'myType2', subscriberId: 'mySubscriberId', data: {k2: 'v2'}}
            ]);
        expect(r).toEqual({status: 'failure', "error": "No subscriber found for type myType2"});
    });

    test('Sending events - one ack on processing, one ack on snapshot', async () => {
        const t =
            {
                "start": ["/${$subscribe(subscribeParams)}","/${$subscribe(subscribeParams2)}"],
                "subscribeParams": {
                    "type": "myType",
                    "to": "/${ toFunc }",
                    "source": "cloudEvent",
                    "client": {"type": "test"}
                },
                "subscribeParams2": {
                    "type": "myType2",
                    "to": "/${ toFuncSlow }",
                    "source": "cloudEvent",
                    "client": {"type": "test"}
                },
                "toFunc": "${ function($e) { $e } }",
                "toFuncSlow": "${ function($e) { $sleep(10000) } }"
            };
        await workflowManager.createWorkflow(t);
        const r = await workflowManager.sendCloudEvent(
            [
                {type: 'myType', subscriberId: 'mySubscriberId', data: {k1: 'v1'}},
                {type: 'myType2', subscriberId: 'mySubscriberId', data: {k2: 'v2'}}
            ]);
        expect(r).toEqual({status: 'success'});
    });
});
