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

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

# non-root user (D-31)
RUN addgroup -S app && adduser -S app -G app

# 빌드 아티팩트 + 최소 runtime 만 복사
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@gh-radar/shared/package.json

# 버전 주입 (RESEARCH Q2 권고 B) — 배포 스크립트가 --build-arg GIT_SHA=$SHA 전달
ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
EXPOSE 8080
CMD ["node", "dist/server.js"]
