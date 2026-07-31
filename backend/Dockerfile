# syntax=docker/dockerfile:1
#
# Multi-stage Dockerfile for the backend service.
# - dev:   bind-mounted source (see docker-compose.yml) + hot reload via
#          `tsx watch src/server.ts` (task 1.2). `prisma generate` runs as
#          part of the `dev` script on every container start so the
#          generated client stays in sync with the bind-mounted schema even
#          though node_modules lives in a separate named volume.
# - build: intermediate stage that type-checks/compiles TypeScript to dist/
#          for the prod image.
# - prod:  minimal image for the future App Runner deployment. Not yet used
#          by docker-compose.yml; kept buildable so later tasks can extend it
#          without restructuring the file.

FROM node:24-bookworm-slim AS base
# Prisma's query engine needs OpenSSL to be present on Debian slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./

FROM base AS dev
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm install
COPY . .
RUN npm run build

FROM base AS prod
ENV NODE_ENV=production
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/prisma ./src/prisma
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "start"]
