FROM node:20-alpine

WORKDIR /usr/src/app

# In a monorepo, we copy the root package.json and work folders
COPY package.json ./
COPY packages/ ./packages/
COPY services/ingest-server/ ./services/ingest-server/

# Install dependencies
RUN npm install --omit=dev

ENV PORT=4000
EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=services/ingest-server"]
