
// stepLog stores JSON object with logs of each step invocation, like this:
//   {
//     "name": "entrypoint",
//     "function": "/${  function($e){$e ~> $serial([step1, step2])}  }",
//     "log": {
//       "1697402819332-9q6gg": {
//         "start": {
//           "timestamp": 1697402819332,
//           "args": {
//             "name": "nozzleTime",
//             "order": 1
//           }
//         },
//         "end": {
//           "timestamp": 1697402826805,
//           "out": {
//             "name": "nozzleTime",
//             "order": 1,
//             "primed": true,
//             "sprayed": true
//           }
//         }
//       }
//     }
//   }
//
//
// each invocation may include start and end logs. If only start is present, it means that the event processing was
// attempted but has not finished before workflow/processing failure. Event processing for this invocation should be
// restarted.
export class StepLog{
    constructor(stepJson){
        this.step = stepJson;
        const {log} = this.step;
        if(log === undefined){
            this.step.log = {};
        }
    }

    getInvocations(){
        const {log} = this.step;
        return Object.keys(log);
    }

    getCourseOfAction(invocationId){
        const {log} = this.step;
        const invocationLog = log[invocationId];
        if(invocationLog===undefined){
            return {"instruction":"START"};
        }
        const {start, end} = invocationLog;

        if(start !== undefined && end !== undefined){
            return {"instruction":"SKIP", event: end};
        }
        if(start !== undefined && end === undefined){
            return {"instruction":"RESTART", event: start};
        }
        if(start === undefined && end !== undefined){
            const {workflowInvocation, stepName} = this.step;
            throw new Error(`Invalid log ('end' present without 'start') for workflowInvocation=${workflowInvocation}, stepName=${stepName}.`);
        }

    }

}
