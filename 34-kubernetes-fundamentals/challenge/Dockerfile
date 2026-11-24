# syntax=docker/dockerfile:1
#
# Provided for you (module 26 taught how to write it). Read it anyway: two details matter
# for your Kubernetes manifests.
#
#   1. The app runs as the `node` user (uid 1000). That's a NAME, not a number, so the
#      kubelet can't prove it's non-root on its own. If you set `runAsNonRoot: true` you
#      must also set a numeric `runAsUser`.
#   2. There's no HEALTHCHECK here on purpose. Docker's HEALTHCHECK is ignored by
#      Kubernetes: probes in the Deployment replace it.
#
# Build (run `npm install` once first so package-lock.json exists):
#   docker build -t wl-kudos-api:1.0.0 .
#   docker build --build-arg APP_VERSION=1.0.1 -t wl-kudos-api:1.0.1 .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ARG APP_VERSION=1.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER node
EXPOSE 3000
# Exec form: node is PID 1 and receives the kubelet's SIGTERM directly.
# The same image also runs migrations: `node dist/db/migrateCli.js`.
CMD ["node", "dist/server.js"]
