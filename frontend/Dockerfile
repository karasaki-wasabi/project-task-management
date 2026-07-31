# syntax=docker/dockerfile:1
#
# Multi-stage Dockerfile for the frontend service.
# - dev:   bind-mounted source (see docker-compose.yml) + Nuxt's dev server
#          with hot reload (`nuxt dev`, task 1.6).
# - build: intermediate stage that runs `nuxt generate` (static SPA build,
#          design.md Technology Stack), producing `.output/public/`.
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
RUN npm run generate

FROM scratch AS prod
COPY --from=build /app/.output/public /dist
