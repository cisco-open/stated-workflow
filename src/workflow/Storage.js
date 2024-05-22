import fs from 'fs';
import path from 'path';
import util from 'util';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

import StatedREPL from "stated-js/dist/src/StatedREPL.js";

export class Storage {


    constructor(options) {
        this.basePath = params.basePath || path.join(process.cwd(), '.state');
        this.workflowName = `${params.workflowName}.json` || 'workflow.json';
    }

    async init() {
        await this.ensureDirectoryExists(this.basePath);
    }

    /**
     * Ensure the directory exists, creating it if necessary
     * @param {string} dir - the directory to ensure exists
     */
    async ensureDirectoryExists(dir) {
        try {
            await mkdir(dir, { recursive: true });
        } catch (error) {
            // if the file exists, we can continue without error
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    filePath() {
        return path.join(this.basePath, this.workflowName);
    }
    // store the log for a workflow invocation
    async persist(tp) {
        await writeFile(this.filePath(), StatedREPL.stringify(tp.output));
    }


    async restore() {
        try {
            const template = JSON.parse(await readFile(this.filePath()));
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`No previous state found at ${this.filePath()}`);
            } else {
                console.log(`Error reading state from ${this.filePath()}, error: ${error}`);
                throw error;
            }
        }
    }
}
