#!/usr/bin/env node --experimental-vm-modules
import StatedREPL from 'stated-js/dist/src/StatedREPL.js'
import TemplateProcessor from 'stated-js/dist/src/TemplateProcessor.js'
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";
import {WorkflowDispatcher} from "./src/workflow/WorkflowDispatcher.js";
(async () => {
    //starts a single-user REPL session in its own dedicated process therefore replacing
    //the static DEFAULT_FUNCTIONS won't have side effects
    const {templateProcessor:tp} = await StatedWorkflow.newWorkflow()
    const repl = new StatedREPL(tp);
    // FIXME: This is a workaround and probably should better be set in StatedWorkflow.newWorkflow()
    repl.cliCore.onInit = WorkflowDispatcher.clear;
    // TODO: stop the subscriber
    // TODO:
    await repl.initialize();
})();
