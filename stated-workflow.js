#!/usr/bin/env node --experimental-vm-modules
import StatedREPL from 'stated-js/dist/src/StatedREPL.js'
import TemplateProcessor from 'stated-js/dist/src/TemplateProcessor.js'
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";
(async () => {
    //starts a single-user REPL session in its own dedicated process therefore replacing
    //the static DEFAULT_FUNCTIONS won't have side effects
    TemplateProcessor.DEFAULT_FUNCTIONS = {...TemplateProcessor.DEFAULT_FUNCTIONS, ...StatedWorkflow.context};
    const repl = new StatedREPL();
    await repl.initialize();
})();
