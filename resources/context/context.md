# **Edge Computer Vision Analytics System**

**Architectural Blueprint & System Specification**

## **1\. Executive Summary**

When deploying physical installations—such as retail displays, interactive kiosks, or public art—clients often lack the quantitative data necessary to measure user engagement and return on investment (ROI). Traditional physical installations operate blindly, relying on anecdotal feedback rather than hard metrics.

The proposed solution utilises a decentralised edge **AI computer vision architecture** to capture real-time descriptive analytics. By processing visual data directly at the installation site, the system extracts critical engagement metrics (dwell time, traffic flow, and interaction counts). These descriptive analytics are then aggregated to generate prescriptive insights, empowering the company to optimise physical layouts, tailor experiences, and dramatically improve customer engagement.

Crucially, this system adopts a **Privacy-by-Design** approach. All video processing occurs in volatile memory on the edge device; no raw video or biometric identifiers are sent to the cloud, ensuring full compliance with global data privacy regulations.

## **2\. System Architecture Overview**

The overall architecture follows a highly resilient Hub-and-Spoke model consisting of two primary domains:

1. **Decentralised Edge Nodes:** Smart sensors physically located at the installations, responsible for heavy data ingestion and computer vision processing.  
2. **Centralised Server & UI:** A cloud or on-premise hub that ingests lightweight telemetry from multiple edge nodes, stores it in a centralised database, and presents real-time data streams and video pathflow feeds through a unified dashboard.

## **3\. The Edge Node (Physical Installation Level)**

Each physical installation is equipped with an Edge Node (e.g., Raspberry Pi 4/5) running a localised, highly optimised, containerised software stack.

### **3.1 Hardware & Data Ingestion Pipeline**

* **Zero-Copy Capture:** Using modern camera frameworks (Picamera2/libcamera), the sensor captures raw video frames directly into kernel DMA (Direct Memory Access) buffers.  
* **Direct-to-NumPy:** These buffers are exposed directly to the Python environment as NumPy arrays. This bypasses the need to encode/decode video for the AI, drastically reducing CPU overhead and latency.

### **3.2 The Computer Vision Engine**

* **Lightweight Object Detection:** The node runs an efficient, quantised object detection model (such as MobileNet-SSD or YOLOv8-nano) locally.  
* **Inference-Driven Skipping:** To manage thermal loads and CPU limits, the system operates at a target frame rate (e.g., 10-15 FPS) by processing every 3rd or 4th frame, using lightweight centroid tracking to follow movement between detections.  
* **Data Extraction:** The CV engine extracts actionable, anonymous metrics:  
  * **Interaction Counts:** How many people engaged with the installation.  
  * **Dwell Time:** How long individuals remained within a prescribed "engagement zone."  
  * **Traffic Flow:** Path mapping via bounding box trajectories to understand how users approach and navigate the space.  
  * *Constraint:* No facial recognition or person re-identification (Re-ID) is performed.

### **3.3 Extreme Offline Resilience & Storage**

The system is designed to operate autonomously without network connectivity for **up to 2 months**.

* **Analytics Telemetry (MQTT/WebSockets):** During normal operation, the CV engine emits lightweight JSON payloads (e.g., {"node": 1, "timestamp": 1718042400, "dwell\_time\_sec": 45, "zone": "A"}).  
* **Persistent Local Queuing:** If the internet drops, the system caches payloads in a local SQLite database.  
* **Storage Hardware:** To handle months of telemetry data without failure, nodes utilise external NVMe SSD drives, preventing flash memory burnout.  
* **Data Pruning (FIFO):** A background cron job monitors disk capacity. If local storage reaches 95% capacity before a connection is re-established, a First-In, First-Out (FIFO) retention policy deletes the oldest records to prioritise current data and prevent catastrophic OS lockups.

### **3.4 Local Maintenance Interface**

For physical maintenance, setup, and debugging, the node hosts a localised web server.

* **First-Run State Machine:** On initial boot, the node broadcasts a setup UI allowing technicians to configure node names, network settings, and storage checks. Once setup is completed, this UI deactivates, and the node enters standard operational mode.  
* **Live Preview:** During setup, the UI activates the hardware H.264 video encoder to stream a real-time, low-latency live feed with overlaid CV bounding boxes to assist technicians in calibrating the camera angles and detection zones.

## 

## **4\. The Centralised Server & UI**

The central server is designed to ingest telemetry from 5 to 20 nodes, bridging the gap between raw data storage for data scientists and aggregated visualisations for stakeholders.

### **4.1 Data Ingestion & Storage**

* **Telemetry Broker:** A WebSocket server receives the incoming JSON data streams from all connected nodes.  
* **Dual-Consumer Architecture (ELT):** The data pipeline serves two distinct consumers:  
  * **Data Lake (Raw Data):** Raw JSON telemetry is dumped directly into an object storage bucket (e.g., AWS S3) for data scientists to use in complex machine learning models or deep behavioural analysis.  
  * **Data Warehouse (Aggregated Data):** Scripts transform and summarise the raw data into a relational database (e.g., PostgreSQL), optimising query speed for the dashboard UI.

### **4.2 Unified Real-Time Dashboard**

* **Analytic Data Streams:** Real-time graphs and heatmaps display aggregated foot traffic, average dwell times, and peak interaction hours across all nodes.  
* **Visual Data Streams (Video on Demand):** Rather than streaming 24/7, the dashboard can request a live video feed from a specific node using a compressed H.264/WebRTC stream to verify installation status remotely.

## **5\. Data Engineering Considerations (Extended Offline Scenarios)**

Supporting a 2-month offline buffer requires specific data engineering safeguards:

1. **The "Thundering Herd" Ingestion:** When a node reconnects after 2 months, it will attempt to offload millions of queued records. The server endpoint must be designed to accept asynchronous bulk/batch REST uploads (e.g., zipping the SQLite file) parallel to the live WebSocket stream to avoid overwhelming the ingestion pipeline.  
2. **Timekeeping Integrity (RTC):** Because offline nodes cannot sync with Network Time Protocol (NTP) servers, each edge node is equipped with a hardware Real-Time Clock (RTC) module (e.g., DS3231) to guarantee timestamps remain chronologically valid during the 60-day blackout.  
3. **Idempotency & Checkpointing:** To prevent double-counting analytics if a bulk upload fails halfway through, the central database uses unique composite keys (Node ID \+ Timestamp \+ Event ID). The edge node maintains a strict "cursor" to track exactly which data has been successfully acknowledged by the server before purging it locally.  
4. **Schema Evolution:** Because edge software might be updated during an offline window, the central database is designed to handle schema mismatches (e.g., a node suddenly reporting a new metric) without corrupting historical tables.

## **6\. Strategic Advantages**

1. **Bandwidth Efficiency:** By processing video at the edge and only sending lightweight text data to the server, the system operates flawlessly on low-bandwidth connections (4G/LTE/Basic Wi-Fi).  
2. **Privacy Compliance:** Raw video is instantly overwritten in the edge node's RAM. Because no identifiable images are transmitted or stored, the system bypasses complex surveillance regulations.  
3. **Unmatched Reliability:** The combination of hardware RTCs, local SQLite queuing, and FIFO pruning ensures that business-critical analytics data is preserved even in the most extreme, long-term offline environments.