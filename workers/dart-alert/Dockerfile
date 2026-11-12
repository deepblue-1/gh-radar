# Phase 43 — dart-alert(공시 텔레그램 알림) 이미지 · workers/kis-news-sync/Dockerfile 꼴
# @gh-radar/shared 를 쓰지 않으므로 shared 복사 · 빌드 줄이 없다.
# 빌드: scripts/deploy-dart-alert.sh (저장소 루트를 컨텍스트로 · --platform=linux/amd64 · --build-arg GIT_SHA=<짧은 sha>)

# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY workers/dart-alert/package.json ./workers/dart-alert/

RUN pnpm install --frozen-lockfile

COPY workers/dart-alert/ ./workers/dart-alert/

RUN pnpm -F @gh-radar/dart-alert build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks)
RUN pnpm --filter=@gh-radar/dart-alert --prod --legacy deploy /out
# dist/ is in .gitignore, so pnpm deploy won't include it — copy explicitly
RUN cp -r /app/workers/dart-alert/dist /out/dist

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules

ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
CMD ["node", "dist/index.js"]
