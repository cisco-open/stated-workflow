export class PulsarClientMock {
  static inMemoryStore = new Map(); // Static store to survive client restarts
  static messageIdCounter = 0; // Global message ID counter
  static listeners = new Map(); // Global listeners map

  constructor() {
    // No longer needed to initialize static properties in the constructor
  }

  async createProducer(config) {
    const topic = config.topic;
    if (!PulsarClientMock.inMemoryStore.has(topic)) {
      PulsarClientMock.inMemoryStore.set(topic, []);
    }

    return {
      send: async (message) => {
        const messageId = new MessageId(`message-${++PulsarClientMock.messageIdCounter}`);
        const messageInstance = new Message(topic, undefined, message.data, messageId, Date.now(), Date.now(), 0, '');
        const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
        messages.push({ message: messageInstance, visible: true });

        // Notify listeners that a new message is available
        PulsarClientMock.notifyListeners(topic);

        return { messageId: messageId.toString() };
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
              // Make the message invisible for a certain timeout
              messages[messageIndex].visible = false;
              setTimeout(() => {
                messages[messageIndex].visible = true;
                PulsarClientMock.notifyListeners(topic);
              }, 30000); // 30 seconds timeout
              resolve(messages[messageIndex].message);
            } else {
              // No visible messages available, add listener to be resolved later
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
        const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
        const messageIndex = messages.findIndex(m => m.message.messageId.id === message.messageId.id);
        if (messageIndex !== -1) {
          messages.splice(messageIndex, 1); // Remove the acknowledged message
        }
      },
      acknowledgeId: async (messageId) => {
        const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
        const messageIndex = messages.findIndex(m => m.message.messageId.id === messageId.id);
        if (messageIndex !== -1) {
          messages.splice(messageIndex, 1); // Remove the acknowledged message
        }
      },
      close: async () => {},
    };
  }

  static clear() {
    PulsarClientMock.inMemoryStore.clear();
    PulsarClientMock.listeners.clear();
  }

  static notifyListeners(topic) {
    const listeners = PulsarClientMock.listeners.get(topic) || [];
    while (listeners.length > 0) {
      const listener = listeners.shift(); // Remove the listener from the queue
      listener(); // Try resolving a listener with any newly available message
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