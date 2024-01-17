#!/usr/bin/env node --experimental-vm-modules
import express from 'express';
import bodyParser from 'body-parser';
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";

const app = express();
app.use(bodyParser.json());

let workflows = {};

app.post('/workflow', async (req, res) => {
    try {
        const template = req.body;
        const workflowId = generateUniqueId(); // Implement this function to generate unique IDs
        const tp = await StatedWorkflow.newWorkflow(template);
        await tp.initialize();
        workflows[workflowId] = tp;
        res.json({ workflowId, status: 'Started' });
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

app.get('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    const workflow = workflows[workflowId];
    if (workflow) {
        res.json(workflow.output);
    } else {
        res.status(404).send('Workflow not found');
    }
});

app.delete('/workflow/:workflowId', (req, res) => {
    const workflowId = req.params.workflowId;
    if (workflows[workflowId]) {
        delete workflows[workflowId];
        res.send('Workflow stopped');
    } else {
        res.status(404).send('Workflow not found');
    }
});

app.listen(8080, () => {
    console.log('Server running on port 8080');
});

function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
}