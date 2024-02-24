export class PulsarClientMock {
  static inMemoryStore = new Map();
  static messageIdCounter = 0;
  static listeners = new Map();
  static ackTimeout = 30000;
  static acknowledgedMessages = new Map(); // Stores acknowledgments per subscriber ID per topic

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
        const messageId = new MessageId(`message-${++PulsarClientMock.messageIdCounter}`);
        const messageInstance = new Message(topic, undefined, message.data, messageId, Date.now(), Date.now(), 0, '');
        const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
        messages.push({ message: messageInstance, subscriberIds: new Set() }); // Track which subscribers have received the message

        // Ensure all subscribers are aware of the new message
        PulsarClientMock.notifyListeners(topic);

        return { messageId: messageId.toString() };
      },
      close: async () => {},
    };
  }

  /**
   * creates a consumer per topic and subscriberId. If more than one subscriber with the same subscriberId is created
   * for the same topic, they will process messages in a FIFO manner.
   */

  async subscribe(config) {
    const topic = config.topic;
    const subscriberId = config.subscription;


    return {

      /**
       * receives either returns the next visible message, or blocks until a message is available.
       */
      receive: () => {
        return new Promise((resolve) => {
          const tryResolve = () => {
            const messages = PulsarClientMock.inMemoryStore.get(topic) || [];
            const messageIndex = messages.findIndex(m => !m.subscriberIds.has(subscriberId));
            if (messageIndex !== -1) { // there a message available for this subscriber
              const message = messages[messageIndex];
              message.subscriberIds.add(subscriberId); // Mark as received by this subscriber

              // Make the message acknowledged after a timeout for this subscriber
              setTimeout(() => {
                if (!PulsarClientMock.isAcknowledged(topic, message.message.messageId.id, subscriberId)) {
                  // If not acknowledged, make it visible again to all subscribers
                  message.subscriberIds.delete(subscriberId);
                  PulsarClientMock.notifyListeners(topic);
                }
              }, PulsarClientMock.ackTimeout);

              resolve(message.message);

            } else { // no message available for this subscriber, wait for the next one
              if (!PulsarClientMock.listeners.has(topic)) {
                PulsarClientMock.listeners.set(topic, []);
              }
              // add this function invocation to the list of listeners for this topic
              PulsarClientMock.listeners.get(topic).push(tryResolve);
            }
          };

          tryResolve();
        });
      },
      acknowledge: async (message) => {/**/
        PulsarClientMock.acknowledgeMessage(topic, message.messageId.id, subscriberId);
      },
      acknowledgeId: async (messageId) => {
        PulsarClientMock.acknowledgeMessage(topic, messageId.id, subscriberId);
      },
      close: async () => {},
    };
  }

  static isAcknowledged(topic, messageId, subscriberId) {
    const topicAcks = this.acknowledgedMessages.get(topic);
    const subscriberAcks = topicAcks ? topicAcks.get(subscriberId) : undefined;
    return subscriberAcks ? subscriberAcks.has(messageId) : false;
  }

  static acknowledgeMessage(topic, messageId, subscriberId) {
    if (!this.acknowledgedMessages.has(topic)) {
      this.acknowledgedMessages.set(topic, new Map());
    }

    const topicAcks = this.acknowledgedMessages.get(topic);
    if (!topicAcks.has(subscriberId)) {
      topicAcks.set(subscriberId, new Set());
    }

    const subscriberAcks = topicAcks.get(subscriberId);
    subscriberAcks.add(messageId);
  }

  static getTopics() {
    return Array.from(PulsarClientMock.inMemoryStore.keys());
  }

  static getStats(topic, subscriberId) {
    const messages = this.inMemoryStore.get(topic) || [];
    const topicAcks = this.acknowledgedMessages.get(topic);
    const subscriberAcks = topicAcks ? (topicAcks.get(subscriberId) || new Set()) : new Set();

    // Calculate inFlight count as messages not yet acknowledged by this subscriber
    const inFlight = messages.filter(m => !subscriberAcks.has(m.message.messageId.id)).length;
    // Queue length includes messages not yet received or acknowledged by this subscriber
    const queueLength = messages.length - subscriberAcks.size;

    return {
      acknowledgedCount: subscriberAcks.size,
      inFlightCount: inFlight,
      queueLength,
    };
  }

  static getAcknowledgedMessages(topic, subscriberId) {
    const topicAcks = this.acknowledgedMessages.get(topic);
    const subscriberAcks = topicAcks ? topicAcks.get(subscriberId) : undefined;

    if (!subscriberAcks) {
      return [];
    }

    const messages = this.inMemoryStore.get(topic) || [];
    // Filter messages that have been acknowledged by the subscriber
    return messages
      .filter(m => subscriberAcks.has(m.message.messageId.id))
      .map(m => m.message);
  }

  /**
   * Notify all listeners for a topic about a message available.
   * A listener is a receive invocation that is waiting for a message to be available.
   * A message can be a new one, or the one with expired visibility timeout
   */
  static notifyListeners(topic) {
    const listeners = PulsarClientMock.listeners.get(topic) || [];
    while (listeners.length > 0) {
      const listener = listeners.shift();
      listener();
    }
  }

  static clear() {
    PulsarClientMock.inMemoryStore.clear();
    PulsarClientMock.listeners.clear();
    PulsarClientMock.acknowledgedMessages.clear();
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