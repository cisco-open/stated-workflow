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
import StatedREPL from 'stated-js/dist/src/StatedREPL.js';
import fs from 'fs';
import TemplateProcessor from 'stated-js/dist/src/TemplateProcessor.js'
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";
import {EnhancedPrintFunc, replaceMatchingKeys} from "./src/test/TestTools.js";
import jsonata from "jsonata";

/**
 * Regular expression for command extraction from README.md file. This program finds all the markup code blocks
 * that begin and end with ``` (markdown syntax for code block) and it extracts the cli command and the
 * response. It then runs the cli command and compares the response to what is in the README.md. This ensures
 * that the README is always accurate.
 *
 * /^> \.(?<command>.+[\r\n])((?<expectedResponse>(?:(?!^>|```)[\s\S])*))$/gm
 *
 * Breakdown:
 *
 * ^: Start of a line (because we're using the 'm' flag which makes ^ and $ match start and end of lines respectively)
 *
 * > : Matches the ">" character literally. This assumes that your command lines in the README start with ">".
 *
 * \. : Matches the "." character literally.
 *
 * (?<command>.+[\r\n]): Named capturing group 'command'. Matches any number of characters (using .+), followed by a line break (using [\r\n]).
 *
 * ((?<expectedResponse>(?:(?!^>|```)[\s\S])*)): Named capturing group 'expectedResponse'. Matches any number of characters that do not start a new command line or a markdown code block.
 *
 * Inside 'expectedResponse':
 *    (?:...): Non-capturing group, used to group these elements together without remembering their matched content.
 *    (?!^>|```): Negative lookahead. Asserts that what follows is not the start of a new command line (^>) or a markdown code block (```).
 *    [\s\S]: Matches any character, including newlines. \s matches any whitespace character, and \S matches any non-whitespace character. Together, they match any character.
 *    *: Matches zero or more of the preceding element.
 *
 * $: End of a line (because we're using the 'm' flag which makes ^ and $ match start and end of lines respectively)
 *
 * g: Global flag, to find all matches in the string, not just the first one.
 *
 * m: Multiline flag, to allow ^ and $ to match the start and end of lines, not just the start and end of the whole string.
 */
const markdownContent = fs.readFileSync("README.md", 'utf-8');
const codeBlockRegex = /```(?<codeBlock>[\s\S]*?)```/g;
const jsonataExpressionsArrayRegex = /^[^\[]*(?<jsonataExpressionsArrayString>\s*\[.*?\]\s*)$/m
const commandRegex  = /^> \.(?<command>.+[\r\n])((?<expectedResponse>(?:(?!^>|```)[\s\S])*))$/gm;
let match;
const cliCore = new CliCore();
const testData = [];

while ((match = codeBlockRegex.exec(markdownContent)) !== null) {
    const {codeBlock} = match.groups;
    let _match = jsonataExpressionsArrayRegex.exec(codeBlock);
    let jsonataExprArrayJson;
    if(_match!==null){
        const {jsonataExpressionsArrayString} = _match.groups;
        if(jsonataExpressionsArrayString !== undefined){
            jsonataExprArrayJson = JSON.parse(jsonataExpressionsArrayString);
        }
    }
    let i=0;
    while((_match = commandRegex.exec(codeBlock)) !== null){
        const {command, expectedResponse} = _match.groups;
        const expectedResponseString = _match.groups.expectedResponse.trim();
        const args = command.trim().split(' ');

        if (args.length > 0) {
            const cmdName = args.shift();
            const method = cliCore[cmdName];

            if (typeof method === 'function') {
                let jsonataExpr;
                if(jsonataExprArrayJson !== undefined){
                    jsonataExpr = jsonataExprArrayJson[i];
                }else{
                    jsonataExpr = false;
                }
                testData.push([cmdName, args, expectedResponse, jsonataExpr]);
            } else {
                throw Error(`Unknown command: .${cmdName}`);
            }
        }
        i++;
    }

}


testData.forEach(([cmdName, args, expectedResponseString, jsonataExpression], i) => {
    test(`${cmdName} ${args.join(' ')}`, async () => {
        const rest = args.join(" ");
        const resp = await cliCore[cmdName].apply(cliCore, [rest]);
        const respNormalized = JSON.parse(StatedREPL.stringify(resp));
        if(jsonataExpression){ //if we have an optional jsonata expression specified after the codeblock, likje ````json <optionaJsonataExpression>
            const compiledExpr = jsonata(jsonataExpression);
            const result = await compiledExpr.evaluate(respNormalized);
            if (result !== true) {
                // If the result is not true, throw an error with details
                throw new Error(`JSONata Test Failed: Expected JSONata expression to evaluate to true.\nExpression: ${jsonataExpression}\nResponse: ${JSON.stringify(respNormalized, null, 2)}\nEvaluation result: ${result}`);
            }
            expect(result).toBe(true);
        }else {
            if(expectedResponseString){
                const _expected = JSON.parse(expectedResponseString);
                expect(respNormalized).toEqual(_expected);
            }else{
                expect(respNormalized).toBeDefined();
            }
        }
    }, 30000);  // set timeout to 10 seconds for each test since in the readme we call web apis
});

