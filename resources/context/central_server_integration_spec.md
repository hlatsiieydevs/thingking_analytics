# Central Server Integration Specification: Edge Node to Gateway & Worker

This specification defines the communication protocols, API endpoints, payload schemas, and backend routing architecture between the **Edge AI Vision Nodes** and the **Central Ingestion Server**.

---

## 1. Authentication & Identification
Every Edge Node must identify itself on every request to prevent unauthorized injection and secure data transmission.
* **Credentials**: Each node is assigned a unique `NODE_ID` and a secret `JWT_API_KEY` (stored in `.env`).
* **HTTP Auth**: HTTP headers must include:
  ```http
  Authorization: Bearer <JWT_API_KEY>
  X-Node-ID: <NODE_ID>
  ```
* **MQTT Auth**: Nodes authenticate using username=`NODE_ID` and password=`<JWT_API_KEY>` over SSL/TLS (`mqtts`).

---

## 2. Real-time Stream: MQTT

When the node is online and has no unsent backlog, it streams individual events in real-time.

* **Protocol**: MQTT over TLS (Port 8883)
* **QoS Level**: `1` (At least once delivery)

### Topic 1: Dwell Time Events
* **Topic**: `nodes/{node_id}/telemetry/dwell`
* **Direction**: Edge Node $\rightarrow$ Gateway (RabbitMQ)
* **Trigger**: Triggered when a tracked object exits a polygon zone and its dwell duration exceeds the minimum threshold.
* **Payload Schema (JSON)**:
  ```json
  {
    "event_id": "dw_1718042400_08f2",
    "node_id": "node_retail_01",
    "timestamp": 1718042400.125,
    "track_id": 412,
    "zone_id": 1,
    "dwell_time_sec": 14.5
  }
  ```

### Topic 2: Traffic Flow Coordinates (Trajectories)
* **Topic**: `nodes/{node_id}/telemetry/traffic`
* **Direction**: Edge Node $\rightarrow$ Gateway (RabbitMQ)
* **Trigger**: Emitted periodically (batched every 5s) for objects in motion inside active zones.
* **Payload Schema (JSON)**:
  ```json
  {
    "event_id": "tf_1718042405_41a8",
    "node_id": "node_retail_01",
    "timestamp": 1718042405.000,
    "flow_records": [
      { "track_id": 412, "x": 320.5, "y": 240.2 },
      { "track_id": 415, "x": 115.1, "y": 405.8 }
    ]
  }
  ```

### Topic 3: System Health & Metrics
* **Topic**: `nodes/{node_id}/telemetry/metrics`
* **Direction**: Edge Node $\rightarrow$ Gateway (RabbitMQ)
* **Trigger**: Emitted every 5 seconds.
* **Payload Schema (JSON)**:
  ```json
  {
    "event_id": "sys_1718042400_b6c4",
    "node_id": "node_retail_01",
    "timestamp": 1718042400.000,
    "metrics": {
      "cpu_load_percent": 42.5,
      "ram_usage_percent": 68.1,
      "vram_usage_mb": 128.0,
      "current_fps": 12.4,
      "live_people_count": 3,
      "zone_counts": [1, 2, 0]
    }
  }
  ```

---

## 3. Backlog Database Uploads: HTTP/REST

When a node recovers from an offline state, it uploads its compressed SQLite database files containing historical telemetry data.

* **Endpoint**: `POST https://<gateway-domain>/api/v1/nodes/upload-backlog`
* **Content-Type**: `application/gzip`
* **Headers**:
  ```http
  Authorization: Bearer <JWT_API_KEY>
  X-Node-ID: <NODE_ID>
  Content-Disposition: attachment; filename="backlog_20260716104000.db.gz"
  ```
* **Response**:
  * `201 Created` $\rightarrow$ Backlog received and queued for parsing.
  * `400 Bad Request` $\rightarrow$ Corrupt gzip file or invalid metadata.
  * `401 Unauthorized` $\rightarrow$ Invalid node token.

---

## 4. Central Server Handling & Service Worker Logic

### A. RESTful API Service (Ingest Server)
1. **Receive and Authenticate**: Receives the zipped SQLite database via `POST /api/v1/nodes/upload-backlog`.
2. **Save Locally**: Saves the `.db.gz` file temporarily in a secure buffer directory (e.g., `/tmp/backlog_uploads/`).
3. **Verify Integrity**: Verifies the archive integrity.
4. **Publish Event**: Publishes a lightweight notify message to **RabbitMQ** to let downstream workers process it asynchronously.
   * **RabbitMQ Exchange**: `backlog_exchange`
   * **Routing Key**: `backlog.uploaded`
   * **Notify Payload**:
     ```json
     {
       "event": "backlog_uploaded",
       "node_id": "node_retail_01",
       "file_path": "/tmp/backlog_uploads/backlog_20260716104000.db.gz",
       "timestamp": 1718042422.0
     }
     ```
5. **Response**: Responds immediately with `201 Created` to release the Edge Node's network connection.

### B. RabbitMQ Configuration
* **Broker Role**: RabbitMQ routes streaming MQTT telemetry directly to `realtime_queue`, and backlog notifications to `backlog_queue`.
* **Worker Service Subscription**:
  * **Real-time Workers**: Subscribe to `realtime_queue` for fast database updates.
  * **Backlog Workers**: Subscribe to `backlog_queue` to process heavy SQLite uploads asynchronously without blocking live telemetry.

### C. Worker Service (Scalable Service Workers)

The worker scripts do the heavy lifting of database parsing and insertion.

#### 1. Processing Real-time Stream
* Reads JSON payloads from `realtime_queue`.
* Inserts telemetry directly into the central **PostgreSQL** tables: `dwell_time_logs`, `traffic_flow`, and `system_metrics`.

#### 2. Processing Backlog Databases (Offline Dumps)
* Subscribes to `backlog_queue`. Upon receiving a notification:
  1. Decompresses the `.db.gz` file to retrieve the raw SQLite database file (`.db`).
  2. Connects to the local SQLite database.
  3. **Batch Read**: Pulls batches of records from tables (`dwell_time_logs`, `traffic_flow`, `system_metrics`).
  4. **Idempotent Insertion**: Inserts batches into PostgreSQL using composite unique keys to prevent duplicates:
     ```sql
     INSERT INTO dwell_time_logs (node_id, timestamp, track_id, zone_id, dwell_time_sec)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (node_id, timestamp, track_id) DO NOTHING;
     ```
  5. **Cleanup**: Closes connection to SQLite file and securely deletes both `.db` and `.db.gz` files from the temporary store.
