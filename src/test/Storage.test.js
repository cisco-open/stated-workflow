import fs from 'fs-extra';
import path from 'path';
import { createStorage } from '../workflow/Storage.js';

describe('FSStorage', () => {
    const basePath = path.join(process.cwd(), '.test_state');
    let storage;

    beforeAll(async () => {
        storage = createStorage({ storage: 'fs', basePath });
        await storage.init();
    });

    afterAll(async () => {
        await fs.remove(basePath);
    });

    describe('Initialization', () => {
        test('should create the base directory', async () => {
            const exists = await fs.pathExists(basePath);
            expect(exists).toBe(true);
        });
    });

    describe('Write and Read', () => {
        test('should write and read data correctly', async () => {
            const testData = {
                rebels: {
                    '1': { name: 'Luke Skywalker', role: 'Jedi Knight' },
                    '2': { name: 'Leia Organa', role: 'Princess' }
                },
                sw_rebels: {
                    '1': { name: 'Han Solo', role: 'Captain' },
                    '2': { name: 'Chewbacca', role: 'Co-pilot' }
                }
            };

            await storage.write(testData);

            const allRebels = await storage.readAll('rebels');
            expect(allRebels).toHaveLength(2);
            expect(allRebels).toEqual(expect.arrayContaining([
                { name: 'Luke Skywalker', role: 'Jedi Knight' },
                { name: 'Leia Organa', role: 'Princess' }
            ]));

            const allSWRebels = await storage.readAll('sw_rebels');
            expect(allSWRebels).toHaveLength(2);
            expect(allSWRebels).toEqual(expect.arrayContaining([
                { name: 'Han Solo', role: 'Captain' },
                { name: 'Chewbacca', role: 'Co-pilot' }
            ]));

            const rebel1 = await storage.read('rebels', '1');
            expect(rebel1).toEqual({ name: 'Luke Skywalker', role: 'Jedi Knight' });

            const swRebel1 = await storage.read('sw_rebels', '1');
            expect(swRebel1).toEqual({ name: 'Han Solo', role: 'Captain' });
        });

        test('should throw an error if data is not an object', async () => {
            await expect(storage.write("string")).rejects.toThrow(TypeError);
        });
    });

    describe('Error Handling', () => {
        test('should throw an error if trying to read a non-existent type', async () => {
            await expect(storage.readAll('nonexistent')).rejects.toThrow();
        });

        test('should throw an error if trying to read a non-existent object', async () => {
            await expect(storage.read('rebels', 'nonexistent')).rejects.toThrow();
        });
    });
});
