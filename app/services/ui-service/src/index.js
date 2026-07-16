import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import amqp from 'amqplib';
import http from 'http';
import dotenv from 'dotenv';
import { prisma } from '@thingking/db';
import { RABBITMQ_QUEUES } from '@thingking/shared';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.UI_PORT || 5000;

app.use(cors());
app.use(express.json());

// Setup WebSocket Server
const wss = new WebSocketServer({ server });
const connectedClients = new Set();

wss.on('connection', (ws) => {
  console.log('[UI API] New WebSocket client connected');
  connectedClients.add(ws);

  ws.on('close', () => {
    console.log('[UI API] WebSocket client disconnected');
    connectedClients.delete(ws);
  });
});

// Broadcast helper
const broadcastToClients = (data) => {
  const payload = JSON.stringify(data);
  for (const client of connectedClients) {
    if (client.readyState === 1) { // OPEN state
      client.send(payload);
    }
  }
};

// RabbitMQ Integration - Listen for live broadcasts
async function connectRabbitMQ() {
  const amqpUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  try {
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    // Create an exclusive, non-durable temporary queue for this UI server instance
    // so it doesn't conflict with the worker service's queue.
    const q = await channel.assertQueue('', { exclusive: true });
    
    // Bind to telemetry topics (wildcard matching nodes)
    // In RabbitMQ MQTT plugin, topics like 'nodes/{node_id}/telemetry/dwell' map to topic routing keys.
    // We bind our queue to topics using wildcards.
    await channel.bindQueue(q.queue, 'amq.topic', 'nodes.*.telemetry.dwell');
    await channel.bindQueue(q.queue, 'amq.topic', 'nodes.*.telemetry.traffic');
    await channel.bindQueue(q.queue, 'amq.topic', 'nodes.*.telemetry.metrics');

    console.log('[UI API] WebSocket Gateway bound to RabbitMQ live topics.');

    channel.consume(q.queue, (msg) => {
      if (msg) {
        try {
          const telemetryData = JSON.parse(msg.content.toString());
          // Broadcast live edge telemetry to all active frontend browsers
          broadcastToClients({
            type: 'telemetry_event',
            topic: msg.fields.routingKey,
            data: telemetryData,
          });
        } catch (e) {
          console.error('[UI API] Failed to parse broadcast message:', e.message);
        }
        channel.ack(msg);
      }
    });

  } catch (error) {
    console.error('[UI API] RabbitMQ WebSocket subscription failed, retrying in 10s...', error.message);
    setTimeout(connectRabbitMQ, 10000);
  }
}

connectRabbitMQ();

// REST APIs for historical dashboard queries
app.get('/api/v1/analytics/dwell', async (req, res) => {
  try {
    const logs = await prisma.dwellTimeLog.findMany({
      take: 100,
      orderBy: { timestamp: 'desc' },
      include: { node: true },
    });
    res.json(logs);
  } catch (error) {
    console.error('[UI API] Fetch dwell error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/v1/analytics/traffic', async (req, res) => {
  try {
    const logs = await prisma.trafficFlowLog.findMany({
      take: 100,
      orderBy: { timestamp: 'desc' },
      include: { node: true },
    });
    res.json(logs);
  } catch (error) {
    console.error('[UI API] Fetch traffic error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/v1/analytics/metrics', async (req, res) => {
  try {
    const logs = await prisma.systemMetric.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' },
      include: { node: true },
    });
    res.json(logs);
  } catch (error) {
    console.error('[UI API] Fetch metrics error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ui-service' });
});

server.listen(PORT, () => {
  console.log(`[UI API] UI Backend running on port ${PORT}`);
});
