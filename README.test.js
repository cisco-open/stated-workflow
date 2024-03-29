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

import CliCore from 'stated-js/dist/src/CliCore.js';
import {parseMarkdownAndTestCodeblocks} from "stated-js/dist/src/TestUtils.js";
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";


const {templateProcessor:tp} = await StatedWorkflow.newWorkflow();
await tp.initialize();
const cliCore = new CliCore(tp);

parseMarkdownAndTestCodeblocks('./README.md', cliCore);
