# tickgw — Phase 37 당일 틱 경로 radar-gw 컨테이너 이미지 (D-05 · D-06 · D-07 · amd64)
# 빌드: scripts/deploy-tickgw.sh 가 저장소 루트를 컨텍스트로
#   docker build --platform=linux/amd64 -f tickgw/Dockerfile \
#     --build-arg TICKPULL_UID=<radar-gw id -u tickpull> --build-arg TICKPULL_GID=<radar-gw id -g tickpull> .
#
# ── 왜 이미지 안에 tickpull passwd 항목이 필요한가 ─────────────────────────────
#   OpenSSH 클라이언트는 시작하자마자 getpwuid(getuid()) 로 자기 사용자를 찾는다. 컨테이너를 `--user <uid>:<gid>` 로만
#   돌리고 /etc/passwd 에 그 uid 가 없으면 「No user exists for uid N」 으로 255 종료 — 119 에 닿기도 전에 모든 호출이
#   실패한다. 그래서 빌드 인자로 받은 uid/gid 로 tickpull 사용자를 만들고 `USER tickpull` 로 돈다.
#   uid/gid 는 radar-gw 호스트의 tickpull(infra/relay/tickpull/install.sh)과 같아야 한다 — 그래야 읽기 전용 마운트
#   `/var/lib/tickpull/.ssh:/ssh:ro` 의 개인키(0600 · tickpull 소유)를 읽는다. 기본값이 없다 — 비면 빌드 실패.
#
# ── 의존성 0 ─────────────────────────────────────────────────────────
#   런타임은 node 내장만(node:http · node:child_process · node:crypto) + openssh-client. node_modules 를 싣지 않는다.
#   zstd 를 풀지 않으므로(원본 프레임 그대로 중계) node 판의 zstd 지원 여부와 무관하다.

# === Builder Stage ===
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY tickgw/package.json ./tickgw/

RUN pnpm install --frozen-lockfile

COPY tickgw/ ./tickgw/
RUN pnpm -F @gh-radar/tickgw build

# === Production Image ===
FROM node:24-alpine

ARG TICKPULL_UID
ARG TICKPULL_GID
RUN test -n "$TICKPULL_UID" && test -n "$TICKPULL_GID" \
    || { echo "TICKPULL_UID/TICKPULL_GID build args are required (radar-gw: id -u/-g tickpull)" >&2; exit 1; }

# 베이스 이미지에 같은 uid(예: node 1000) · gid 가 이미 있으면 — uid 는 비우고(deluser), gid 는 그 그룹을 그대로 쓴다
RUN apk add --no-cache openssh-client \
    && olduser="$(getent passwd "$TICKPULL_UID" | cut -d: -f1)" \
    && if [ -n "$olduser" ]; then deluser "$olduser"; fi \
    && grp="$(getent group "$TICKPULL_GID" | cut -d: -f1)" \
    && if [ -z "$grp" ]; then addgroup -g "$TICKPULL_GID" tickpull && grp=tickpull; fi \
    && adduser -D -u "$TICKPULL_UID" -G "$grp" -h /home/tickpull -s /sbin/nologin tickpull \
    && test "$(id -u tickpull)" = "$TICKPULL_UID" && test "$(id -g tickpull)" = "$TICKPULL_GID"

WORKDIR /app
COPY --from=builder /app/tickgw/dist ./dist
COPY --from=builder /app/tickgw/package.json ./

ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA} \
    NODE_ENV=production

USER tickpull
EXPOSE 8092
CMD ["node", "dist/server.js"]
