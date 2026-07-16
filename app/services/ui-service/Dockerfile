FROM node:20-alpine

WORKDIR /usr/src/app

# In a monorepo workspace we copy packages and this service folder
COPY package.json ./
COPY packages/ ./packages/
COPY services/ui-service/ ./services/ui-service/

RUN npm install --omit=dev

ENV PORT=5000
EXPOSE 5000

CMD ["npm", "run", "start", "--workspace=services/ui-service"]
