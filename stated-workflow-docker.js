#!/usr/bin/env node --experimental-vm-modules
import express from 'express';
import bodyParser from 'body-parser';
import { StatedWorkflow } from "./src/workflow/StatedWorkflow.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";

const app = express();
app.use(bodyParser.json());

let workflows = {};

app.post('/workflow', async (req, res) => {
    console.log('Received POST /workflow with data:', req.body);
    try {
        const template = req.body;
        const workflowId = generateUniqueId();
        console.log(`Creating new workflow with ID ${workflowId}`);
        const tp = await StatedWorkflow.newWorkflow(template);
        workflows[workflowId] = tp;
        console.log(`Workflow ${workflowId} started`);
        res.json({ workflowId, status: 'Started' });
    } catch (error) {
        console.error('Error in POST /workflow:', error);
        res.status(500).send(error.toString());
    }
});

app.get('/workflow', (req, res) => {
    console.log('Received GET /workflow');
    const workflowIds = Object.keys(workflows);
    res.json({ workflowIds });
});

app.get('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    console.log(`Received GET /workflow/${workflowId}`);
    const workflow = workflows[workflowId];
    if (workflow) {
        console.log(`Workflow ${workflowId}:`, StatedREPL.stringify(workflow));
        res.json(workflow.output);
    } else {
        console.log(`Workflow ${workflowId} not found`);
        res.status(404).send('Workflow not found');
    }
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
