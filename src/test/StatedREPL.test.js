// Copyright 2023 Cisco Systems, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import {StatedWorkflow} from "../workflow/StatedWorkflow.js";
import {WorkflowDispatcher} from "../workflow/WorkflowDispatcher.js";

// basic test of workflow functions available in the repl.
test.skip("debug", async () => {
  const originalCmdLineArgsStr = process.argv.slice(2).join(" ");
  try {
    process.argv = ["node", "stated-workflow.js"];
    let {templateProcessor:tp} = await StatedWorkflow.newWorkflow()
    const repl = new StatedREPL(tp);
    repl.cliCore.onInit = WorkflowDispatcher.clear;
    await repl.cliCore.init('.init -f "example/pubsub-kafka.yaml"');
    tp = repl.cliCore.templateProcessor;
    while (tp.output.stop$ !== 'missionAccomplished') {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(tp.output);
  } catch (e) {
    console.log(e);
    throw(e);
  } finally {
    process.argv = originalCmdLineArgsStr;
  }
})




