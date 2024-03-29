import {WorkflowManager} from '../workflow/WorkflowManager.js';

describe('WorkflowManager', () => {
    let workflowManager;

    beforeEach(() => {
        workflowManager = new WorkflowManager();
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


});
