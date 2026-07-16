FROM node:20-alpine

WORKDIR /usr/src/app

# In npm workspaces monorepo, copy packages and services
COPY package.json ./
COPY packages/ ./packages/
COPY services/frontend/ ./services/frontend/

RUN npm install

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=services/frontend"]
