FROM node:20-alpine

# Install build tools for native node-sqlite3 library compilation
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /usr/src/app

COPY package.json ./
COPY packages/ ./packages/
COPY services/worker-service/ ./services/worker-service/

RUN npm install --omit=dev

CMD ["npm", "run", "start", "--workspace=services/worker-service"]
