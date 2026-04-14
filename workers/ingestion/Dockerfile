# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY workers/ingestion/package.json ./workers/ingestion/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY workers/ingestion/ ./workers/ingestion/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/ingestion build

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/workers/ingestion/dist ./dist
COPY --from=builder /app/workers/ingestion/package.json ./

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@gh-radar/shared/package.json

ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
CMD ["node", "dist/index.js"]
