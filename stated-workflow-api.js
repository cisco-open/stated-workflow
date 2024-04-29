#!/usr/bin/env node --experimental-vm-modules
import express from 'express';
import bodyParser from 'body-parser';
import { WorkflowManager } from "./src/workflow/WorkflowManager.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";

const app = express();
app.use(bodyParser.json());

const workflowManager = new WorkflowManager();

app.get('/', (req, res) => {
    res.json({ status: 'OK' });
});

app.post('/', async (req, res) => {
    console.log(`Received POST /event with data: ${StatedREPL.stringify(req.body)}`);
    if (req.body !== undefined && req.body.type === 'workflow') {
        try {
            const workflowId = await workflowManager.createWorkflow(req.body.workflow);
            res.json({ workflowId, status: 'Started' });
        } catch (error) {
            console.error('Error in POST /workflow:', error);
            res.status(500).send({'error': error.toString()});
        }
        return;
    }
    try {
        res.json(await workflowManager.sendCloudEvent([req.body]));
    } catch (error) {
        console.error(`Error in POST /event`, error);
        res.status(500).send({'error': error.toString()});
    }
});

app.post('/workflow', async (req, res) => {
    try {
        const workflowId = await workflowManager.createWorkflow(req.body);
        res.json({ workflowId, status: 'Started' });
    } catch (error) {
        console.error('Error in POST /workflow:', error);
        res.status(500).send({'error': error.toString()});
    }
});

app.get('/workflow', (req, res  ) => {
    res.json(workflowManager.getWorkflowIds());
});

app.get('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    const workflow = workflowManager.getWorkflow(workflowId);
    if (workflow) {
        res.json(workflow.templateProcessor.output);
    } else {
        console.log(`Workflow ${workflowId} not found`);
        res.status(404).send({'error': 'Workflow not found'});
    }
});

app.post('/workflow/:workflowId/:type/:subscriberId', async (req, res) => {
    const workflowId = req.params.workflowId;
    const type = req.params.type;
    const subscriberId = req.params.subscriberId;
    if (!Array.isArray(req.body)) {
        console.log(`data must be an array of events, but received ${req.body}`);
        res.status(400).send({'error': 'data must be an array of events'});
        return;
    };

    const workflow = workflowManager.getWorkflow(workflowId);
    if (!workflow) {
        console.log(`Workflow ${workflowId} not found`);
        res.status(404).send({'error': 'Workflow not found'});
        return;
    }


    try {
        res.json(await workflowManager.sendEvent(workflowId, type, subscriberId, req.body));
    } catch (error) {
        console.error(`Error in POST /workflow/${workflowId}/${type}/${subscriberId}`, error);
        res.status(500).send({'error': error.toString()});
    }
});


app.delete('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    console.log(`Received DELETE /workflow/${workflowId}`);
    if (workflowManager.getWorkflow(workflowId)) {
        workflowManager.deleteWorkflow(workflowId)
        console.log(`Workflow ${workflowId} deleted`);
        res.send({ workflowId, status: 'deleted'});
    } else {
        console.log(`Workflow ${workflowId} not found for deletion`);
        res.status(404).send({'error': 'Workflow not found'});
    }
});

app.get('/restore/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    console.log(`Received GET /restore/${workflowId}`);
    try {
        res.json(workflowManager.getWorkflowSnapshot(workflowId));
    } catch (error) {
        console.error(`Error in GET /restore/${workflowId}`, error);
        res.status(500).send({'error': error.toString()});
    }

});

app.post('/restore/:workflowId', async (req, res) => {
    const workflowId = req.params.workflowId;
    console.log(`Received POST /restore/${workflowId} with data:`, req.body);
    try {
        await workflowManager.restoreWorkflow(workflowId, req.body);
        res.json({ workflowId, status: 'restored' });
    } catch (error) {
        console.error(`Error in POST /workflow/${workflowId}`, error);
        res.status(500).json({error: error.toString()});
    }
});

app.listen(8080, () => {
    console.log('Server running on port 8080');
});

app.post('/event', async (req, res) => {
    if (!Array.isArray(req.body)) {
        console.log(`data must be an array of events, but received ${StatedREPL.stringify(req.body)}`);
        res.status(400).send({'error': 'data must be an array of events'});
        return;
    };


    try {
        res.json(await workflowManager.sendCloudEvent(req.body));
    } catch (error) {
        console.error(`Error in POST /event`, error);
        res.status(500).send({'error': error.toString()});
    }
});