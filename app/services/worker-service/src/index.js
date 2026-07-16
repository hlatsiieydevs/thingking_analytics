import amqp from 'amqplib';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { prisma } from '@thingking/db';
import { DataLakeStorage, RABBITMQ_QUEUES, RABBITMQ_EXCHANGES, RABBITMQ_ROUTING_KEYS } from '@thingking/shared';

// Load environment variables
dotenv.config();

// Define local data lake path
const DATA_LAKE_PATH = process.env.DATA_LAKE_LOCAL_PATH || './data_lake_raw';
if (!fs.existsSync(DATA_LAKE_PATH)) {
  fs.mkdirSync(DATA_LAKE_PATH, { recursive: true });
}

/**
 * Local Disk Data Lake Driver Implementation
 */
class LocalDiskStorage extends DataLakeStorage {
  async write(filePath, content) {
    const fullPath = path.join(DATA_LAKE_PATH, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(fullPath, content);
    console.log(`[Data Lake] Successfully wrote raw telemetry to: ${filePath}`);
  }

  async read(filePath) {
    const fullPath = path.join(DATA_LAKE_PATH, filePath);
    return await fs.promises.readFile(fullPath);
  }
}

const dataLake = new LocalDiskStorage();

async function start() {
  const amqpUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  
  try {
    console.log('[Worker] Connecting to RabbitMQ at:', amqpUrl);
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    // Ensure queue assertions
    await channel.assertQueue(RABBITMQ_QUEUES.REALTIME, { durable: true });
    await channel.assertQueue(RABBITMQ_QUEUES.BACKLOG, { durable: true });

    // Ensure backlog exchange and bindings
    await channel.assertExchange(RABBITMQ_EXCHANGES.BACKLOG, 'topic', { durable: true });
    await channel.bindQueue(RABBITMQ_QUEUES.BACKLOG, RABBITMQ_EXCHANGES.BACKLOG, RABBITMQ_ROUTING_KEYS.BACKLOG_UPLOADED);

    console.log('[Worker] RabbitMQ Connection established. Waiting for messages...');

    // 1. Consumer for Real-Time Telemetry
    channel.consume(RABBITMQ_QUEUES.REALTIME, async (msg) => {
      if (!msg) return;
      try {
        const payloadString = msg.content.toString();
        const telemetry = JSON.parse(payloadString);
        console.log(`[Worker] Received live telemetry from Node: ${telemetry.node_id}`);

        // Save raw telemetry to data lake
        const rawPath = `raw-telemetry/${telemetry.node_id}/${new Date().toISOString().slice(0, 10)}/${telemetry.event_id}.json`;
        await dataLake.write(rawPath, payloadString);

        // Parse and insert to Postgres based on topic/payload fields
        if (telemetry.dwell_time_sec !== undefined) {
          // Dwell Time event
          await prisma.dwellTimeLog.upsert({
            where: {
              nodeId_timestamp_trackId: {
                nodeId: telemetry.node_id,
                timestamp: new Date(telemetry.timestamp * 1000),
                trackId: telemetry.track_id,
              },
            },
            update: {},
            create: {
              eventId: telemetry.event_id,
              nodeId: telemetry.node_id,
              timestamp: new Date(telemetry.timestamp * 1000),
              trackId: telemetry.track_id,
              zoneId: telemetry.zone_id,
              dwellTimeSec: telemetry.dwell_time_sec,
            },
          });
        } else if (telemetry.flow_records !== undefined) {
          // Traffic Flow events
          for (const record of telemetry.flow_records) {
            await prisma.trafficFlowLog.upsert({
              where: {
                nodeId_timestamp_trackId_x_y: {
                  nodeId: telemetry.node_id,
                  timestamp: new Date(telemetry.timestamp * 1000),
                  trackId: record.track_id,
                  x: record.x,
                  y: record.y,
                },
              },
              update: {},
              create: {
                eventId: telemetry.event_id,
                nodeId: telemetry.node_id,
                timestamp: new Date(telemetry.timestamp * 1000),
                trackId: record.track_id,
                x: record.x,
                y: record.y,
              },
            });
          }
        } else if (telemetry.metrics !== undefined) {
          // System metrics
          await prisma.systemMetric.upsert({
            where: {
              nodeId_timestamp: {
                nodeId: telemetry.node_id,
                timestamp: new Date(telemetry.timestamp * 1000),
              },
            },
            update: {},
            create: {
              eventId: telemetry.event_id,
              nodeId: telemetry.node_id,
              timestamp: new Date(telemetry.timestamp * 1000),
              cpuLoadPercent: telemetry.metrics.cpu_load_percent,
              ramUsagePercent: telemetry.metrics.ram_usage_percent,
              vramUsageMb: telemetry.metrics.vram_usage_mb,
              currentFps: telemetry.metrics.current_fps,
              livePeopleCount: telemetry.metrics.live_people_count,
              zoneCounts: telemetry.metrics.zone_counts,
            },
          });
        }

        channel.ack(msg);
      } catch (error) {
        console.error('[Worker] Error processing real-time telemetry:', error.message);
        // Nack & requeue if transient, else ack to avoid infinite loop
        channel.ack(msg);
      }
    });

    // 2. Consumer for Offline Backlog Archives
    channel.consume(RABBITMQ_QUEUES.BACKLOG, async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString());
        const { node_id, file_path } = payload;
        console.log(`[Worker] Started processing backlog database for node: ${node_id} at ${file_path}`);

        if (!fs.existsSync(file_path)) {
          throw new Error(`Gzip file not found: ${file_path}`);
        }

        // Decompress SQLite DB
        const decompressedPath = file_path.replace('.gz', '');
        const gzipBuffer = fs.readFileSync(file_path);
        const dbBuffer = zlib.gunzipSync(gzipBuffer);
        fs.writeFileSync(decompressedPath, dbBuffer);
        console.log(`[Worker] Decompressed SQLite DB to: ${decompressedPath}`);

        // Open SQLite connection
        const db = await open({
          filename: decompressedPath,
          driver: sqlite3.Database,
        });

        // 1. Process Dwell Time Logs
        try {
          const dwellRows = await db.all('SELECT event_id, timestamp, track_id, zone_id, dwell_time_sec FROM dwell_time_logs');
          console.log(`[Worker] Backlog found ${dwellRows.length} dwell records`);
          for (const row of dwellRows) {
            await prisma.dwellTimeLog.upsert({
              where: {
                nodeId_timestamp_trackId: {
                  nodeId: node_id,
                  timestamp: new Date(row.timestamp * 1000),
                  trackId: row.track_id,
                },
              },
              update: {},
              create: {
                eventId: row.event_id,
                nodeId: node_id,
                timestamp: new Date(row.timestamp * 1000),
                trackId: row.track_id,
                zoneId: row.zone_id,
                dwellTimeSec: row.dwell_time_sec,
              },
            });
          }
        } catch (err) {
          console.warn('[Worker] No dwell logs table or reading failed:', err.message);
        }

        // 2. Process Traffic Flow Logs
        try {
          const trafficRows = await db.all('SELECT event_id, timestamp, track_id, x, y FROM traffic_flow');
          console.log(`[Worker] Backlog found ${trafficRows.length} traffic records`);
          for (const row of trafficRows) {
            await prisma.trafficFlowLog.upsert({
              where: {
                nodeId_timestamp_trackId_x_y: {
                  nodeId: node_id,
                  timestamp: new Date(row.timestamp * 1000),
                  trackId: row.track_id,
                  x: row.x,
                  y: row.y,
                },
              },
              update: {},
              create: {
                eventId: row.event_id,
                nodeId: node_id,
                timestamp: new Date(row.timestamp * 1000),
                trackId: row.track_id,
                x: row.x,
                y: row.y,
              },
            });
          }
        } catch (err) {
          console.warn('[Worker] No traffic logs table or reading failed:', err.message);
        }

        // 3. Process System Metrics
        try {
          const metricRows = await db.all(
            'SELECT event_id, timestamp, cpu_load_percent, ram_usage_percent, vram_usage_mb, current_fps, live_people_count, zone_counts FROM system_metrics'
          );
          console.log(`[Worker] Backlog found ${metricRows.length} system metrics records`);
          for (const row of metricRows) {
            const zoneCountsParsed = typeof row.zone_counts === 'string' ? JSON.parse(row.zone_counts) : row.zone_counts;
            await prisma.systemMetric.upsert({
              where: {
                nodeId_timestamp: {
                  nodeId: node_id,
                  timestamp: new Date(row.timestamp * 1000),
                },
              },
              update: {},
              create: {
                eventId: row.event_id,
                nodeId: node_id,
                timestamp: new Date(row.timestamp * 1000),
                cpuLoadPercent: row.cpu_load_percent,
                ramUsagePercent: row.ram_usage_percent,
                vramUsageMb: row.vram_usage_mb,
                currentFps: row.current_fps,
                livePeopleCount: row.live_people_count,
                zoneCounts: Array.isArray(zoneCountsParsed) ? zoneCountsParsed : [],
              },
            });
          }
        } catch (err) {
          console.warn('[Worker] No system metrics table or reading failed:', err.message);
        }

        // Clean up SQLite DB
        await db.close();
        fs.unlinkSync(decompressedPath);
        fs.unlinkSync(file_path);
        console.log(`[Worker] Successfully completed backlog processing and cleaned files for node: ${node_id}`);

        channel.ack(msg);
      } catch (error) {
        console.error('[Worker] Error processing backlog database archive:', error);
        channel.ack(msg); // acknowledge to remove from queue and log error, preventing infinite loop
      }
    });

  } catch (error) {
    console.error('[Worker] Fatal setup error. Retrying in 10s...', error.message);
    setTimeout(start, 10000);
  }
}

start();
