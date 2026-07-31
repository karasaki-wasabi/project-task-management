# syntax=docker/dockerfile:1
#
# Multi-stage Dockerfile for the backend service (task 1.1: infra scaffolding).
# - dev:  bind-mounted source + hot reload via `node --watch` (task 1.2 will
#         swap this for the real Fastify/TypeScript dev command, e.g. tsx watch).
# - prod: minimal placeholder stage for the future App Runner deployment image.
#         Not yet used by docker-compose.yml; kept buildable so later tasks can
#         extend it without restructuring the file.

FROM node:24-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./

FROM base AS dev
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod
ENV NODE_ENV=production
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
