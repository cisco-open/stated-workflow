import { promises as fs } from 'fs';
import StatedREPL from "stated-js/dist/src/StatedREPL.js";

export class SnapshotManager {

    constructor(options = {storage: 'fs', state: "./.state"}) {
        this.options = options;
        this.snapshots = [];
    }

    async load() {
        if (this.options.storage === 'knowledge') {
            this.snapshots = await SnapshotManager.loadFromKnowledge();
        } else if (this.options.storage === 'fs') {
            await this.loadFromFS();
        } else {
            throw new Error('Storage method not supported.');
        }
        return this.snapshots;
    }

    static async write(tp) {
        const {snapshot: snapshotOpts} = tp.options;
        if(!snapshotOpts){
            tp.logger.debug("no --snapshot options defined, skipping snapshot");
            return;
        }
        const snapshotStr = await tp.snapshot();
        const {storage = "fs", path = "./defaultSnapshot.json"} = snapshotOpts; // Default path if not provided

        if (storage === "fs") {
            try {
                await fs.writeFile(path, snapshotStr);
                tp.logger.info(`Snapshot saved to ${path}`);
            } catch (error) {
                console.error(`Failed to save snapshot to ${path}:`, error);
                throw error;
            }
        } else if (storage === "knowledge") {
            await SnapshotManager.writeToKnowledge(snapshotStr);
        } else {
            tp.logger.info('Storage method not supported.');
        }
    }

    /**
     * curl -X 'POST' -d '{
     *      "id":"homeWorldSnapshotExample",
     *      "snapshot": {
     *        "options":{"importPath":"./stated-workflow","snapshot":{"seconds":1}},
     *        "output":{"action":"{function:}","subscribe$":"'\''listening clientType=test'\''","subscribeParams":{"client":{"type":"test"},"source":"cloudEvent","subscriberId":"alertingActionWorkflow","to":"{function:}","type":"alertingTrigger"},"triggers":[]},
     *        "template":{"action":"${ function($trigger){( $console.log($trigger); $set('\''/triggers/-'\'', $trigger); $trigger)}}","subscribe$":"$subscribe(subscribeParams)","subscribeParams":{"client":{"type":"test"},"source":"cloudEvent","subscriberId":"alertingActionWorkflow","to":"/${action}","type":"alertingTrigger"},"triggers":[]}},
     *      "type":"snapshot"
     *    }'
     *   -H 'Accept: application/json' -H 'Content-Type: application/json' -H 'Layer-Id: 2d4866c4-0a45-41ec-a534-011e5f4d970a' -H 'Layer-Type: TENANT'
     *   'https://localhost:8081/knowledge-store/v2beta/objects/sesergeeworkflow:snapshot'
     *
     * @param snapshotStr
     * @param snapshotOpts
     * @returns {Promise<void>}
     */
    static async writeToKnowledge(snapshotStr) {
        if (!snapshotStr) {
            throw new Error('Snapshot string is required');
        }
        const snapshot = JSON.parse(snapshotStr);
        // workaround for the zodiac gateway

        const APPD_JSON_STORE_URL = process.env.APPD_JSON_STORE_URL || 'http://localhost:8081/knowledge-store';
        const objectPath = '/v2beta/objects/sesergeeworkflow:snapshot';
        const url = `${APPD_JSON_STORE_URL}${objectPath}`;

        // Sample headers used in both environments
        const headers = {
            'Accept': 'application/json',
            'Layer-Id': '2d4866c4-0a45-41ec-a534-011e5f4d970a',
            'Layer-Type': 'TENANT',
            'appd-pty': 'IlVTRVIi',
            'appd-pid': 'ImZvb0BiYXIuY29tIg=='
        };

        const data = StatedREPL.stringify({
            snapshot: snapshot,
            id: snapshot.options.snapshot.id,
            type: 'snapshot'
        })
        console.log(`attempting to save snapshot: ${data}`);

        // send the snapshot data to the knowledge store url (method POST)
        const result = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: data
        });

        if (!result.ok) {
            console.log(`Failed to save snapshot: ${result.status}:${result.statusText}`);
        }
    }

    /**
     * This method attempts to load snapshots from the COP knowledge Store APIs.
     *
     * It can run as a Zodiac function or on a developer laptop with support of fsoc proxy.
     *
     * A typical request from the laptop:
     *   curl -X 'GET' -H 'Accept: application/json' -H 'Layer-Id: 2d4866c4-0a45-41ec-a534-011e5f4d970a' -H 'Layer-Type: TENANT' -H'appd-pty: IlVTRVIi' -H'appd-pid: ImZvb0BiYXIuY29tIg==' localhost:8081/knowledge-store/v2beta/objects/sesergeeworkflow:snapshot/IOrRxuuAqh
     *
     * From a zodiac function:
     *   curl -X 'GET' -H 'Accept: application/json' -H 'Layer-Id: 2d4866c4-0a45-41ec-a534-011e5f4d970a' -H 'Layer-Type: TENANT' -H'appd-pty: IlVTRVIi' -H'appd-pid: ImZvb0BiYXIuY29tIg==' $APPD_JSON_STORE_URL/v2beta/objects/sesergeeworkflow:snapshot/IOrRxuuAqh
     *
     * it returns am array of snapshot objects (an example of a response is below is below)
     * {
     *   "total": 2,
     *   "items": [
     *     {
     *       "layerType": "TENANT",
     *       "id": "IOrRxuuAqh",
     *       "layerId": "2d4866c4-0a45-41ec-a534-011e5f4d970a",
     *       "data": {
     *         "id": "homeWorldSnapshotExample",
     *         "type": "snapshot",
     *         "snapshot": {
     *           "output": {
     *             "action": "{function:}",
     *             "triggers": [],
     *             "subscribeParams": {
     *               "to": "{function:}",
     *               "type": "alertingTrigger",
     *               "client": {
     *                 "type": "test"
     *               },
     *               "source": "cloudEvent",
     *               "subscriberId": "alertingActionWorkflow"
     *             }
     *           },
     *           "options": {
     *             "snapshot": {
     *               "seconds": 1
     *             },
     *             "importPath": "./stated-workflow"
     *           },
     *           "template": {
     *             "action": "${ function($trigger){( $console.log($trigger); $set('/triggers/-', $trigger); $trigger)}}",
     *             "triggers": [],
     *             "subscribe$": "$subscribe(subscribeParams)",
     *             "subscribeParams": {
     *               "to": "/${action}",
     *               "type": "alertingTrigger",
     *               "client": {
     *                 "type": "test"
     *               },
     *               "source": "cloudEvent",
     *               "subscriberId": "alertingActionWorkflow"
     *             }
     *           }
     *         }
     *       },
     *       "objectMimeType": "application/json",
     *       "targetObjectId": null,
     *       "patch": null,
     *       "objectVersion": 1,
     *       "blobInfo": null,
     *       "createdAt": "2024-05-06T21:26:45.836Z",
     *       "updatedAt": "2024-05-06T21:26:45.836Z",
     *       "objectType": "sesergeeworkflow:snapshot",
     *       "fqid": "sesergeeworkflow:snapshot/IOrRxuuAqh;layerId=2d4866c4-0a45-41ec-a534-011e5f4d970a;layerType=TENANT"
     *     },
     *     {
     *       "layerType": "TENANT",
     *       "id": "zq5bo7eVmi",
     *       "layerId": "2d4866c4-0a45-41ec-a534-011e5f4d970a",
     *       "data": {
     *         "id": "homeWorldSnapshotExample",
     *         "type": "snapshot",
     *         "snapshot": {
     *           "output": {
     *             "action": "{function:}",
     *             "triggers": [],
     *             "subscribe$": "'listening clientType=test'",
     *             "subscribeParams": {
     *               "to": "{function:}",
     *               "type": "alertingTrigger",
     *               "client": {
     *                 "type": "test"
     *               },
     *               "source": "cloudEvent",
     *               "subscriberId": "alertingActionWorkflow"
     *             }
     *           },
     *           "options": {
     *             "snapshot": {
     *               "seconds": 1
     *             },
     *             "importPath": "./stated-workflow"
     *           },
     *           "template": {
     *             "action": "${ function($trigger){( $console.log($trigger); $set('/triggers/-', $trigger); $trigger)}}",
     *             "triggers": [],
     *             "subscribe$": "$subscribe(subscribeParams)",
     *             "subscribeParams": {
     *               "to": "/${action}",
     *               "type": "alertingTrigger",
     *               "client": {
     *                 "type": "test"
     *               },
     *               "source": "cloudEvent",
     *               "subscriberId": "alertingActionWorkflow"
     *             }
     *           }
     *         }
     *       },
     *       "objectMimeType": "application/json",
     *       "targetObjectId": null,
     *       "patch": null,
     *       "objectVersion": 1,
     *       "blobInfo": null,
     *       "createdAt": "2024-05-06T22:50:54.143Z",
     *       "updatedAt": "2024-05-06T22:50:54.143Z",
     *       "objectType": "sesergeeworkflow:snapshot",
     *       "fqid": "sesergeeworkflow:snapshot/zq5bo7eVmi;layerId=2d4866c4-0a45-41ec-a534-011e5f4d970a;layerType=TENANT"
     *     }
     *   ]
     * }
     *
     * the fallback to zodiac function API call happens if $APPD_JSON_STORE_URL env variable is set
     * @returns {Promise<void>}
     */
    static async loadFromKnowledge() {
        // Get the environment variables for the Zodiac platform API endpoint
        const APPD_JSON_STORE_URL = process.env.APPD_JSON_STORE_URL || 'http://localhost:8081/knowledge-store';

        // Sample headers used in both environments
        const headers = {
            'Accept': 'application/json',
            'Layer-Id': '2d4866c4-0a45-41ec-a534-011e5f4d970a',
            'Layer-Type': 'TENANT',
            'appd-pty': 'IlVTRVIi',
            'appd-pid': 'ImZvb0BiYXIuY29tIg=='
        };

        // Define the specific object path, modify as needed
        const objectPath = '/v2beta/objects/sesergeeworkflow:snapshot';

        // Create the full URL
        const url = `${APPD_JSON_STORE_URL}${objectPath}`;

        try {
            // Fetch the snapshot data
            const response = await fetch(url, { method: 'GET', headers });

            if (!response.ok) {
                throw new Error(`Failed to load snapshots: ${response.statusText}`);
            }

            // Parse the JSON response
            const data = await response.json();

            // Ensure it is an array as described
            if (!Array.isArray(data.items)) {
                throw new Error('Unexpected data format: Expected an array of snapshot objects');
            }

            return data.items.map(item => item.data);
        } catch (error) {
            console.error('Error loading snapshots:', error.message);
            throw error;
        }
    }

    /**
     * Load snapshots from the file system state
     *
     * this method walks through this.options.state directory and loads and stores all the snapshots
     **/
    async loadFromFS() {
        const files = await fs.readdir(this.options.state);
        for (const file of files) {
            const snapshotContent = await fs.readFile(`${this.options.state}/${file}`, 'utf8');
            try {
                this.snapshots.push(JSON.parse(snapshotContent));
            } catch (error) {
                console.error(`Failed to parse snapshot ${file}:`, error);
            }
        }
    }

    static async readFromKnowledge(workflowId) {

        // Get the environment variables for the Zodiac platform API endpoint
        const APPD_JSON_STORE_URL = process.env.APPD_JSON_STORE_URL || 'http://localhost:8081/knowledge-store';

        // Sample headers used in both environments
        const headers = {
            'Accept': 'application/json',
            'Layer-Id': '2d4866c4-0a45-41ec-a534-011e5f4d970a',
            'Layer-Type': 'TENANT',
            'appd-pty': 'IlVTRVIi',
            'appd-pid': 'ImZvb0BiYXIuY29tIg=='
        };

        // Define the specific object path, modify as needed
        const objectPath = '/v2beta/objects/sesergeeworkflow:snapshot/' + workflowId;

        // Create the full URL
        const url = `${APPD_JSON_STORE_URL}${objectPath}`;

        try {
            // Fetch the snapshot data
            const response = await fetch(url, { method: 'GET', headers });

            if (!response.ok) {
                throw new Error(`Failed to load snapshots: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error loading snapshots:', error.message);
            throw error;
        }
    }
}
