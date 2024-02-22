export class PulsarClientMock {
  constructor() {
    this.inMemoryStore = new Map();
    this.messageIdCounter = 0;
    this.listeners = new Map(); // Add this to track listeners per topic
  }

  async createProducer(config) {
    const topic = config.topic;
    if (!this.inMemoryStore.has(topic)) {
      this.inMemoryStore.set(topic, []);
    }

    return {
      send: async (message) => {
        const messageId = new MessageId(`message-${++this.messageIdCounter}`);
        const messageInstance = new Message(topic, undefined, message.data, messageId);
        const messages = this.inMemoryStore.get(topic) || [];
        messages.push(messageInstance);

        // Notify listeners that a new message is available
        const listeners = this.listeners.get(topic) || [];
        if (listeners.length > 0) {
          const listener = listeners.shift(); // Remove the listener from the queue
          listener(messageInstance); // Resolve the listener's promise with the new message
        }

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
          const messages = this.inMemoryStore.get(topic) || [];
          if (messages.length > 0) {
            // Immediately resolve with the next message if available
            const message = messages.shift(); // Assuming FIFO delivery
            resolve(message);
          } else {
            // No messages available, add listener to be resolved later
            if (!this.listeners.has(topic)) {
              this.listeners.set(topic, []);
            }
            this.listeners.get(topic).push(resolve);
          }
        });
      },
      acknowledge: async (message) => {
        // Acknowledge logic here (not directly relevant to the blocking receive)
      },
      acknowledgeId: async (messageId) => {
        // AcknowledgeId logic here
      },
      close: async () => {},
    };
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