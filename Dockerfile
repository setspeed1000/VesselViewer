# VesselViewer relay server. The static site does not need this image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json tsconfig.relay.json ./
COPY server ./server
COPY shared ./shared
RUN npm run build:relay

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/build ./build
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 8787
CMD ["node", "build/relay/server/index.js"]
