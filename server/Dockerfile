# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# 의존성 캐시 최적화 — lockfile 변경 시에만 install 재실행
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY packages/shared/ ./packages/shared/
COPY server/ ./server/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/server build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks to workspace root)
RUN pnpm --filter=@gh-radar/server --prod --legacy deploy /out

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

# non-root user (D-31)
RUN addgroup -S app && adduser -S app -G app

# deploy 산출물 복사: dist + package.json + 독립 node_modules
COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

# 버전 주입 (RESEARCH Q2 권고 B) — 배포 스크립트가 --build-arg GIT_SHA=$SHA 전달
ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
EXPOSE 8080
CMD ["node", "dist/server.js"]
