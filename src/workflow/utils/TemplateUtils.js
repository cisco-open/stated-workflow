#!/usr/bin/env node --experimental-vm-modules
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

import DependencyFinder from "stated-js/dist/src/DependencyFinder.js";
import jp from "stated-js/dist/src/JsonPointer.js";

export class TemplateUtils {

  /**
   *
   * @param resolvedJsonPointers
   * @param steps
   * @param metaInf
   */
  static validateStepPointers(resolvedJsonPointers, steps, metaInf, procedureName) {
    if (resolvedJsonPointers.length !== steps.length) {
      throw new Error(`At ${metaInf.jsonPointer__},
            '${$procedureName}(...)' was passed ${steps.length} steps, but found ${resolvedJsonPointers.length} step locations in the document.`);
    }
  }

  static async resolveEachStepToOneLocationInTemplate(metaInf, tp, procedureName){
    const filterExpression = `**[procedure.value='${procedureName}']`;
    const jsonPointers = await TemplateUtils.findStepDependenciesInTemplate(metaInf, filterExpression);
    const resolvedPointers = TemplateUtils.drillIntoStepArrays(jsonPointers, tp);
    return resolvedPointers;
  }

  static async findStepDependenciesInTemplate(metaInf, filterExpression){
    const ast = metaInf.compiledExpr__.ast();
    let depFinder = new DependencyFinder(ast);
    depFinder = await depFinder.withAstFilterExpression(filterExpression);
    if(depFinder.ast){
      return depFinder.findDependencies().map(jp.compile)
    }
    return [];
  }

  /**
   * make sure that if the serial function has numSteps, that have located storage for each of the steps in the
   * document.
   * @param jsonPointers
   */
  static drillIntoStepArrays(jsonPointers=[], tp){
    const resolved = [];
    jsonPointers.forEach(p=>{
      if(!jp.has(tp.output, p)){
        throw new Error(`Cannot find ${p} in the template`);
      }
      const loc = jp.get(tp.output, p);
      //if serial has a dependency on an array, for example $serial(stepsArray) or
      // $serial(step1~>append(otherStepsArray)), the we drill into the array and mine out json pointers
      // to each element of the array
      if(Array.isArray(loc)){
        for(let i=0;i<loc.length;i++){
          resolved.push(p+"/"+i);
        }
      }else{
        resolved.push(p);
      }

    });
    return resolved;

  }

}