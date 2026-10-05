# limitup-sync — Phase 28 D-14 밤 export 적재 워커 이미지 (Cloud Run Job · amd64)
# 2단 빌드: builder 에서 pnpm deploy 로 격리된 prod node_modules 를 만들고, 런타임은 dist · node_modules 만 싣는다.
# 이 워커는 @gh-radar/shared 를 의존하지 않는다 — shared 복사 · 빌드 줄 없음.

# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY workers/limitup-sync/package.json ./workers/limitup-sync/

RUN pnpm install --frozen-lockfile

COPY workers/limitup-sync/ ./workers/limitup-sync/

RUN pnpm -F @gh-radar/limitup-sync build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks)
RUN pnpm --filter=@gh-radar/limitup-sync --prod --legacy deploy /out
# dist/ is in .gitignore, so pnpm deploy won't include it — copy explicitly
RUN cp -r /app/workers/limitup-sync/dist /out/dist

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
