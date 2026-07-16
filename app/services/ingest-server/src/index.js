import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import amqp from 'amqplib';
import dotenv from 'dotenv';
import { prisma } from '@thingking/db';
import { RABBITMQ_EXCHANGES, RABBITMQ_ROUTING_KEYS } from '@thingking/shared';

// Load env variables
dotenv.config();

const app = express();
const PORT = process.env.INGEST_PORT || 4000;
const UPLOAD_DIR = process.env.BACKLOG_UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config for disk storage within workspace
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const nodeId = req.headers['x-node-id'] || 'unknown';
    const timestamp = Date.now();
    cb(null, `backlog_${nodeId}_${timestamp}.db.gz`);
  },
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());

// Stub Authorization Middleware
const authenticateNode = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const nodeId = req.headers['x-node-id'];

  if (!authHeader || !authHeader.startsWith('Bearer ') || !nodeId) {
    return res.status(401).json({ error: 'Unauthorized: Missing token or X-Node-ID' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // In production, we verify the token against the JWT secret
    // and verify that the node exists in PostgreSQL via Prisma.
    // Stub lookup/validation:
    const node = await prisma.node.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      // For development setup, we can auto-register a node if in sandbox mode
      // or simply mock pass for this boilerplate.
      console.log(`[Ingest API] Node authentication stub: Node ${nodeId} not found in DB, bypassing for dev sandbox`);
    }

    req.nodeId = nodeId;
    next();
  } catch (error) {
    console.error('[Ingest API] Auth error:', error.message);
    res.status(500).json({ error: 'Internal Server Error during auth' });
  }
};

// Upload Backlog Endpoint
app.post(
  '/api/v1/nodes/upload-backlog',
  authenticateNode,
  upload.single('backlog'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Bad Request: No backlog file uploaded' });
      }

      console.log(`[Ingest API] Received backlog file from Node: ${req.nodeId}`);
      console.log(`[Ingest API] File saved to: ${req.file.path}`);

      // Publish to RabbitMQ
      const amqpUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      const connection = await amqp.connect(amqpUrl);
      const channel = await connection.createChannel();

      // Assert backlog exchange
      await channel.assertExchange(RABBITMQ_EXCHANGES.BACKLOG, 'topic', { durable: true });

      const notifyPayload = {
        event: 'backlog_uploaded',
        node_id: req.nodeId,
        file_path: path.resolve(req.file.path),
        timestamp: Date.now() / 1000,
      };

      channel.publish(
        RABBITMQ_EXCHANGES.BACKLOG,
        RABBITMQ_ROUTING_KEYS.BACKLOG_UPLOADED,
        Buffer.from(JSON.stringify(notifyPayload)),
        { persistent: true }
      );

      console.log('[Ingest API] Published backlog event to RabbitMQ');

      await channel.close();
      await connection.close();

      return res.status(201).json({
        message: 'Backlog database uploaded and queued for processing successfully',
        file_name: req.file.filename,
      });
    } catch (error) {
      console.error('[Ingest API] Upload endpoint error:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ingest-server' });
});

app.listen(PORT, () => {
  console.log(`[Ingest API] Ingest Server running on port ${PORT}`);
});
