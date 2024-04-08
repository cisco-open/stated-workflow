import path from "path";
import fs from "fs";
import {StatedWorkflow} from "./src/workflow/StatedWorkflow.js";
import StatedREPL from "stated-js/dist/src/StatedREPL.js";
import {startApi, stopApi} from "./example/workflow-demo.js";

const apiPromise =  startApi();

const createWorkflow = async () => {
    const templateStr = fs.readFileSync(path.join('example', 'wfHttp01.json'), 'utf8');

    return fetch('http://localhost:8080/workflow', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: templateStr,
    }).then(response => response.json())
        .then(data => {
            console.log('Success:', data);
        }).catch((error) => {
        console.error('Error:', error);
    });
}

const sendEvent = async () => {
    const requestContext = {
        url: 'http://localhost:8080/event',
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
            type: 'myType',
            subscriberId: 'mySubscriberId',
            data: {
                key: 'value'
            }
        }])
    };
    return fetch(requestContext.url, requestContext)
        .then(response => {
            console.log(`sendEvent response: ${StatedREPL.stringify(response)}`);
            response.json()
        }).catch((error) => {
            console.error('Error:', error);
        });
}

apiPromise.then(async (result) => {
    console.log(`apiPromise resolved with ${result}`);
    await createWorkflow();
    await sendEvent();
}).catch((error) => {
    console.log(`apiPromise rejected with ${error}`);
}).finally(async () => {
    console.log(`apiPromise finally`);
   // await stopApi();
});