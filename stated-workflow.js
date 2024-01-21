#!/usr/bin/env node --experimental-vm-modules
import StatedREPL from 'stated-js/dist/src/StatedREPL.js'
import TemplateProcessor from 'stated-js/dist/src/TemplateProcessor.js'
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";
(async () => {
    //starts a single-user REPL session in its own dedicated process therefore replacing
    //the static DEFAULT_FUNCTIONS won't have side effects
    const tp = await StatedWorkflow.newWorkflow();
    const repl = new StatedREPL(tp);
    await repl.initialize();
})();
