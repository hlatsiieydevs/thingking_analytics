/**
 * Shared System Constants and Types
 */

// MQTT Topics
export const MQTT_TOPICS = {
  DWELL_TIME: 'nodes/+/telemetry/dwell',
  TRAFFIC_FLOW: 'nodes/+/telemetry/traffic',
  SYSTEM_METRICS: 'nodes/+/telemetry/metrics',
};

// RabbitMQ Queue names
export const RABBITMQ_QUEUES = {
  REALTIME: 'realtime_queue',
  BACKLOG: 'backlog_queue',
};

// RabbitMQ Exchange names
export const RABBITMQ_EXCHANGES = {
  BACKLOG: 'backlog_exchange',
};

// RabbitMQ Routing keys
export const RABBITMQ_ROUTING_KEYS = {
  BACKLOG_UPLOADED: 'backlog.uploaded',
};

/**
 * DataLakeStorage Interface (Abstract Base Class)
 * Defines the contract for raw telemetry storage.
 */
export class DataLakeStorage {
  /**
   * Saves a raw telemetry payload.
   * @param {string} path - Target path / object key.
   * @param {string|Buffer} content - File content.
   * @returns {Promise<void>}
   */
  async write(path, content) {
    throw new Error('Method "write" must be implemented by subclasses.');
  }

  /**
   * Reads a raw telemetry payload.
   * @param {string} path - Target path / object key.
   * @returns {Promise<Buffer>}
   */
  async read(path) {
    throw new Error('Method "read" must be implemented by subclasses.');
  }
}
