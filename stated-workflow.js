#!/usr/bin/env node --experimental-vm-modules
import StatedREPL from 'stated-js/dist/src/StatedREPL.js'
(async () => {
    const repl = new StatedREPL();
    await repl.initialize();
})();
