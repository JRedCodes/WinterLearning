# TODO(1): Write a production Dockerfile for this API.
#
# Requirements (checked by test/dockerfile.test.ts, explained in CHALLENGE.md):
#  - multi-stage: a named build stage (`FROM node:22-alpine AS build`) that runs `npm ci`
#    and `npm run build`, and a final runtime stage
#  - copy package.json + package-lock.json and install BEFORE copying the source (layer caching)
#  - final stage: production dependencies only (`npm ci --omit=dev`, here or in a separate deps stage)
#  - no `npm install` anywhere
#  - ENV NODE_ENV=production, EXPOSE 3000
#  - copy the compiled dist/ and the migrations/ folder into the final stage
#  - run as a non-root user (the node images ship a `node` user)
#  - HEALTHCHECK that runs `node dist/healthcheck.js`
#  - exec-form CMD that starts node directly: CMD ["node", "dist/server.js"]
#
# Build it with `make image` (run `npm install` once first so package-lock.json exists).
