export class PulsarClientMock {
  static inMemoryStore = new Map();
  static messageIdCounter = 0;
  static listeners = new Map();
  static ackTimeout = 30000;
  static acknowledgedMessages = new Map();
  static operationLocks = new Map(); // Map to keep track of ongoing operations by topic

  // Helper method to lock operations per topic
  static async lockOperation(topic) {
    while (this.operationLocks.get(topic)) {
      await this.operationLocks.get(topic);
    }
    let resolveLock;
    const lockPromise = new Promise(resolve => resolveLock = resolve);
    this.operationLocks.set(topic, lockPromise);
    return resolveLock;
  }

  static configureAckTimeout(timeout) {
    this.ackTimeout = timeout;
  }

  async createProducer(config) {
    const topic = config.topic;
    if (!PulsarClientMock.inMemoryStore.has(topic)) {
      PulsarClientMock.inMemoryStore.set(topic, []);
    }

    return {
      send: async (message) => {
        const resolveLock = await PulsarClientMock.lockOperation(topic); // Lock operation for topic
        try {
          const messageId = new MessageId(`message-${++PulsarClientMock.messageIdCounter}`);
          const messageInstance = new Message(topic, undefined, message.data, messageId, Date.now(), Date.now(), 0, '');
          const messages = PulsarClientMock.inMemoryStore.get(topic);
          messages.push({ message: messageInstance, visible: true });

          PulsarClientMock.notifyListeners(topic);
          return { messageId: messageId.toString() };
        } finally {
          resolveLock(); // Unlock operation for topic
          PulsarClientMock.operationLocks.delete(topic); // Cleanup lock
        }
      },
      close: async () => {},
    };
  }

  async subscribe(config) {
    const topic = config.topic;

    return {
      receive: () => {
        return new Promise((resolve) => {
          const tryResolve = () => {
            const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
            const messageIndex = messages.findIndex(m => m.visible);
            if (messageIndex !== -1) {
              // Make the message temporarily invisible to simulate message locking
              messages[messageIndex].visible = false;
              setTimeout(() => {
                // Make the message visible again after the timeout
                messages[messageIndex].visible = true;
                PulsarClientMock.notifyListeners(topic);
              }, PulsarClientMock.ackTimeout);
              resolve(messages[messageIndex].message);
            } else {
              // No visible messages available, wait for new messages
              if (!PulsarClientMock.listeners.has(topic)) {
                PulsarClientMock.listeners.set(topic, []);
              }
              PulsarClientMock.listeners.get(topic).push(tryResolve);
            }
          };

          tryResolve();
        });
      },
      acknowledge: async (message) => {
        const resolveLock = await PulsarClientMock.lockOperation(topic); // Lock operation for topic
        try {
          await PulsarClientMock.acknowledgeMessage(topic, message.messageId.id);
        } finally {
          resolveLock(); // Unlock operation for topic
          PulsarClientMock.operationLocks.delete(topic); // Cleanup lock
        }
      },
      acknowledgeId: async (messageId) => {
        const resolveLock = await PulsarClientMock.lockOperation(topic); // Lock operation for topic
        try {
          await PulsarClientMock.acknowledgeMessage(topic, messageId.id);
        } finally {
          resolveLock(); // Unlock operation for topic
          PulsarClientMock.operationLocks.delete(topic); // Cleanup lock
        }
      },
      close: async () => {},
    };
  }

  static async acknowledgeMessage(topic, messageId) {
    // No need to lock here since it's already locked in acknowledge and acknowledgeId methods
    const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
    const messageIndex = messages.findIndex(m => m.message.messageId.id === messageId);
    if (messageIndex !== -1) {
      const [acknowledgedMessage] = messages.splice(messageIndex, 1);
      if (!this.acknowledgedMessages.has(topic)) {
        this.acknowledgedMessages.set(topic, []);
      }
      this.acknowledgedMessages.get(topic).push(acknowledgedMessage.message);
    }
  }


  static getTopics() {
    return Array.from(PulsarClientMock.inMemoryStore.keys());
  }

  // Method to return statistics for the client
  static getStats(topic) {
    const messages = this.inMemoryStore.get(topic) || [];
    const acknowledged = this.acknowledgedMessages.get(topic) || [];
    const inFlight = messages.filter(m => !m.visible).length;
    const queueLength = messages.length + acknowledged.length;

    return {
      acknowledgedCount: acknowledged.length,
      inFlightCount: inFlight,
      queueLength,
    };
  }

  // Method to return all acknowledged messages for a topic
  static getAcknowledgedMessages(topic) {
    return this.acknowledgedMessages.get(topic) || [];
  }

  static clear() {
    PulsarClientMock.inMemoryStore.clear();
    PulsarClientMock.listeners.clear();
    PulsarClientMock.acknowledgedMessages.clear();
  }

  static notifyListeners(topic) {
    const listeners = PulsarClientMock.listeners.get(topic) || [];
    while (listeners.length > 0) {
      const listener = listeners.shift();
      listener();
    }
  }

  close() {
    return Promise.resolve(null);
  }
}

export class MessageId {
  constructor(id) {
    this.id = id;
  }

  static earliest() {
    return new MessageId("earliest");
  }

  static latest() {
    return new MessageId("latest");
  }

  static deserialize(data) {
    // Assuming the input data is a Buffer containing a string ID
    return new MessageId(data.toString());
  }

  serialize() {
    // Convert the ID to a Buffer
    return Buffer.from(this.id);
  }

  toString() {
    return this.id;
  }
}

export class Message {
  constructor(topicName, properties, data, messageId, publishTimestamp, eventTimestamp, redeliveryCount, partitionKey) {
    this.topicName = topicName;
    this.properties = properties;
    this.data = data;
    this.messageId = messageId;
    this.publishTimestamp = publishTimestamp;
    this.eventTimestamp = eventTimestamp;
    this.redeliveryCount = redeliveryCount;
    this.partitionKey = partitionKey;
  }

  getTopicName() {
    return this.topicName;
  }

  getProperties() {
    return this.properties;
  }

  getData() {
    return this.data;
  }

  getMessageId() {
    return this.messageId;
  }

  getPublishTimestamp() {
    return this.publishTimestamp;
  }

  getEventTimestamp() {
    return this.eventTimestamp;
  }

  getRedeliveryCount() {
    return this.redeliveryCount;
  }

  getPartitionKey() {
    return this.partitionKey;
  }
}