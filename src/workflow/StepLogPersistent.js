
export class StepLogPersistent {
    constructor(stepJson){
        this.step = stepJson;
        this.fileName = stepJson.name ? `./${stepJson.name}.json` : './step.json';
        const {log} = this.step;
        if(log === undefined){
            this.step.log = {};
        }
        this.data = {};

        // Return a Proxy to intercept operations on this object
        return new Proxy(this, {
            get(target, property) {
                return target.data[property];
            },
            set(target, property, value) {
                // Custom logic on property assignment
                target.data[property] = value;
                target.writeToFile(); // Write to file on change
                return true; // Indicate successful assignment
            }
        });
    }

    writeToFile() {
        fs.writeFile(this.fileName, JSON.stringify(this.data), (err) => {
            if (err) console.error('Error writing to file:', err);
        });
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
