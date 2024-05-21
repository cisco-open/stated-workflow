// snapshotManager.test.ts
import { SnapshotManager } from '../workflow/SnapshotManager.js';
import fetchMock from 'jest-fetch-mock';

fetchMock.enableMocks();

describe('Snapshot.loadFromKnowledge', () => {
    const sampleSnapshotResponse = {
        "total": 2,
        "items": [
            {
                "layerType": "TENANT",
                "id": "IOrRxuuAqh",
                "layerId": "2d4866c4-0a45-41ec-a534-011e5f4d970a",
                "data": {
                    "id": "homeWorldSnapshotExample",
                    "type": "snapshot",
                    "snapshot": {
                        "output": {
                            "action": "{function:}",
                            "triggers": [],
                            "subscribeParams": {
                                "to": "{function:}",
                                "type": "alertingTrigger",
                                "client": {
                                    "type": "test"
                                },
                                "source": "cloudEvent",
                                "subscriberId": "alertingActionWorkflow"
                            }
                        },
                        "options": {
                            "snapshot": {
                                "seconds": 1
                            },
                            "importPath": "./stated-workflow"
                        },
                        "template": {
                            "action": "${ function($trigger){( $console.log($trigger); $set('/triggers/-', $trigger); $trigger)}}",
                            "triggers": [],
                            "subscribe$": "$subscribe(subscribeParams)",
                            "subscribeParams": {
                                "to": "/${action}",
                                "type": "alertingTrigger",
                                "client": {
                                    "type": "test"
                                },
                                "source": "cloudEvent",
                                "subscriberId": "alertingActionWorkflow"
                            }
                        }
                    }
                },
                "objectMimeType": "application/json",
                "targetObjectId": null,
                "patch": null,
                "objectVersion": 1,
                "blobInfo": null,
                "createdAt": "2024-05-06T21:26:45.836Z",
                "updatedAt": "2024-05-06T21:26:45.836Z",
                "objectType": "sesergeeworkflow:snapshot",
                "fqid": "sesergeeworkflow:snapshot/IOrRxuuAqh;layerId=2d4866c4-0a45-41ec-a534-011e5f4d970a;layerType=TENANT"
            },
            {
                "layerType": "TENANT",
                "id": "zq5bo7eVmi",
                "layerId": "2d4866c4-0a45-41ec-a534-011e5f4d970a",
                "data": {
                    "id": "homeWorldSnapshotExample",
                    "type": "snapshot",
                    "snapshot": {
                        "output": {
                            "action": "{function:}",
                            "triggers": [],
                            "subscribe$": "'listening clientType=test'",
                            "subscribeParams": {
                                "to": "{function:}",
                                "type": "alertingTrigger",
                                "client": {
                                    "type": "test"
                                },
                                "source": "cloudEvent",
                                "subscriberId": "alertingActionWorkflow"
                            }
                        },
                        "options": {
                            "snapshot": {
                                "seconds": 1
                            },
                            "importPath": "./stated-workflow"
                        },
                        "template": {
                            "action": "${ function($trigger){( $console.log($trigger); $set('/triggers/-', $trigger); $trigger)}}",
                            "triggers": [],
                            "subscribe$": "$subscribe(subscribeParams)",
                            "subscribeParams": {
                                "to": "/${action}",
                                "type": "alertingTrigger",
                                "client": {
                                    "type": "test"
                                },
                                "source": "cloudEvent",
                                "subscriberId": "alertingActionWorkflow"
                            }
                        }
                    }
                },
                "objectMimeType": "application/json",
                "targetObjectId": null,
                "patch": null,
                "objectVersion": 1,
                "blobInfo": null,
                "createdAt": "2024-05-06T22:50:54.143Z",
                "updatedAt": "2024-05-06T22:50:54.143Z",
                "objectType": "sesergeeworkflow:snapshot",
                "fqid": "sesergeeworkflow:snapshot/zq5bo7eVmi;layerId=2d4866c4-0a45-41ec-a534-011e5f4d970a;layerType=TENANT"
            }
        ]
    };

    const expectedSnapshotsResult = [
        {
            "id": "homeWorldSnapshotExample",
            "type": "snapshot",
            "snapshot": {
                "output": {
                    "action": "{function:}",
                    "triggers": [],
                    "subscribeParams": {
                        "to": "{function:}",
                        "type": "alertingTrigger",
                        "client": {
                            "type": "test"
                        },
                        "source": "cloudEvent",
                        "subscriberId": "alertingActionWorkflow"
                    }
                },
                "options": {
                    "snapshot": {
                        "seconds": 1
                    },
                    "importPath": "./stated-workflow"
                },
                "template": {
                    "action": "${ function($trigger){( $console.log($trigger); $set('/triggers/-', $trigger); $trigger)}}",
                    "triggers": [],
                    "subscribe$": "$subscribe(subscribeParams)",
                    "subscribeParams": {
                        "to": "/${action}",
                        "type": "alertingTrigger",
                        "client": {
                            "type": "test"
                        },
                        "source": "cloudEvent",
                        "subscriberId": "alertingActionWorkflow"
                    }
                }
            }
        },
        {
            "id": "homeWorldSnapshotExample",
            "type": "snapshot",
            "snapshot": {
                "output": {
                    "action": "{function:}",
                    "triggers": [],
                    "subscribe$": "'listening clientType=test'",
                    "subscribeParams": {
                        "to": "{function:}",
                        "type": "alertingTrigger",
                        "client": {
                            "type": "test"
                        },
                        "source": "cloudEvent",
                        "subscriberId": "alertingActionWorkflow"
                    }
                },
                "options": {
                    "snapshot": {
                        "seconds": 1
                    },
                    "importPath": "./stated-workflow"
                },
                "template": {
                    "action": "${ function($trigger){( $console.log($trigger); $set('/triggers/-', $trigger); $trigger)}}",
                    "triggers": [],
                    "subscribe$": "$subscribe(subscribeParams)",
                    "subscribeParams": {
                        "to": "/${action}",
                        "type": "alertingTrigger",
                        "client": {
                            "type": "test"
                        },
                        "source": "cloudEvent",
                        "subscriberId": "alertingActionWorkflow"
                    }
                }
            }
        }
    ]

    beforeEach(() => {
        // Reset environment variables and mocks
        fetchMock.resetMocks();
        delete process.env.APPD_JSON_STORE_URL;
    });

    it('should load snapshots from local development environment', async () => {
        // Mock the local development server response
        fetchMock.mockResponseOnce(JSON.stringify(sampleSnapshotResponse));
        const snapshots = await SnapshotManager.loadFromKnowledge();

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:8081/knowledge-store/v2beta/objects/sesergeeworkflow:snapshot',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Accept': 'application/json',
                    'Layer-Id': '2d4866c4-0a45-41ec-a534-011e5f4d970a',
                    'Layer-Type': 'TENANT',
                    'appd-pty': 'IlVTRVIi',
                    'appd-pid': 'ImZvb0BiYXIuY29tIg=='
                })
            })
        );

        // Check if the returned data matches the mocked response
        expect(snapshots).toEqual(expectedSnapshotsResult);
    });

    it('should load snapshots from Zodiac function environment', async () => {
        // Set the environment variable to simulate the Zodiac function environment
        process.env.APPD_JSON_STORE_URL = 'http://knowledge.local';

        // Mock the Zodiac server response
        fetchMock.mockResponseOnce(JSON.stringify(sampleSnapshotResponse));
        const snapshots = await SnapshotManager.loadFromKnowledge();

        expect(fetchMock).toHaveBeenCalledWith(
            'http://knowledge.local/v2beta/objects/sesergeeworkflow:snapshot',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Accept': 'application/json',
                    'Layer-Id': '2d4866c4-0a45-41ec-a534-011e5f4d970a',
                    'Layer-Type': 'TENANT',
                    'appd-pty': 'IlVTRVIi',
                    'appd-pid': 'ImZvb0BiYXIuY29tIg=='
                })
            })
        );

        // Check if the returned data matches the mocked response
        expect(snapshots).toEqual(expectedSnapshotsResult);
    });
});
