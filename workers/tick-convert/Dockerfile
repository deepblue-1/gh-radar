# tick-convert — Phase 37 틱 격자 변환 Job 이미지 (Cloud Run Job `gh-radar-tick-convert` · amd64)
# 2단 빌드(limitup-sync 동형): builder 에서 pnpm deploy 로 격리된 prod node_modules 를 만들고, 런타임은 dist · node_modules 만 싣는다.
# @gh-radar/shared 는 pcap-ns 리더 · 태그 레이아웃 · 15% 판정 · KRX 휴장일 캘린더를 준다 — 빌드한 dist 를 복사한다.
#
# node:24-alpine 고정(두 단 모두 · Pitfall 4): 격자 파일 · 스테이징이 Node 내장 zstd(zlib.zstdCompressSync ·
# createZstdDecompress)를 쓴다 — 22.15 미만 이미지면 없다. index.ts 가 기동 때 검사해 없으면 종료 2.
#
# 실행 파일과 모드를 나눈다 — ENTRYPOINT 가 `node dist/index.js`, CMD 가 기본 모드 `nightly` 다.
# Cloud Run args 오버라이드(server 요청 변환 · 스모크 --args · 승격 Job)는 CMD 만 바꾸므로 늘 `node dist/index.js <모드> …` 로 돈다.
# 실행 파일을 CMD 쪽에 두면(limitup-sync 의 CMD ["node", …] 꼴) 오버라이드가 node 까지 지워 `request` 를 실행 파일로 부른다.

# === Builder Stage ===
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY workers/tick-convert/package.json ./workers/tick-convert/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY workers/tick-convert/ ./workers/tick-convert/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/tick-convert build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks)
RUN pnpm --filter=@gh-radar/tick-convert --prod --legacy deploy /out
# dist/ is in .gitignore, so pnpm deploy won't include it — copy explicitly
RUN cp -r /app/workers/tick-convert/dist /out/dist

# === Production Image ===
FROM node:24-alpine
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}
# Node zstd 는 실험 기능 — 매 실행 ExperimentalWarning 이 로그를 더럽히지 않게.
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning

USER app
ENTRYPOINT ["node", "dist/index.js"]
CMD ["nightly"]
