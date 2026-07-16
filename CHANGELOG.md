# Changelog

All notable changes to the Thingking Analytics project are documented here. Detailed breakdowns of each change can be found in the [changelogs/](changelogs/) directory.

---

## [2026-07-16] - Initial Project Scaffolding

### Added
- Created the project directory structure under the monorepo directory `app/` (with workspaces for `shared`, `db`, and microservices `ingest-server`, `worker-service`, `ui-service`, and `frontend`).
- Created the system design and specifications reference file `resources/research/big_picture.md`.
- Formulated Prisma schema models (`schema.prisma`) targeting central edge telemetry tables (dwell time, traffic flow, system metrics).
- Added Express.js server and WebSocket gateway stubs to support live streaming and offline backlog uploads.
- Configured local development orchestration files (`docker-compose.yml`, `.env.example`, `.gitignore`, `app/.dockerignore`).

See the [Detailed Changelog (2026-07-16-12-22-feat.md)](changelogs/2026-07-16-12-22-feat.md) for full implementation details.
