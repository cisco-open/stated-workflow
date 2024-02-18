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

import StatedREPL from 'stated-js/dist/src/StatedREPL.js'

export class EnhancedPrintFunc {
  static isWorkflowId(value) {
    const pattern = /^\d{4}-\d{2}-\d{2}-\d{13}-[a-z0-9]{4,6}$/;
    const matched = pattern.test(value);
    return matched;
  }

  static isTimestamp(value) {
    // This will check for a 13 digit number, typical of a JavaScript timestamp
    return /^\d{13}$/.test(value.toString());
  }

  static isRando(key) {
    return typeof key === 'string' && key === 'rando';
  }

  static printFunc(key, value) {
    const originalValue = StatedREPL.printFunc(key, value);

    // If stated.printFunc already handled and transformed the value, no need to check again
    if (originalValue !== value) {
      return originalValue;
    }
    if (EnhancedPrintFunc.isWorkflowId(key)) {
      return "--ignore--";
    }
    if (EnhancedPrintFunc.isWorkflowId(value)) {
      return "--ignore--";
    }
    if (EnhancedPrintFunc.isRando(key)) {
      return "--rando--";
    }

    if (EnhancedPrintFunc.isTimestamp(value)) {
      return "--timestamp--";
    }

    return value;
  }

}

export function replaceMatchingKeys(obj) {
  const pattern = /^\d{4}-\d{2}-\d{2}-\d{13}-[a-z0-9]{4,6}$/;

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // If the current object is an array, process it as an array
  if (Array.isArray(obj)) {
    return obj.map(item => replaceMatchingKeys(item));
  }

  const newObj = {};

  for (let [key, value] of Object.entries(obj)) {

    // Check conditions to stop deeper traversal
    if (
      value?._jsonata_lambda ||
      key === 'compiledExpr__' ||
      (value && value._idleTimeout !== undefined && value._onTimeout !== undefined) ||
      value instanceof Set
    ) {
      newObj[key] = value;
      continue;  // Skip DFS for this value
    }

    // Replace values if they match the pattern
    if (typeof value === 'string' && pattern.test(value)) {
      value = '--ignore--';
    }

    // Process child objects
    if (typeof value === 'object' && value !== null) {
      value = replaceMatchingKeys(value);
    }

    // Replace keys if they match the pattern
    if (pattern.test(key)) {
      newObj['--ignore--'] = value;
    } else {
      newObj[key] = value;
    }
  }

  return newObj;
}

function sortLogs(output, workflowName) {
  const nozzleWorkLog = output.log[workflowName];
  const instanceExecutionLogs = [];
  const entries = Object.entries(nozzleWorkLog);
  entries.reduce((acc, [key, instanceExecutionLog]) => {
    acc.push(instanceExecutionLog);
    return acc;
  },instanceExecutionLogs);
  return instanceExecutionLogs.sort((a, b) => {
    let aOrder = a.execution[0].args[0].order;
    let bOrder = b.execution[0].args[0].order;
    return aOrder - bOrder;
  });
}

export class Delay{
  static async start(delayMs){
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
}
