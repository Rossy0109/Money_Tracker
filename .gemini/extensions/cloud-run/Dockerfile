FROM node:22-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD [ "node", "mcp-server.js" ]
