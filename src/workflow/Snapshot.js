import { promises as fs } from 'fs';

export class Snapshot {

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
        } else {
            tp.logger.info('Storage method not supported.');
        }
    }
}
