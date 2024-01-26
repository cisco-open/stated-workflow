import fs from 'fs';
import path from 'path';
import util from 'util';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

export class WorkflowPersistence {


    constructor(params) {
        this.basePath = params.basePath || path.join(process.cwd(), '.state');
        this.workflowName = `${params.workflowName}.json` || 'workflow.json';
    }

    async init() {
        await this.ensureDirectoryExists(this.basePath);
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

    filePath() {
        return path.join(this.basePath, this.workflowName);
    }
    // store the log for a workflow invocation
    async persist(tp) {
        await writeFile(this.filePath(), JSON.stringify(tp.output));
    }


    async restore() {
        return JSON.parse(await readFile(this.filePath()));
    }
}
