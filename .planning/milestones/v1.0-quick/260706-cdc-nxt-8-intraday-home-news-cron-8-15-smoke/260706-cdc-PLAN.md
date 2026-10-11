---
phase: quick-260706-cdc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/deploy-intraday-sync.sh
  - scripts/deploy-home-sync.sh
  - scripts/deploy-news-sync.sh
  - scripts/smoke-home-sync.sh
  - scripts/smoke-news-sync.sh
  - scripts/smoke-intraday-sync.sh
  - packages/shared/src/home.ts
  - packages/shared/src/marketHours.ts
  - workers/home-sync/src/index.ts
  - workers/home-sync/src/index.test.ts
  - webapp/src/components/home/home-header.tsx
autonomous: true
requirements: [QUICK-NXT-8]
user_setup: []

must_haves:
  truths:
    - "장중 파이프라인(intraday/home/news)이 08:00부터 폴링한다 (NXT 프리마켓 커버)"
    - "smoke 스크립트가 새 8-15 cron 을 assert 한다 (검증 통과)"
    - "홈에서 8시대 슬롯이 '프리마켓' 라벨로 구분 표시된다"
    - "라이브 Cloud Scheduler cron 3종이 8시 시작으로 갱신된다"
  artifacts:
    - path: "scripts/deploy-intraday-sync.sh"
      provides: "intraday cron '* 8-15 * * 1-5'"
      contains: "8-15"
    - path: "packages/shared/src/home.ts"
      provides: "marketStatus premarket 유니온"
      contains: "premarket"
    - path: "workers/home-sync/src/index.ts"
      provides: "computeSlot 8시대 premarket 판별"
      contains: "premarket"
    - path: "webapp/src/components/home/home-header.tsx"
      provides: "프리마켓 슬롯 라벨"
      contains: "프리마켓"
  key_links:
    - from: "workers/home-sync/src/index.ts computeSlot"
      to: "packages/shared/src/home.ts HomeSnapshotPayload.marketStatus"
      via: "payload.marketStatus 'premarket' 값 기록"
      pattern: "premarket"
    - from: "webapp/src/components/home/home-header.tsx"
      to: "슬롯 capturedAt 시각(KST hour)"
      via: "isPremarketSlot(iso) 시간 기반 판별 (isCloseSlot 패턴)"
      pattern: "프리마켓"
---

<objective>
NXT(넥스트레이드) 프리마켓(08:00~08:50) 대응으로 장중 파이프라인을 8시 시작으로 확장한다.

시세 소스(키움 ka10027)는 이미 `stex_tp:"3"`(KRX+NXT 통합)으로 호출 중이라 시간 게이트는 오직 Cloud Scheduler cron 이다. 따라서 (1) 3개 deploy 스크립트의 cron `9-15`→`8-15`, (2) 3개 smoke 스크립트의 cron assert 갱신, (3) 홈 8시대 슬롯 '프리마켓' 라벨 표시, (4) 라이브 스케줄러 반영 배포 까지 수행한다.

Purpose: 트레이더가 NXT 프리마켓 급등을 08시대부터 홈/스캐너/뉴스로 포착할 수 있게 한다.
Output: cron 8시 확장된 deploy/smoke 스크립트 + 홈 프리마켓 라벨 + 라이브 스케줄러 3종 갱신 + 배포.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

<facts>
- NXT 프리마켓 = 08:00~08:50. 시세소스 키움 ka10027 는 이미 stex_tp="3"(KRX+NXT 통합), 기준가=KRX 전일종가 → 8시대 등락률 의미 일관. 시간 게이트는 오직 Cloud Scheduler cron.
- 프론트엔드 폴링은 시간 게이트 없음 → 수정 불필요. 17:30 candle-sync EOD 가 KRX 공식 일봉으로 확정 덮어쓰기 → 8시대 장중 OHLC 어긋남 허용(수정 안 함).
- webapp 은 현재 payload.marketStatus 를 UI 에서 소비하지 않는다(grep 0건). home-header 는 시각 기반 isCloseSlot(iso) 로 '마감' 라벨을 파생 → 프리마켓도 동일하게 시각 기반 isPremarketSlot(iso) 로 파생(payload 불필요, HomeSnapshotIndexEntry 에 payload 없음).
- payload.marketStatus 는 jsonb verbatim blob(D-06). server 라우트에 Zod enum 검증 없음 → 유니온에 "premarket" 추가는 하위호환 안전(구 스냅샷은 open/closed 만 가짐).
</facts>

<scheduler_jobs>
region = asia-northeast3
- gh-radar-intraday-sync-cron     현재 '* 9-15 * * 1-5'    → '* 8-15 * * 1-5'
- gh-radar-home-sync-cron         현재 '*/10 9-15 * * 1-5' → '*/10 8-15 * * 1-5'
- gh-radar-news-sync-intraday     현재 '*/15 9-15 * * 1-5' → '*/15 8-15 * * 1-5'
- gh-radar-news-sync-offhours     '0 */2 * * *' (무변경)
</scheduler_jobs>

<interfaces>
packages/shared/src/home.ts:70
  marketStatus: "open" | "closed";   → "premarket" | "open" | "closed";

workers/home-sync/src/index.ts computeSlot() 반환:
  { tradeDate, capturedAt, marketStatus: "open"|"closed", afterClose }
  hour(KST) 판별: hour>15||(hour===15&&slotMinute>=30) → closed. 그 외 open.
  추가: hour < 9 → "premarket" (08시대). afterClose 로직 무변경.

webapp/src/components/home/home-header.tsx:58-61 isCloseSlot(iso) 시각 기반 파생 패턴(참조).
  슬롯 라벨 라인 :186  const label = close ? `${hhmm} · 마감` : hhmm;
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: deploy/smoke 스크립트 cron 9-15 → 8-15 전수 치환</name>
  <files>scripts/deploy-intraday-sync.sh, scripts/deploy-home-sync.sh, scripts/deploy-news-sync.sh, scripts/smoke-home-sync.sh, scripts/smoke-news-sync.sh, scripts/smoke-intraday-sync.sh</files>
  <action>
6개 스크립트에서 장중 cron 의 시간 필드 `9-15` 를 `8-15` 로 치환한다. 오프아워/일배치 cron 은 건드리지 않는다(gh-radar-news-sync-offhours '0 */2 * * *', 기타 daily 스케줄 무관).

정확한 치환 지점(주석 문자열·로그 출력·assert 모두 포함):
- scripts/deploy-intraday-sync.sh — :9 주석 `cron * 9-15`, :123 `--schedule="* 9-15 * * 1-5"`, :132 동일, :138 echo, :172 echo. 5곳 모두 `9-15`→`8-15`.
- scripts/deploy-home-sync.sh — :13 주석 `"*/10 9-15 * * 1-5"`, :161 주석, :169 `SCHEDULE="*/10 9-15 * * 1-5"`. 3곳 → `8-15`.
- scripts/deploy-news-sync.sh — :12 주석 `"*/15 9-15 * * 1-5"`, :156 배열 항목 `gh-radar-news-sync-intraday|*/15 9-15 * * 1-5`. 2곳 → `8-15`. (offhours 항목 :157 은 무변경)
- scripts/smoke-home-sync.sh — :13 주석, :103 주석, :108 assert `[ ... = '*/10 9-15 * * 1-5' ]`. 3곳 → `8-15`.
- scripts/smoke-news-sync.sh — :41 주석 `INV-3a ... '*/15 9-15 * * 1-5'`, :45 assert `[ ... = '*/15 9-15 * * 1-5' ]`. 2곳 → `8-15`. (INV-3b offhours :49/:53 무변경)
- scripts/smoke-intraday-sync.sh — :38 check 라벨 `cron '* 9-15 * * 1-5'`, :42 assert `[ ... = '* 9-15 * * 1-5' ]`. 2곳 → `8-15`.

주의: `9-15` 문자열만 치환. `9` 단독(예: HOT_SET, 포트 번호)이나 다른 숫자는 건드리지 말 것.
  </action>
  <verify>
    <automated>! grep -rn '9-15' scripts/ && grep -rc '8-15' scripts/deploy-intraday-sync.sh scripts/deploy-home-sync.sh scripts/deploy-news-sync.sh scripts/smoke-home-sync.sh scripts/smoke-news-sync.sh scripts/smoke-intraday-sync.sh</automated>
  </verify>
  <done>scripts/ 전체에 `9-15` 잔존 0건. 6개 스크립트 모두 `8-15` 를 최소 2회 포함. offhours/daily cron 무변경.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 홈 프리마켓(8시대) 라벨 — shared 타입 + computeSlot + webapp 헤더 + marketHours 일관성</name>
  <files>packages/shared/src/home.ts, workers/home-sync/src/index.ts, workers/home-sync/src/index.test.ts, webapp/src/components/home/home-header.tsx, packages/shared/src/marketHours.ts</files>
  <behavior>
    - computeSlot(08:37 KST = 2026-07-01T23:37:00Z 전일 UTC... 주의: 08:37 KST = 2026-06-30T23:37:00Z) → marketStatus === "premarket", afterClose === false, capturedAt 은 08:30 슬롯.
    - computeSlot(09:00 KST) → marketStatus === "open" (기존 회귀 없음).
    - computeSlot(15:30 KST) → marketStatus === "closed" (기존 회귀 없음).
    - 타입: HomeSnapshotPayload.marketStatus 가 "premarket" | "open" | "closed" 3-유니온.
  </behavior>
  <action>
1) packages/shared/src/home.ts:70 — `marketStatus: "open" | "closed";` → `marketStatus: "premarket" | "open" | "closed";`. 주석(:69)에 "장전 프리마켓(NXT, 08시대) premarket" 한 줄 추가.

2) workers/home-sync/src/index.ts computeSlot():
   - 반환 타입 유니온(:67) `"open" | "closed"` → `"premarket" | "open" | "closed"`.
   - 판별 로직(:82-83): 마감 판별은 그대로 두고, 그 앞에 8시대 분기 추가.
     ```
     const marketStatus: "premarket" | "open" | "closed" =
       hour < 9 ? "premarket"
       : hour > 15 || (hour === 15 && slotMinute >= 30) ? "closed"
       : "open";
     ```
   - afterClose 로직 무변경(마감 후 skip 은 15:40+ 만 대상, 8시대는 정상 실행).
   - 상단 doc 주석(:28, :62) 에 "8시대 = premarket(NXT 프리마켓)" 한 줄 반영.

3) workers/home-sync/src/index.test.ts — describe("computeSlot ...") 블록(:83~)에 프리마켓 케이스 3개 추가(기존 케이스 스타일 그대로):
   - "08:37 KST → premarket, 08:30 슬롯": `computeSlot(new Date("2026-06-30T23:37:00Z"))` (08:37 KST) → capturedAt "2026-06-30T23:30:00.000Z", marketStatus "premarket", afterClose false.
   - "08:00 KST → premarket": `new Date("2026-06-30T23:00:00Z")` → marketStatus "premarket".
   - "09:00 KST → open (프리마켓 경계 회귀 없음)": `new Date("2026-07-01T00:00:00Z")` → marketStatus "open".
   (기존 open/closed 케이스는 그대로 통과해야 함 — 회귀 없음 확인.)

4) webapp/src/components/home/home-header.tsx — isCloseSlot(:58-61) 아래에 시각 기반 헬퍼 추가:
   ```
   /** 장전 프리마켓 슬롯(08시대, NXT) 판별. */
   function isPremarketSlot(iso: string): boolean {
     const hh = toKstHhmm(iso).slice(0, 2);
     return hh === '08';
   }
   ```
   슬롯 라벨 계산부(:184-186)에서 premarket 분기 추가:
   ```
   const premarket = isPremarketSlot(current.capturedAt);
   const close = isCloseSlot(current.capturedAt);
   const hhmm = toKstHhmm(current.capturedAt);
   const label = close ? `${hhmm} · 마감` : premarket ? `${hhmm} · 프리마켓` : hhmm;
   ```
   라벨 pill 폭(:239 w-[116px])은 "15:30 · 마감" 기준으로 이미 "08:30 · 프리마켓" 을 수용(동일 글자수급) — 폭 변경 불필요. payload.marketStatus 소비는 추가하지 않음(시각 기반 파생이 index-only 데이터와 정합).

5) packages/shared/src/marketHours.ts:17-18 (일관성, 저비용) — 죽은 코드지만 NXT 프리마켓 반영. 주석 `// 장 시간: 09:00 ~ 15:30 KST` → `// 장 시간(NXT 프리마켓 포함): 08:00 ~ 15:30 KST`, `timeInMinutes >= 540` → `>= 480` (08:00).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter home-sync test && pnpm --filter webapp build</automated>
  </verify>
  <done>shared 빌드 통과, home-sync 테스트 전체 통과(신규 premarket 3케이스 포함, 기존 open/closed 회귀 없음), webapp 빌드 통과. home-header 가 08시대 슬롯에 "HH:MM · 프리마켓" 표시.</done>
</task>

<task type="auto">
  <name>Task 3: 라이브 배포 — 스케줄러 3종 cron 갱신 + home-sync 재배포 + webapp Vercel</name>
  <files></files>
  <action>
코드 수정만으로는 라이브 미반영 — 아래 4단계로 실제 배포한다. GCP 인증은 영구 deployer SA 사용(MEMORY: reference_gh_radar_deployer_sa):
`export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar` (필요 시 `gcloud config set project gh-radar`).

(A) intraday-sync 스케줄러 cron 갱신 — 워커 코드 변경 없음 → 전체 재배포 대신 스케줄만 갱신(안전):
```
gcloud scheduler jobs update http gh-radar-intraday-sync-cron \
  --location=asia-northeast3 --schedule='* 8-15 * * 1-5' --time-zone=Asia/Seoul
```

(B) news-sync 장중 스케줄러 cron 갱신 — 워커 코드 변경 없음:
```
gcloud scheduler jobs update http gh-radar-news-sync-intraday \
  --location=asia-northeast3 --schedule='*/15 8-15 * * 1-5' --time-zone=Asia/Seoul
```
(gh-radar-news-sync-offhours 는 건드리지 않음.)

(C) home-sync 재배포 — Task 2 의 computeSlot(워커 코드) 변경이 있으므로 Cloud Run Job 이미지 재빌드 필요. scripts/deploy-home-sync.sh 가 이미지 재배포 + 자체 cron(`*/10 8-15`, Task 1 반영) 갱신을 함께 수행:
```
GCP_PROJECT_ID=gh-radar SUPABASE_URL=<기존값> bash scripts/deploy-home-sync.sh
```
(SUPABASE_URL 은 기존 .env.deploy 또는 이전 배포 기록에서 취득 — MEMORY: 기존 creds 재요청 금지. deploy-home-sync.sh 가 스케줄러 cron 도 갱신하므로 home-sync 는 gcloud 수동 update 중복 불필요.)

(D) webapp Vercel 배포 — home-header + shared 타입 변경 반영. Vercel ignoreCommand 가 push 를 skip 하는 함정(MEMORY: reference_vercel_frontend_deploy) → repo root 에서 수동 prebuilt 배포:
```
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

주의: 커밋/푸시는 프로젝트 규칙 — 한글 커밋 메시지, 사용자 확인 후 push, Co-Authored-By 금지. 배포 완료 후 커밋은 GSD 워크플로가 처리.
  </action>
  <verify>
    <automated>bash scripts/smoke-intraday-sync.sh --check-scheduler && bash scripts/smoke-home-sync.sh && bash scripts/smoke-news-sync.sh</automated>
  </verify>
  <done>
- 스케줄러 3종 라이브 cron: intraday `* 8-15 * * 1-5`, home `*/10 8-15 * * 1-5`, news-intraday `*/15 8-15 * * 1-5` (smoke assert 통과).
- home-sync Cloud Run Job 신규 이미지 배포(computeSlot premarket 포함), smoke-home-sync 전체 PASS.
- webapp production 배포 완료, 홈 8시대 슬롯 프리마켓 라벨 라이브(익일 08시대 첫 슬롯 생성 시 육안 확인 — 비차단).
  </done>
</task>

</tasks>

<verification>
- `! grep -rn '9-15' scripts/` — 스크립트 잔존 0건.
- `pnpm --filter home-sync test` — computeSlot premarket 신규 케이스 + 기존 회귀 없음.
- `pnpm --filter webapp build` — 프리마켓 라벨 타입/빌드 정합.
- smoke 3종(intraday --check-scheduler / home / news) — 라이브 스케줄러 8-15 assert 통과.
</verification>

<success_criteria>
- 장중 파이프라인(intraday/home/news) 라이브 cron 이 08:00 시작(8-15)으로 갱신됨.
- home-sync 워커가 8시대 슬롯에 marketStatus="premarket" 기록, 홈 헤더가 "HH:MM · 프리마켓" 표시.
- 6개 스크립트에 `9-15` 잔존 0, smoke 3종 assert 갱신 통과.
- 기존 open/closed 판별 회귀 없음(hour 9~15 정상), offhours/daily cron 무변경.
</success_criteria>

<output>
After completion, create `.planning/quick/260706-cdc-nxt-8-intraday-home-news-cron-8-15-smoke/260706-cdc-SUMMARY.md`
</output>
