# Thingking Analytics Central Server

Thingking Analytics Central Server is a highly resilient hub designed to ingest real-time descriptive computer vision analytics (dwell times, traffic flows, and system health metrics) from remote Edge AI Nodes. The server stores aggregated data in PostgreSQL via Prisma ORM for dashboard reporting, records raw telemetry logs into a Data Lake abstraction layer, and pushes live updates to a modern Web UI via WebSockets.

---

## 1. Description

This repository implements the centralized components of the system:
* **Ingest Server**: Express.js REST API handling JWT authentication and bulk offline SQLite backlog uploads.
* **Worker Service**: Background worker subscribing to RabbitMQ (processing MQTT live streams and backlog archives asynchronously).
* **UI Service**: Node.js back-end managing client WebSocket connections and serving the dashboard API.
* **Frontend**: A Vue 3 SPA styled with Tailwind CSS v5 and built with Vite.
* **Database & ORM**: PostgreSQL database schema and queries managed using Prisma ORM.

For a deep dive into the system design, communication schemas, and architectural boundaries, see [resources/research/big_picture.md](file:///home/hlatsiieyhax/DevBlock/thingking_dev/thingking_analytics/resources/research/big_picture.md).

---

## 2. Directory Layout

The project is structured as an npm monorepo under `app/`:

```text
.
├── app/
│   ├── package.json             # Root monorepo configuration (workspaces)
│   ├── docker-compose.yml       # Orchestrates local PostgreSQL, RabbitMQ, and services
│   ├── .env.example             # Template for centralized configuration
│   ├── services/
│   │   ├── ingest-server/       # HTTP server for JWT node authentication & backlog uploads
│   │   ├── worker-service/      # Background consumer (RabbitMQ -> Postgres/Data Lake)
│   │   ├── ui-service/          # Real-time WebSocket server + dashboard API gateway
│   │   └── frontend/            # Vue 3 + Tailwind CSS v5 Dashboard (Vite SPA)
│   ├── packages/
│   │   ├── shared/              # Shared TS types, schemas, and schemas validation
│   │   └── db/                  # Prisma ORM schema & client
├── changelogs/                  # Change records
├── resources/                   # Documentation and prompt research
└── README.md                    # Root description and setup guide
```

---

## 3. How to Use It

### 3.1 Prerequisites
* [Node.js](https://nodejs.org/) (v20+ recommended)
* [Docker & Docker Compose](https://www.docker.com/)

### 3.2 Setup and Configuration
1. Clone the repository.
2. Navigate to `app/` and copy the example environment file:
   ```bash
   cp app/.env.example app/.env
   ```
3. Update the credentials in `app/.env` (DB keys, RabbitMQ passwords, JWT secret, Ngrok authtoken, etc.).

### 3.3 Running the Application
To launch the complete infrastructure (PostgreSQL, RabbitMQ, ingest-server, worker, ui-service, frontend, Tailscale, Ngrok) in development mode:
```bash
cd app
docker-compose up --build
```

To run individual services locally outside Docker:
1. Install root dependencies (this will link npm workspaces automatically):
   ```bash
   npm install
   ```
2. Run database migrations:
   ```bash
   npm run db:migrate --workspace=app/packages/db
   ```
3. Start the desired service:
   ```bash
   npm run dev --workspace=app/services/frontend
   ```

### 3.4 Common Issues and Troubleshooting
* **Database Connection Errors**: Ensure the PostgreSQL container is fully initialized before starting local node services. If it fails, run `docker-compose ps` to inspect container health.
* **RabbitMQ Port Collisions**: RabbitMQ requires port `5672` (AMQP) and `1883`/`8883` (MQTT). Ensure no local brokers (e.g. Mosquitto, local RabbitMQ) are running on the host.
* **Ngrok Authentication Failure**: Ensure you set a valid `NGROK_AUTHTOKEN` in `app/.env` to allow the public tunnel to spin up.

---

## 4. Future Implementations
* **Production S3 Integration**: Swap the local-disk raw data storage implementation with the `S3StorageDriver` using AWS SDK.
* **CI/CD Integration**: Deploy Docker images to a registry via GitHub Actions upon merge to the main branch.
* **Dashboard Auth**: Implement user authentication/login for dashboard administrators.
