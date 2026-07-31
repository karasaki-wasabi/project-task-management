# syntax=docker/dockerfile:1
#
# Multi-stage Dockerfile for the frontend service (task 1.1: infra scaffolding).
# - dev:   bind-mounted source + hot reload dev server (task 1.6 will swap this
#          for the real Nuxt dev server, e.g. `nuxi dev`).
# - build: produces a static build in /app/dist (task 1.6 will swap this for
#          `nuxi generate`, which writes to the same kind of static output dir).
# - prod:  holds only the static build artifacts (no running server), matching
#          the design's static SPA deployment to S3/CloudFront. Not run via
#          docker-compose; intended for a future CI step to extract the files.

FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./

FROM base AS dev
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

FROM base AS build
ENV NODE_ENV=production
RUN npm install
COPY . .
RUN npm run build

FROM scratch AS prod
COPY --from=build /app/dist /dist
