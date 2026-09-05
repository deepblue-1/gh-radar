# gh-radar relay — DMA 시세 중계 프로세스 (Phase 15 Plan 05, D-07)
#
# server/Dockerfile 의 멀티스테이지 골격을 그대로 쓰고 4군데만 바꾼다:
#   ① 복사 경로 server/ → relay/   ② pnpm 필터 대상을 relay 패키지로
#   ③ EXPOSE 8080 → 8090 8091      ④ CMD dist/server.js → dist/index.js
#
# 빌드 컨텍스트는 **저장소 루트**다 (pnpm 워크스페이스라 lockfile·shared 가 필요하다):
#   docker build --platform=linux/amd64 --build-arg GIT_SHA=$SHA -f relay/Dockerfile .
#
# server 와 달리 Cloud Run 이 아니라 GCE VM 의 Docker 위에서 `--restart=always` 로 돈다.
# openconnect 는 host systemd 소관이라 이 컨테이너를 재시작해도 VPN 터널은 흔들리지 않는다.

# === Builder Stage ===
FROM node:22-alpine AS builder
# pnpm@10 고정 — 로컬은 11 이지만 lockfile 호환을 위해 의도적으로 다르게 유지한다.
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# 의존성 캐시 최적화 — lockfile 변경 시에만 install 재실행
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY relay/package.json ./relay/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY packages/shared/ ./packages/shared/
COPY relay/ ./relay/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/relay build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks to workspace root)
RUN pnpm --filter=@gh-radar/relay --prod --legacy deploy /out

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

# non-root user (D-31 / T-15-23)
RUN addgroup -S app && adduser -S app -G app

# deploy 산출물 복사: dist + package.json + 독립 node_modules
COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

# 버전 주입 — 배포 스크립트가 --build-arg GIT_SHA=$SHA 전달
ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
# 8090 = 브라우저 ws (Caddy 가 TLS 종단 후 평문으로 넘긴다, D-05)
# 8091 = 내부 HTTP (Cloud Run 전용, 방화벽 + X-Relay-Secret 이중 방어)
EXPOSE 8090 8091
CMD ["node", "dist/index.js"]
