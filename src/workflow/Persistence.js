/**
 * This class is responsible for persisting the workflow invocation log. Current persistence types: template, memory, file, queue
 * Template one persists each invocation log as an object in the template. This is the behavior by default.
 * Memory persists the log in the memory of the workflow process, so it is lost when the process is restarted.
 * File persists the log in a file. The file can recover from the process/instance restart with persistent volumes.
 * Queue persists the log in a queue service. The queue can recover from the process/instance restart.
 */

import fs from 'fs';
import path from 'path';
import util from 'util';

const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);
const mkdir = util.promisify(fs.mkdir);

// IPersistence.js
export class IPersistence {

    async init() {
        throw new Error("Method 'init()' must be implemented.");
    }

    async store(stepJson, invocationId, log, jsonPath) {
        throw new Error("Method 'store()' must be implemented.");
    }

    async erase(invocationId, jsonPath) {
        throw new Error("Method 'erase()' must be implemented.");
    }

    async restore() {
        throw new Error("Method 'restore()' must be implemented.");
    }
}

export function createPersistence(persistenceParams = {persistenceType: "memory"}) {
    switch (persistenceParams.persistenceType) {
        case 'memory':
            return new MemoryPersistence(persistenceParams);
        case 'file':
            return new FilePersistence(persistenceParams);
        case 'queue':
            return new QueuePersistence(persistenceParams);
        default:
            throw new Error("Invalid persistence type");
    }
}

export class MemoryPersistence extends IPersistence {

    log = {};
    constructor(params) {
        super();

    }

    store(stepJson, invocationId, log, jsonPath) {
        if (!(stepJson in this.log)) {
            this.log[stepJson] = {};
        }
        this.log[stepJson][invocationId] = log;
    }

    async load(workflowInvocation, stepJson) {
        if (!(stepJson in this.log)) {
            this.log[stepJson] = {};
        }
        const log = this[stepJson]

        if (!log.has(workflowInvocation)) {
            const start = {
                timestamp: new Date().getTime(),
                args
            };
            log[workflowInvocation] = {start};
        }

        return log;
    }

    async erase(invocationId, jsonPath) {
        const log = this.log[jsonPath];
        if (log !== undefined) {
            delete log[invocationId];
        }
    }
    restore() {
        // TODO: implement
    }
}

export class FilePersistence extends IPersistence {
    constructor(params) {
        super();
        this.basePath = params.basePath || path.join(process.cwd(), '.state');
        this.completedPath = path.join(this.basePath, 'completed');
    }

    async init() {
        await this.ensureDirectoryExists(this.basePath);
        await this.ensureDirectoryExists(this.completedPath);
    }

    async ensureDirectoryExists(dir) {
        try {
            await mkdir(dir, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    generateFilePath(jsonPath, invocationId, isCompleted = false) {
        const safeName = encodeURIComponent(jsonPath + '-' + invocationId);
        const dir = isCompleted ? this.completedPath : this.basePath;
        return path.join(dir, `${safeName}.json`);
    }

    async store(jsonPath, invocationId, log) {
        const filePath = this.generateFilePath(jsonPath, invocationId);
        try {
            const data = JSON.stringify(log, null, 2);
            await writeFile(filePath, data, 'utf8');

            if (log.end) {
                const completedFilePath = this.generateFilePath(jsonPath, invocationId, true);
                await writeFile(completedFilePath, data, 'utf8');
                await unlink(filePath);
                await this.manageCompletedFiles();
            }
        } catch (error) {
            console.error('Error writing to file:', error);
            throw error;
        }
    }

    async manageCompletedFiles() {
        try {
            const files = await readdir(this.completedPath);
            if (files.length > 100) {
                const sortedFiles = files.sort((a, b) => {
                    const aTime = parseInt(a.split('-').pop(), 10);
                    const bTime = parseInt(b.split('-').pop(), 10);
                    return bTime - aTime;
                });
                const filesToDelete = sortedFiles.slice(100);
                for (const file of filesToDelete) {
                    await unlink(path.join(this.completedPath, file));
                }
            }
        } catch (error) {
            console.error('Error managing completed files:', error);
            throw error;
        }
    }

    async erase(jsonPath, invocationId) {
        const filePath = this.generateFilePath(jsonPath, invocationId);
        try {
            await unlink(filePath);
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    async restore(output) {
        try {
            const basePathFiles = await readdir(this.basePath);
            const completedPathFiles = await readdir(this.completedPath);
            const allFiles = basePathFiles.concat(completedPathFiles);

            for (const file of allFiles) {
                const filePath = path.join(file.startsWith('completed') ? this.completedPath : this.basePath, file);
                const data = await readFile(filePath, 'utf8');
                const log = JSON.parse(data);

                // Extract the jsonPath from the filename
                const jsonPath = decodeURIComponent(file.split('-')[0]);

                // Add log data to the output object
                if (!output[jsonPath]) {
                    output[jsonPath] = [];
                }
                output[jsonPath].push(log);
            }
        } catch (error) {
            console.error('Error restoring data:', error);
            throw error;
        }
    }
}

export class QueuePersistence extends IPersistence {
    serviceUrl;
    constructor(params) {
        super();
        this.serviceUrl = 'pulsar://localhost:6650'
    }

    store(stepJson, invocationId, log, jsonPath) {
        StatedWorkflow.publish(
          {'type': stepJson.workflowName, 'data': log},
          {type:'pulsar', params: {serviceUrl: this.serviceUrl}}
        );
    }

    restore() {
        // TODO: implement
    }
}
