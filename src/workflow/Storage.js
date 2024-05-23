import fs from 'fs';
import path from 'path';
import util from 'util';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

import StatedREPL from "stated-js/dist/src/StatedREPL.js";

/**
 * Storage interface
 */
export class iStorage {

    constructor(options) {}

    /**
     * Initialize the storage
     * @returns {Promise<void>}
     */
    async init() {}

    /**
     * Store an object of a type
     * @param {Object.<string, Object.<string, Object>>} data - The data to store, mapped by type and id.
     * @returns {Promise<void>}
     * @throws {TypeError|Error} If the data parameter is not an object.
     */
    async write(data) {}

    /**
     * Load all object of a type
     * @param type
     * @returns {Promise<[Object]>}
     */
    readAll(type) {}

    /**
     * Load an object of a type
     * @param type
     * @param id
     * @returns {Promise<Object>}
     */
    async read(type, id) {}

}

export function createStorage(options = {'type': 'fs'}) {
    if (options.type === 'fs') {
        return new FSStorage(options);
    } else {
        throw new Error(`Unsupported storage type: ${options.type}`);
    }
}

export class FSStorage extends iStorage {
    constructor(options) {
        super(options);
        this.basePath = options.basePath || path.join(process.cwd(), '.state');
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

    // store the log for a workflow invocation
    async write(data) {
        if (typeof data !== 'object' || data === null) {
            throw new TypeError('The data parameter must be an object.');
        }

        for (const [type, items] of Object.entries(data)) {
            const dirPath = path.join(this.basePath, type);
            for (const [id, obj] of Object.entries(items)) {
                const filePath = path.join(dirPath, `${id}.json`);

                // Ensure the directory exists
                await fs.mkdir(dirPath, { recursive: true });

                // Write the object to a file
                await fs.writeFile(filePath, StatedREPL.stringify(obj, null, 2), 'utf8');
            }
        }
    }

    async readAll(type) {
        const dirPath = path.join(this.basePath, type);
        const files = await fs.readdir(dirPath);
        const promises = files.map(async (file) => {
            const filePath = path.join(dirPath, file);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        });
        return await Promise.all(promises);
    }

    async read(type, id) {
        const filePath = path.join(this.basePath, type, `${id}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    }
}
