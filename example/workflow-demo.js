import {exec} from "child_process";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

let apiProcess;
export const startApi = async ()=>{
    return new Promise((resolve, reject) => {
        try {
            apiProcess = exec('node stated-workflow-api', (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    reject(error); // Reject the promise on error.
                    return;
                }
            });
            console.log(`started stated-workflow-api with pid ${apiProcess.pid}`);

            apiProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
                if (data.includes('Server running on port 8080')) {
                    resolve('success'); // Resolve the promise when the server is ready.
                }
            });
            apiProcess.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });

            apiProcess.on('error', (error) => {
                console.error(`Failed to start process: ${error}`);
                reject(error);
            });
        } catch (error) {
            console.error(`error starting stated-workflow-api: ${error}`);
            reject(error);
        }
    })
}

export const readObject = async (file) => {
    return new Promise((resolve, reject) => {
        if (file === undefined) {
            console.log(`file is undefined`);
            return;
        }
        if (file[0] === '~') {
            file = file.replace('~', process.env.HOME);
        }
        file = path.resolve(file);

        if (!fs.existsSync(file)) {
            console.log(`file ${file} does not exist`);
            return;
        }
        const fileContent = fs.readFileSync(file, 'utf8');
        try {
            return resolve(JSON.parse(fileContent));
        } catch (e) {
        }
        try {
            return resolve(yaml.load(fileContent));
        } catch (e) {
        }
        console.log(`file ${file} could not be parsed as json or yaml`);
        reject(`file ${file} could not be parsed as json or yaml`);
    });
}
export const toJson = async (obj) => {
    return JSON.stringify(obj);
}

export const stopApi = async () => {
    if (apiProcess) {
        console.log(`killing stated-workflow-api with pid ${apiProcess.pid}`);
        apiProcess.kill();
    }
}