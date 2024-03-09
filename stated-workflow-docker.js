#!/usr/bin/env node --experimental-vm-modules
import express from 'express';
import bodyParser from 'body-parser';
import { StatedWorkflow } from "./src/workflow/StatedWorkflow.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import fs from "fs";
import TemplateProcessor from "stated-js";

const app = express();
app.use(bodyParser.json());

let workflows = {};

app.post('/workflow', async (req, res) => {
    console.log('Received POST /workflow with data:', req.body);
    try {
        const template = req.body;
        // const options = req.body.options;
        const workflowId = generateUniqueId();
        console.log(`Creating new workflow with ID ${workflowId}`);
        const sw = await StatedWorkflow.newWorkflow(template);
        sw.templateProcessor.options = {'snapshot': {'snapshotIntervalSeconds': 1, path: `./${workflowId}.json`}};
        workflows[workflowId] = sw;
        await sw.templateProcessor.initialize()
        console.log(`Workflow ${workflowId} started, output:`, StatedREPL.stringify(sw.templateProcessor.output));
        res.json({ workflowId, status: 'Started' });
    } catch (error) {
        console.error('Error in POST /workflow:', error);
        res.status(500).send(error.toString());
    }
});

app.post('/restore', async (req, res) => {
    console.log('Received POST /restore with data:', req.body);
    try {
        const workflowId = req.body.workflowId;
        console.log(`Restoring workflow with ID ${workflowId}`);

        const snapshotContent = fs.readFileSync(`./${workflowId}.json`, 'utf8');
        const snapshot = JSON.parse(snapshotContent);

        if (workflows[workflowId]) {
            console.log(`Closing ${workflowId} workflow`);
            await workflows[workflowId].close();
        }

        await TemplateProcessor.prepareSnapshotInPlace(snapshot);
        const sw = await StatedWorkflow.newWorkflow(snapshot.template);
        workflows[workflowId] = sw;
        sw.templateProcessor.options = snapshot.options;
        await sw.templateProcessor.initialize(snapshot.template, '/', snapshot.output);

        console.log(`Workflow ${workflowId} restored from snapshot ${StatedREPL.stringify(snapshot)}`);
        console.log(`Workflow ${workflowId}:`, StatedREPL.stringify(sw.templateProcessor.output));
        res.json({ workflowId, status: 'restored' });
    } catch (error) {
        console.error('Error in POST /workflow:', error);
        res.status(500).send(error.toString());
    }
});

app.get('/workflow', (req, res  ) => {
    console.log('Received GET /workflow');
    const workflowIds = Object.keys(workflows);
    res.json({ workflowIds });
});

app.get('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    console.log(`Received GET /workflow/${workflowId}`);
    const workflow = workflows[workflowId];
    if (workflow) {
        console.log(`Workflow ${workflowId}:`, StatedREPL.stringify(workflow.templateProcessor));
        res.json(workflow.templateProcessor.output);
    } else {
        console.log(`Workflow ${workflowId} not found`);
        res.status(404).send('Workflow not found');
    }
});

app.post('/workflow/:workflowId/:type/:subscriberId', async (req, res) => {
    const workflowId = req.params.workflowId;
    const type = req.params.type;
    const subscriberId = req.params.subscriberId;
    console.log(`Received POST /workflow/${workflowId}/${type}/${subscriberId} with data: ${req.body}`);
    if (!Array.isArray(req.body)) {
        console.log(`data must be an array of events, but received ${req.body}`);
        res.status(400).send('data must be an array of events');
        return;
    };

    const workflow = workflows[workflowId];
    if (!workflow) {
        console.log(`Workflow ${workflowId} not found`);
        res.status(404).send('Workflow not found');
        return;
    }

    const dispatcher = workflow.workflowDispatcher.getDispatcher({type, subscriberId});
    if (!dispatcher) {
        console.log(`dispatcher not found for type ${type} and subscriberId ${subscriberId}`);
        res.status(404).send('Workflow not found');
        return;
    }

    console.log(`Adding events to dispatcher ${dispatcher}`);
    const promises = [];
    for (const event of req.body) {
        const ackDataCallback = () => res.send('success');
        dispatcher.addToQueue(event, ackDataCallback);
        promises.push(ackDataCallback);
    }
    await Promise.all(promises);
});

app.delete('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    console.log(`Received DELETE /workflow/${workflowId}`);
    if (workflows[workflowId]) {
        delete workflows[workflowId];
        console.log(`Workflow ${workflowId} deleted`);
        res.send('Workflow stopped');
    } else {
        console.log(`Workflow ${workflowId} not found for deletion`);
        res.status(404).send('Workflow not found');
    }
});

app.listen(8080, () => {
    console.log('Server running on port 8080');
});

function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
}
