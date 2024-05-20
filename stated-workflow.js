#!/usr/bin/env node --experimental-vm-modules
import StatedREPL from 'stated-js/dist/src/StatedREPL.js'
import TemplateProcessor from 'stated-js/dist/src/TemplateProcessor.js'
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";
import {WorkflowDispatcher} from "./src/workflow/WorkflowDispatcher.js";
import minimist from 'minimist';

(async () => {
    //starts a single-user REPL session in its own dedicated process therefore replacing
    //the static DEFAULT_FUNCTIONS won't have side effects

    const args = minimist(process.argv.slice(2));
    const defaultOpts = {
        snapshot: {
            storage: 'fs',
        }
    };

    const statedWorkflow = await StatedWorkflow.newWorkflow(undefined, undefined, defaultOpts);
    const {templateProcessor:tp} = statedWorkflow;
    const repl = new StatedREPL(tp);
    // FIXME: This is a workaround and probably should better be set in StatedWorkflow.newWorkflow()

    statedWorkflow.workflowDispatcher = new WorkflowDispatcher({});

    // CliCore reuses TemplateProcessor object we instantiated in StatedWorkflow.newWorkflow()
    // The TemplateProcessor is instantiated with Workflow functions, which are functions of a StatedWorkflow instance.
    // We need to ensure that we clean WorkflowDispatcher's state before each REPL session to remove any previously
    // added subscribers. This is done by setting onInit to clear the WorkflowDispatcher's state.
    repl.cliCore.onInit = statedWorkflow.workflowDispatcher.clear.bind(statedWorkflow.workflowDispatcher);
    await repl.initialize();
})();
