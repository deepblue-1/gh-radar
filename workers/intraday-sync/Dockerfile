# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY workers/intraday-sync/package.json ./workers/intraday-sync/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY workers/intraday-sync/ ./workers/intraday-sync/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/intraday-sync build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks)
RUN pnpm --filter=@gh-radar/intraday-sync --prod --legacy deploy /out
# dist/ is in .gitignore, so pnpm deploy won't include it — copy explicitly
RUN cp -r /app/workers/intraday-sync/dist /out/dist

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
CMD ["node", "dist/index.js"]
