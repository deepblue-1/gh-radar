---
phase: quick-261006-ide
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — 트레이서: 85 lock_sell_krw · lock_cancel_krw → relay → shared → 카드 「상한가」 탭 3줄(WinForms gp8 · f1j 동형)
  - relay/src/generated/StockDMA.fbs
  - relay/src/generated/stock-dma/limit-feature.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/hub.test.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/limit-feature.ts
  - packages/shared/src/index.ts
  - packages/shared/src/__tests__/limit-feature.test.ts
  - webapp/src/components/trading/card/limit-feature-table.tsx
  - webapp/src/components/trading/__tests__/limit-feature-table.test.tsx
  - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  - webapp/src/components/trading/__tests__/strategy-card.test.tsx
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  # Task 2 — 보고서 잠김 요약 칩(스케치 012-A) + limitup_locks 6열
  - supabase/migrations/20261006120000_limitup_locks_lock_risk.sql
  - supabase/tests/limitup_load.test.sql
  - supabase/tests/limitup_report.test.sql
  - packages/shared/src/limitup-report.ts
  - webapp/src/lib/limitup-lanes.ts
  - webapp/src/lib/__tests__/limitup-lanes.test.ts
  - webapp/src/components/analytics/limitup-event-card.tsx
  - webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx
  - webapp/e2e/specs/limitup-report.spec.ts
  # Task 3 — export schema_version 1·2 수용 + 인박스 닫기
  - workers/limitup-sync/src/manifest.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/tests/manifest.test.ts
  - workers/limitup-sync/tests/dispatch.test.ts
  - docs/inbox/from-gh-trade/261006-limitup-lock-risk.md
autonomous: true
requirements: [IDE-CARD, IDE-REPORT, IDE-SCHEMA2, IDE-INBOX]
assumption_delta: skipped (quick task, no phase section)

estimate:
  tokens: 125000
  raw_tokens: 125000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "relay 생성물이 gh-trade fbs 정본(마지막 변경 ea8d9171)과 같다 — gh-trade 소유 sync-relay-schema.sh 로 재생성했고, SYNC MARKER server-repo-commit 이 ea8d9171 이며 2404509b 대비 차이는 85 LimitFeature 말미 lock_sell_krw · lock_cancel_krw 두 필드뿐이다 (IDE-CARD)"
    - "relay parseLimitFeature 가 lockSellKrw() · lockCancelKrw() 를 toNum 경계로 읽어 relay→web JSON limit.feature 에 lockSellKrw · lockCancelKrw(원, number)로 싣는다. 두 필드가 없는 구 gh-trade 서버 프레임은 FlatBuffers 기본값 0 이다. kind 15(관찰자 저널) 다리 limitFeatureOfStrategyEvent 는 두 값을 0 으로 채운다 — 슬롯 무변경(gh-trade 결정) (IDE-CARD)"
    - "카드 탭 「상한가」 표는 3행 누적 / 10초 / 창구 이고 「지금」 행이 없다. 상태(잠김/깨짐/미도달 · 대기 · 소진/매도벽/상한가, 단일가 접두)는 표 title 첫 줄로만 간다. 카드 높이는 탭 선택 전후 같다 (IDE-CARD)"
    - "누적 행 칸 = 「매도 X.X억」(--down) · 「취소 X.X억」(--down) · 「위험도 NN%」(색 없음, lockSellKrw ÷ qKrw × 100 짝수 반올림 정수, qKrw 0 → 「위험도 —」, 100% 초과 가능). lockState 0 → 세 칸 「—」, lockState 2 이고 두 금액 모두 0 → 세 칸 「—」, lockState 1 은 0 이어도 「매도 0」 (IDE-CARD)"
    - "잠김 중(lockState 1) 누적 행 머리는 「누적」 대신 잠김 경과 「m:ss」(1시간 이상 「h:mm:ss」)를 --up 보통 굵기로 보이고 「1:05:20」 도 머리 칸에서 잘리지 않는다. 그 밖에는 「누적」(기존 머리 모양). title 의 행 문장 머리는 늘 기본 머리(누적/10초/창구)다 (IDE-CARD)"
    - "public.limitup_locks 에 sell_krw · cancel_krw(bigint) · risk_3s · risk_10s · risk_60s · risk_pre(double precision, nullable) 6열이 있다. 적재 RPC(jsonb_populate_record)는 새 키를 그대로 채우고 키가 없으면 null, 보고서 RPC(to_jsonb(l))는 6키를 내보낸다 — RPC 본문 무변경, 표 단위 REVOKE/GRANT 가 새 열에도 적용 (IDE-REPORT)"
    - "보고서 펼친 사건 카드의 「잠김 구간」 레인 제목 아래 · 차트 위에 잠김마다 칩 한 줄: 「누적 매도 X」 · 「취소 X」(값 --down) · 「위험도 +3초 a% · +10초 b% · +60초 c% · 깨짐 3초 전 d%」(깨지지 않은 잠김은 「끝 3초 전」, round(r×100) 정수 %, null 「—」, 100% 초과 가능). 잠김이 2개 이상이면 줄 머리 「잠김 N」(lock_id). 6값이 모두 null 인 잠김은 줄 자체가 없고, 줄이 하나라도 있으면 캡션 「위험도 = 그 시점까지 누적 매도 ÷ 그 시점 대기 금액 · 100% 를 넘을 수 있다」 1회. 390 에서 가로 넘침 없이 줄바꿈된다 (IDE-REPORT)"
    - "limitup-sync 워커는 manifest schema_version 1 과 2 를 둘 다 적재하고 그 밖의 값(예: 3)은 지금처럼 skip \"schema\" 한다. 워커 · relay · web 어디도 85 featureSchema 나 격자 schema_version 으로 분기하지 않는다(gh-trade 판 올림 안전) (IDE-SCHEMA2)"
    - "인박스 노트 261006-limitup-lock-risk.md 가 status: done · done_commit 채움으로 경로 지정 커밋되어 있다 (IDE-INBOX)"
  artifacts:
    - path: "relay/src/generated/StockDMA.fbs"
      provides: "SYNC MARKER server-repo-commit ea8d9171 + lock_sell_krw · lock_cancel_krw"
      contains: "lock_cancel_krw"
    - path: "relay/src/dma/envelope.ts"
      provides: "parseLimitFeature → lockSellKrw · lockCancelKrw (toNum)"
      contains: "limit_feature.lock_sell_krw"
    - path: "packages/shared/src/limit-feature.ts"
      provides: "LIMIT_FEATURE_ROW_HEADERS 누적/10초/창구 · formatClock · limitFeatureRowHeads · 상태 줄 툴팁"
      contains: "limitFeatureRowHeads"
    - path: "webapp/src/components/trading/card/limit-feature-table.tsx"
      provides: "행 머리 th 가 limitFeatureRowHeads 를 그린다(경과 = --up 보통 굵기)"
      contains: "limitFeatureRowHeads"
    - path: "supabase/migrations/20261006120000_limitup_locks_lock_risk.sql"
      provides: "limitup_locks ADD COLUMN 6"
      contains: "risk_pre"
    - path: "webapp/src/lib/limitup-lanes.ts"
      provides: "lockRiskRowsOf(locks) — 칩 줄 뷰 모델"
      contains: "lockRiskRowsOf"
    - path: "webapp/src/components/analytics/limitup-event-card.tsx"
      provides: "data-slot limitup-lock-risk 칩 줄 + limitup-lock-risk-caption"
      contains: "limitup-lock-risk"
    - path: "workers/limitup-sync/src/manifest.ts"
      provides: "KNOWN_SCHEMA_VERSIONS = {1, 2}"
      contains: "KNOWN_SCHEMA_VERSIONS"
  key_links:
    - from: "relay/src/dma/envelope.ts parseLimitFeature"
      to: "relay/src/generated/stock-dma/limit-feature.ts lockSellKrw()/lockCancelKrw()"
      via: "toNum(lf.lockSellKrw(), \"limit_feature.lock_sell_krw\")"
      pattern: "lockSellKrw\\(\\)"
    - from: "webapp/src/components/trading/card/limit-feature-table.tsx"
      to: "packages/shared/src/limit-feature.ts"
      via: "limitFeatureCells · limitFeatureRowHeads · limitFeatureTooltip"
      pattern: "limitFeatureRowHeads\\("
    - from: "supabase limitup_commit_day (jsonb_populate_record) / limitup_report_for_user (to_jsonb(l))"
      to: "public.limitup_locks 새 6열"
      via: "열 이름 = export 키 이름(sell_krw · cancel_krw · risk_*)"
      pattern: "sell_krw"
    - from: "webapp/src/components/analytics/limitup-event-card.tsx"
      to: "webapp/src/lib/limitup-lanes.ts lockRiskRowsOf"
      via: "row.locks → 칩 줄"
      pattern: "lockRiskRowsOf\\("
    - from: "workers/limitup-sync/src/index.ts loadDay"
      to: "workers/limitup-sync/src/manifest.ts KNOWN_SCHEMA_VERSIONS"
      via: "KNOWN_SCHEMA_VERSIONS.has(m.schema_version)"
      pattern: "KNOWN_SCHEMA_VERSIONS\\.has"
---

<objective>
gh-trade ea8d9171(f1j) · 8ee9ae7b(gp8) 인계 노트 `docs/inbox/from-gh-trade/261006-limitup-lock-risk.md` 를 gh-radar 에 반영한다. 사용자 승인(2026-10-06 「1,2,3 진행하자. 그후에 배포」) 범위 그대로다.

1. ② 실시간 카드 「상한가」 탭을 WinForms 동형으로 바꾼다(gh-trade `LimitChaserForm.BuildLimitFeatureCells` · `ApplyLimitFeatureTable` · `LimitFeatureTable.cs` 가 정본). 85 의 새 말미 필드 lock_sell_krw · lock_cancel_krw 를 relay 가 중계하고, 표는 누적 / 10초 / 창구 3행이 된다. 「지금」 행은 툴팁 첫 줄로 가고, 잠김 경과는 누적 행 머리로 간다.
2. ① 상한가 보고서 펼친 상세 「잠김 구간」 에 스케치 012-A 요약 칩을 단다. limitup_locks 에 6열 마이그레이션을 추가한다.
3. ③ limitup-sync 가 export schema_version 2 를 받게 한다. 끝으로 인박스 노트를 닫는다.

Purpose: 트레이더가 잠김이 얼마나 먹혔는지(누적 매도 · 취소 · 위험도)를 실시간 카드와 밤 보고서 양쪽에서 WinForms 와 같은 숫자로 본다. gh-trade 는 판 올림(schema_version 2)을 막힘 없이 진행할 수 있다.
Output: relay 생성물 · 파서, shared 순수 함수, 카드 표, 마이그레이션 1개, 보고서 칩, 워커 판 수용, 인박스 닫힘 커밋. 배포는 하지 않는다(아래 「배포 — 메인 세션 몫」).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@tasks/lessons.md
@docs/inbox/from-gh-trade/261006-limitup-lock-risk.md
@.planning/sketches/012-limitup-lock-risk/README.md

# gh-trade 원문(동형 정본 — 읽기만, gh-trade 저장소에 아무것도 커밋하지 않는다)
# /Users/alex/repos/gh-trade/docs/features/limitup-feature.md  §⑥ 「클라 3줄 표」 (89~129행)
# /Users/alex/repos/gh-trade/client/Forms/Trading/LimitChaserForm.cs  ApplyLimitFeatureTable(3703~) · BuildLimitFeatureCells(3759~) · FormatClock · FormatEok(3906)
# /Users/alex/repos/gh-trade/client/Controls/LimitFeatureTable.cs  RowHeaders · SetRowHeaderOverride · OnPaint(머리 덮어쓰기는 보통 굵기)
# /Users/alex/repos/gh-radar/.planning/sketches/012-limitup-lock-risk/index.html  riskChips()(141~146행) · 캡션(162행)

@packages/shared/src/limit-feature.ts
@webapp/src/components/trading/card/limit-feature-table.tsx
@webapp/src/components/analytics/limitup-event-card.tsx

<interfaces>
<!-- 실측(플래닝 시점 2026-10-06) — 탐색 없이 바로 쓴다 -->

gh-trade fbs: `git -C /Users/alex/repos/gh-trade log -1 --format=%h -- server/src/protocol/StockDMA.fbs` = ea8d9171 (8ee9ae7b gp8 는 fbs 무변경).
gh-radar `relay/src/generated/StockDMA.fbs` 마커 = 2404509b. 마커 제외 본문 차이 = 85 LimitFeature 말미 3줄(주석 1 + 필드 2)뿐이다(플래너가 diff 로 확인함).
  lock_sell_krw: ulong;   // 슬롯 68
  lock_cancel_krw: ulong; // 슬롯 70
flatc = /opt/homebrew/bin/flatc 25.12.19 (스크립트 고정값과 같음).

relay/src/dma/envelope.ts — `parseLimitFeature(env): RelayLimitFeatureMsg | null` (893행~), 64비트 칸은 `toNum(v: bigint, label)` (299행 — 안전 정수 밖이면 클램프 + warn).
relay/tests/helpers/frames.ts — `FakeLimitFeatureInput`(1785행~) · `buildLimitFeatureFrame(input)`(1834행~ · 이름 있는 add* 빌더). webapp e2e `pushLimitFeatureFixture(gateway, sock, opts)` 가 이 입력 타입을 그대로 넘긴다. e2e 의 relay 는 `tsx relay/src/index.ts` 소스 실행이다.
relay hand-copy 3곳(msg-type.ts · envelope.ts · subscription-hub.ts): 85 MsgType 번호 무변경 · hub/fanout 은 RelayLimitFeatureMsg 객체를 필드 무관하게 캐시 · 팬아웃한다 → 바꿀 곳은 envelope.ts 의 parseLimitFeature 하나뿐이다.

packages/shared/src/limit-feature.ts (현재):
  type LimitFeatureCell = { text; tone: "up"|"down"|"fg"|"muted"|"faint"; strong: boolean; narrow: string|null }
  LIMIT_FEATURE_ROW_HEADERS = ["지금", "10초", "창구"] as const
  limitFeatureCells(msg|null): 9칸(행 우선) · limitFeatureTooltip(msg|null) · limitFeatureTabSuffix(msg|null)
  formatEok · formatDuration · formatGroup · roundPctHalfEven(part, total) · formatManQty · formatRatePct (모두 export)
  limitFeatureOfStrategyEvent(row) — kind 15 행 → RelayLimitFeatureMsg (featureSchema: 1 하드코딩, 표시 무관)
  `strong` 소비처 = webapp limit-feature-table.tsx 하나(플래너 grep).

WinForms 동형 규칙(LimitChaserForm.cs 원문 그대로):
  상태 줄(툴팁 첫 줄 전용) — lock 1: 「잠김 {FormatDuration}째」 · 「대기 {억}」 · 「소진 {dur | —}」 / lock 2: 「깨짐」 · 「대기 {억}」 · 「매도벽 {억}{+}」 / 그 밖: 「미도달 ({rate})」 · 「매도벽 …」 · 「상한가 {N0 | —}」 / auction 이면 첫 칸 앞 「단일가 · 」.
  누적 행 — noLock = lockState 0 또는 (lockState 2 이고 LockSellKrw 0 이고 LockCancelKrw 0) → 「—」 ×3. 아니면 「매도 {FormatEok(sell)}」 파랑 · 「취소 {FormatEok(cancel)}」 파랑 · qKrw 0 이면 「위험도 —」, 아니면 「위험도 {Math.Round(sell*100.0/qKrw)}%」(.NET 기본 = 짝수 반올림, 색 없음).
  FormatClock(s): s<0 → 0; s ≥ 3600 → 「h:mm:ss」, 아니면 「m:ss」.
  툴팁 = 상태 세 칸 「 · 」 연결, 이어서 "\n" + 「{GetRowHeader(r)} {c1} · {c2} · {c3}」 ×3 (GetRowHeader = 기본 머리, 덮어쓴 경과가 아니다), 이어서 기존 「HH:mm:ss 기준」 · 「 · 깨짐확률은 N초 안」 꼬리 규칙 그대로.
  머리 덮어쓰기(경과)는 보통 굵기 + PriceUp(빨강).

packages/shared/src/limitup-report.ts — `interface LimitupLockRow`(54행~, 주석 「22열」) · `type LimitupGridCol`(193행~ 「격자 열 24개」).
webapp/src/lib/limitup-lanes.ts — `fmtKrwShort(krw)`(110행: 1억 이상 formatEok, 그 아래 「N만」) — 보고서 금액 표기 정본.
webapp/src/components/analytics/limitup-event-card.tsx — 「잠김 구간」 블록 = `data-slot="limitup-lane-lock"`(261행~): LANE_HEAD(h3 「잠김 구간」 + 캡션) → LimitupLane | LaneSlot. 상수 CAPTION · FAINT · SUBHEAD · LANE_HEAD. 요약 상자 배경 토큰 `bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]`.
webapp/src/test-fixtures/limitup-report.ts — `lockRow(p)`(64행 · Partial 기본값). e2e `webapp/e2e/fixtures/limitup-report.ts` = 실 export 20261002(새 키 없음).
webapp/e2e/specs/limitup-report.spec.ts — `installLimitupMocks(page)`(49행 · page.route 로 limitupReportFixture() 응답) · P28-R1(170행) · P28-R1b 390(297행).

supabase: 20261006090100 이 limitup_locks 를 표 단위로 잠근다(RLS 활성 + 정책 0 + PUBLIC/anon/authenticated 명시 REVOKE + service_role GRANT — 열 단위 GRANT 없음). 20261006090200 적재 = `INSERT INTO public.limitup_locks SELECT (jsonb_populate_record(NULL::public.limitup_locks, s.payload)).*`(열 목록 없는 위치 대응 — 새 열은 표와 레코드 양쪽 끝에 같이 붙는다). 20261006090400 보고서 = `jsonb_agg(to_jsonb(l) …) FROM public.limitup_locks l`. 20261006090500 은 BEGIN/COMMIT 뒤 `NOTIFY pgrst, 'reload schema';` 로 끝난다.
pgTAP 실행기: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<파일>` — 일회용 로컬 컨테이너에 저장소 마이그레이션 재생(원격 접촉 0). limitup_load.test.sql = plan(145) · limitup_report.test.sql = plan(50) · 헬퍼 `pg_temp.st(date, tbl, seq, payload)`.

workers/limitup-sync: manifest.ts 15행 `export const KNOWN_SCHEMA_VERSION = 1;` · index.ts 7행 import · 14행 re-export · 187~189행 `if (m.schema_version !== KNOWN_SCHEMA_VERSION) { await skip(date, "schema", { schema_version, known }) }`. tests/dispatch.test.ts 160 · 213행이 「모르는 판」 예로 schema_version 2 를 쓴다. 판 값은 load.ts 가 p_schema_version 으로 그대로 넘길 뿐 DB 제약 없음 · derive.ts GridJson.schema_version 은 타입만.
</interfaces>
</context>

<executor_rules>
- 메인 체크아웃 master 에서 순차 실행한다(worktree 격리 금지 — 플래너가 확인한 상태 master...origin/master). 시작 때 `git -C /Users/alex/repos/gh-radar status -sb` 가 master 가 아니면 멈추고 보고한다.
- 커밋마다 직전에 `git status -sb` 를 다시 보고, **경로를 지정해** stage 한다(`git add -A` · `git add .` 금지). 시작 전부터 있던 untracked(.planning/milestone.lock · 여러 quick 의 shots/ · .planning/research/.cache/ · docs/inbox/from-gh-trade/261006-limitup-lock-risk.md 는 Task 3 마지막 커밋에서만)는 건드리지 않는다. 남의 로컬 커밋이 새로 보이면 멈추고 보고한다(동시 세션 경합).
- 커밋 메시지는 한글 `feat(quick-261006-ide): …` / 인박스는 `docs(inbox): …`. **Co-Authored-By 줄을 절대 넣지 않는다**(사용자 전역 규칙이 시스템 기본값보다 우선).
- **push 금지 · 배포 금지** — `supabase db push`, `gcloud`, `scripts/deploy-*.sh`, relay 재기동 어느 것도 실행하지 않는다(서브에이전트 배포는 분류기 차단 + push 가 곧 webapp 프로덕션 배포). 배포는 메인 세션 몫이다(아래 절).
- gh-trade 저장소: sync 스크립트 실행만 한다. 그 저장소에서 파일을 고치거나 커밋하지 않는다(스크립트는 gh-radar/relay 에만 쓴다). 실행 전후 `git -C /Users/alex/repos/gh-trade status --porcelain` 이 같아야 한다(이미 있던 untracked 2개는 그대로).
- STATE.md · ROADMAP.md 는 고치지 않는다(quick 오케스트레이터가 기록한다).
- 검증: shared 를 고친 뒤에는 webapp/relay 검증 전에 `pnpm --filter @gh-radar/shared build` 를 먼저 돈다. dev 포트는 3100(playwright webServer `PORT=3100 pnpm dev`). Playwright webServer 가 NextFontGoogleFontFileReplacer 반복으로 타임아웃이면 `rm -rf /Users/alex/repos/gh-radar/webapp/.next` 후 다시 돌린다(코드 문제 아님). 환경 문제로 못 돈 검증은 생략하지 말고 원인을 SUMMARY 에 그대로 적는다.
- 스크린샷은 `/Users/alex/repos/gh-radar/.planning/quick/261006-ide-lock-risk-relay-85-lock-sell-cancel-repo/shots/` 에 둔다(다른 quick 의 shots/ 처럼 커밋하지 않는다). Read 로 직접 열어 보고, 줄바꿈 · 잘림 · 겹침 같은 시각 결함은 묻지 말고 고친 뒤 SUMMARY 에 한 줄로 적는다.
</executor_rules>

<tasks>

<task type="tracer">
  <name>Task 1: 85 누적 매도 · 취소 한 경로 — relay 재생성 · 파서 → shared 3줄 표(WinForms gp8 · f1j 동형) → 카드 「상한가」 탭 → e2e</name>
  <files>relay/src/generated/StockDMA.fbs, relay/src/generated/stock-dma/limit-feature.ts, relay/src/dma/envelope.ts, relay/src/dma/__tests__/envelope.test.ts, relay/tests/helpers/frames.ts, relay/tests/hub.test.ts, packages/shared/src/relay.ts, packages/shared/src/limit-feature.ts, packages/shared/src/index.ts, packages/shared/src/__tests__/limit-feature.test.ts, webapp/src/components/trading/card/limit-feature-table.tsx, webapp/src/components/trading/__tests__/limit-feature-table.test.tsx, webapp/src/components/trading/__tests__/card-tabs.test.tsx, webapp/src/components/trading/__tests__/strategy-card.test.tsx, webapp/src/lib/__tests__/relay-socket.test.ts, webapp/e2e/specs/trading-workbench.spec.ts</files>
  <read_first>/Users/alex/repos/gh-trade/client/Forms/Trading/LimitChaserForm.cs 3684~3910행 (ShowCachedLimitFeature · ApplyLimitFeatureTable · BuildLimitFeatureCells · FormatClock · FormatEok), /Users/alex/repos/gh-trade/docs/features/limitup-feature.md 89~129행, packages/shared/src/limit-feature.ts 전체, webapp/src/components/trading/card/limit-feature-table.tsx, relay/src/dma/envelope.ts 880~960행, relay/tests/helpers/frames.ts 1780~1890행, webapp/e2e/specs/trading-workbench.spec.ts 2679~2870행 (P28-1 · P28-1b · P28-2)</read_first>
  <action>
**(a) relay 생성물 재생성 — gh-trade 소유 스크립트(IDE-CARD).** 먼저 `git -C /Users/alex/repos/gh-trade status --porcelain` 을 적어 둔다. `cd /Users/alex/repos/gh-trade && RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh --check` 로 가드를 통과하는지 보고, 이어서 `--check` 없이 같은 명령으로 반영한다(스크립트가 server/ 로 cd 하므로 RELAY 는 절대경로). 그 뒤 `git -C /Users/alex/repos/gh-radar diff --stat relay/src/generated` 로 확인한다. 기대 범위는 StockDMA.fbs(마커 server-repo-commit ea8d9171 · synced-date 2026-10-06 + 85 말미 3줄)와 stock-dma/limit-feature.ts(lockSellKrw/lockCancelKrw 접근자 · add 빌더 · 필드 수)뿐이다. 다른 테이블 · 파일이 바뀌면 미병합 스키마 드리프트다 — 멈추고 보고한다. 생성 .ts 는 손으로 고치지 않는다. 끝나면 gh-trade status 가 처음과 같은지 다시 본다.

**(b) relay 파서.** envelope.ts `parseLimitFeature` 반환 객체의 pHorizonS 뒤에 lockSellKrw · lockCancelKrw 를 더한다. 값은 `toNum(lf.lockSellKrw(), "limit_feature.lock_sell_krw")` 와 `toNum(lf.lockCancelKrw(), "limit_feature.lock_cancel_krw")` 이다. 원 단위라 2^53 밖이 나오면 기존 toNum 클램프 + warn 을 그대로 탄다. 값은 계산하지 않는다(D-19). 함수 JSDoc 에 「fbs ea8d9171 — 85 말미 append 2필드, 구 서버 프레임은 FlatBuffers 기본값 0」 한 줄을 더한다. msg-type.ts · subscription-hub.ts 는 바꿀 것이 없다(85 번호 무변경 · hub/fanout 은 객체를 그대로 캐시 · 팬아웃). 이 사실을 grep 으로 확인하고 SUMMARY 에 적는다.
frames.ts `FakeLimitFeatureInput` 에 `lockSellKrw?: bigint; lockCancelKrw?: bigint` 를 더하고, `buildLimitFeatureFrame` 에서 pHorizonS 뒤에 `LimitFeature.addLockSellKrw` · `addLockCancelKrw` 를 부른다. 기본값은 잠김 시나리오에 맞춰 600_000_000n(6.0억) · 460_000_000n(4.6억)으로 둔다. 상단 JSDoc 의 「32필드」 · 기본 시나리오 설명도 고친다. 기본 qKrw 17.3억 기준으로 위험도는 35% 가 된다.
envelope.test.ts: 기본 프레임 toEqual 에 lockSellKrw 600_000_000 · lockCancelKrw 460_000_000 을 더한다. 구 서버 케이스(두 값 0n → 0 · 0)를 한 건 추가한다. hub.test.ts 등 RelayLimitFeatureMsg 리터럴 · 기대값이 있는 relay 테스트를 typecheck:tests 와 test 가 통과하게 맞춘다.

**(c) shared 계약 + 순수 함수 — WinForms 원문 그대로(IDE-CARD).**
- relay.ts `RelayLimitFeatureMsg` 의 pHorizonS 뒤에 `lockSellKrw: number` · `lockCancelKrw: number` 를 더한다. JSDoc 은 인박스 표의 뜻을 그대로 옮긴다: 이번 잠김 누적 매도 주도 상한가 체결 금액(원) / 같은 창 상한가 매수잔량 취소 금액(원, 하한). 잠김이 끝나면 마지막 값 유지, 오늘 잠김 없으면 0, 06:00 리셋 0, 구 서버 0. 타입 머리 JSDoc 의 fbs 표기에 ea8d9171 append 를 덧붙인다.
- limit-feature.ts: `LIMIT_FEATURE_ROW_HEADERS` 를 `["누적", "10초", "창구"]` 로 바꾼다. `formatClock(s)` 를 export 로 추가한다(FormatClock 동형 — 음수 0 처리, 3600 이상 「h:mm:ss」, 아니면 「m:ss」, 두 자리 0 채움).
- 상태 줄 세 칸 계산(지금 limitFeatureCells 의 now 갈래 + 단일가 접두)을 내부 함수로 떼어 툴팁 전용으로 쓴다. `limitFeatureCells` 는 9칸 = 누적 · 10초 · 창구를 돌려준다. 10초 · 창구 갈래와 폰 narrow 문구는 지금 코드 그대로 두므로 칸 인덱스 3~8 은 바뀌지 않는다.
- 누적 행 규칙: noLock(lockState 0, 또는 lockState 2 이고 두 금액 모두 0)이면 `cell(DASH)` ×3 이다(색 fg — 10초 행 「—」 와 같음). 아니면 「매도 {formatEok(lockSellKrw)}」 down · 「취소 {formatEok(lockCancelKrw)}」 down · qKrw 0 이면 「위험도 —」, 아니면 「위험도 {roundPctHalfEven(lockSellKrw, qKrw)}%」 fg 다. roundPctHalfEven 은 .NET Math.Round 기본(짝수)과 같은 기존 헬퍼다.
- 표에 굵은 칸이 더는 없다(WinForms 는 칸을 모두 보통 굵기로 그린다). `LimitFeatureCell.strong` 필드와 cell() 의 strong 인자를 없애고 EMPTY_CELL 도 맞춘다. 소비처는 limit-feature-table.tsx 하나뿐이다.
- 새 export `limitFeatureRowHeads(msg | null): LimitFeatureRowHead[]` 를 만든다. 타입 `LimitFeatureRowHead = { text: string; elapsed: boolean }` 도 export 한다. 3개를 돌려주며, lockState 1 이면 0번 = `{ text: formatClock(lockElapsedS), elapsed: true }`, 그 밖과 null 은 기본 머리 `elapsed: false` 다.
- `limitFeatureTooltip`: 첫 줄 = 상태 세 칸 「 · 」 연결. 이어 3줄 = `${LIMIT_FEATURE_ROW_HEADERS[r]} ${c1} · ${c2} · ${c3}` 로, 칸은 늘 넓은 밴드 text, 머리는 늘 기본 머리다. 시각 · 확률 꼬리 규칙은 지금 그대로다. null → 「」.
- `limitFeatureOfStrategyEvent` 반환에 lockSellKrw: 0 · lockCancelKrw: 0 을 넣는다. 주석: kind 15 슬롯에 싣지 않는다(gh-trade 2026-10-06 결정). limitFeatureLogParts 는 바꾸지 않는다.
- 파일 머리 JSDoc 에 「quick-261006-ide — gh-trade gp8 · f1j 동형: 지금 행 → 툴팁 첫 줄, 누적 행 · 경과 머리」 를 더한다.
- index.ts 에서 formatClock · limitFeatureRowHeads · LimitFeatureRowHead 를 내보낸다.

**(d) webapp 표.** limit-feature-table.tsx 의 th 는 `limitFeatureRowHeads(feature)`(useMemo)를 그린다. tr key 는 행 번호로 바꾼다(머리 글자가 1초마다 바뀐다). th 에 `data-slot="lc-limit-feature-head"` 와 elapsed 일 때 `data-elapsed="true"` 를 단다. elapsed 머리는 `text-[var(--up)] font-normal` 이고 숫자는 tabular(mono 허용)다. 기본 머리는 지금 클래스 그대로다. 「1:05:20」 이 w-11 머리 칸에서 잘리면 elapsed 일 때만 가로 패딩을 줄여 맞춘다. col 폭은 바꾸지 않는다(값 칸 폭 보존). 칸 컴포넌트의 strong 분기와 memo 비교에서 strong 을 뺀다. 머리 JSDoc 을 「행 누적 · 10초 · 창구 — 상태는 title 첫 줄, 잠김 경과는 누적 행 머리(WinForms gp8)」 로 고친다. 카드 높이 · 3행 · 고정 높이는 그대로 둔다.

**(e) 테스트 — RED 먼저(shared · webapp 단위).**
shared limit-feature.test.ts 의 「지금 행」 describe 를 「상태 줄(툴팁 첫 줄)」 로 옮긴다. 기존 lock 1/2/0 · 단일가 기대 문자열은 툴팁 첫 줄로 그대로 단언한다. 새로 다룰 것:
- 누적 행 — lock 1 기본(6.0억/4.6억/qKrw 17.3억 → 「매도 6.0억」「취소 4.6억」「위험도 35%」, tone down/down/fg) · lock 1 두 금액 0 → 「매도 0」「취소 0」「위험도 0%」 · lock 1 qKrw 0 → 「위험도 —」 · lock 2 qKrw 2.1억 → 「위험도 286%」 · lock 2 두 금액 0 → 「—」 ×3 · lock 0 → 「—」 ×3 · 짝수 반올림 경계(sell 125 / q 1000 → 12%, 135 / 1000 → 14%).
- formatClock — 0 → 「0:00」, 43 → 「0:43」, 63 → 「1:03」, 3920 → 「1:05:20」, -5 → 「0:00」.
- limitFeatureRowHeads — lock 1 43 → [「0:43」 elapsed, 「10초」, 「창구」] · lock 2 → 「누적」.
- 툴팁 골든 — 기본 lock 1 프레임의 첫 두 줄은 「잠김 43초째 · 대기 17.3억 · 소진 —」 과 「누적 매도 6.0억 · 취소 4.6억 · 위험도 35%」, 미도달 첫 줄은 「미도달 (+26.8%) · 매도벽 0 · 상한가 13,000」.
- limitFeatureOfStrategyEvent 0 · 0.
webapp limit-feature-table.test.tsx · card-tabs.test.tsx · strategy-card.test.tsx · relay-socket.test.ts 는 새 필드 · 새 행 문구 · 머리(「0:43」 --up font-normal / 「누적」)에 맞춘다. 첫 칸 --up 600 단언은 머리 단언으로 바꾼다.

**(f) e2e(trading-workbench.spec.ts, 3100).**
- P28-1: 제목의 「지금 행」 을 「누적 행」 으로 바꾼다. cells 0~2 는 「매도 6.0억」「취소 4.6억」「위험도 35%」, 누적 머리는 「0:43」(data-elapsed) 이다. 표 title 첫 줄은 「잠김 43초째 · 대기 17.3억 · 소진 —」 이다.
- P28-1 (c) lock 2 프레임: 탭 이름 「상한가 · 깨짐」 은 그대로다. 머리는 「누적」, cells 0~2 는 「매도 6.0억」「취소 4.6억」「위험도 286%」, title 첫 줄은 「깨짐 · 대기 2.1억 · 매도벽 0.9억+」 이다. 카드 높이 불변도 본다.
- P28-2(390): 기존 4~6번 칸 단언은 그대로 둔다(인덱스 불변). 누적 머리 「1:03」 이 보이고 머리 · 누적 3칸이 잘리지 않는지(scrollWidth ≤ clientWidth) 본다. lockElapsedS 3920 프레임을 한 번 더 밀어 머리 「1:05:20」 이 잘리지 않는지도 본다.
- 1280 · 390 에서 카드 「상한가」 탭 스크린샷을 shots/ 에 `lc-limit-feature-1280.png` · `lc-limit-feature-390.png` 로 남긴다.
- order-log.spec.ts P28-O1(kind 15)은 코드 변경 없이 회귀로만 돌린다.

**(g) 커밋 1.** `git status -sb` 확인 뒤 위 files 중 실제로 바뀐 경로만 stage 한다(relay/src/generated 는 디렉터리 경로 지정 허용). 메시지 예: `feat(quick-261006-ide): 85 잠김 누적 매도·취소 중계 + 카드 상한가 탭 3줄(누적/10초/창구) — gh-trade gp8·f1j 동형, relay 생성물 ea8d9171`.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && grep -q "server-repo-commit: ea8d9171" relay/src/generated/StockDMA.fbs && grep -q "limit_feature.lock_sell_krw" relay/src/dma/envelope.ts && grep -q 'LIMIT_FEATURE_ROW_HEADERS = \["누적", "10초", "창구"\]' packages/shared/src/limit-feature.ts && grep -q "limitFeatureRowHeads" webapp/src/components/trading/card/limit-feature-table.tsx && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P28-" && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/order-log.spec.ts -g "P28-O1"</automated>
  </verify>
  <done>relay 생성물 마커가 ea8d9171 이고 diff 는 85 두 필드뿐이다. gh-trade 작업 트리는 무변경이다. relay 는 lockSellKrw · lockCancelKrw 를 중계한다(구 서버 0). 카드 「상한가」 탭은 누적/10초/창구 3행이고, 누적 칸 · 경과 머리 · 툴팁 첫 줄 상태가 WinForms 원문 규칙과 일치한다. 카드 높이는 불변이다. shared · relay · webapp 단위와 e2e P28-1/1b/2 · P28-O1 이 통과하고 1280/390 스크린샷에 결함이 없다. 커밋 1개(Co-Authored-By 없음 · push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 보고서 「잠김 구간」 요약 칩(스케치 012-A) — limitup_locks 6열 마이그레이션 → shared 행 타입 → lockRiskRowsOf → 사건 카드 칩 줄</name>
  <files>supabase/migrations/20261006120000_limitup_locks_lock_risk.sql, supabase/tests/limitup_load.test.sql, supabase/tests/limitup_report.test.sql, packages/shared/src/limitup-report.ts, webapp/src/lib/limitup-lanes.ts, webapp/src/lib/__tests__/limitup-lanes.test.ts, webapp/src/components/analytics/limitup-event-card.tsx, webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx, webapp/e2e/specs/limitup-report.spec.ts</files>
  <read_first>supabase/migrations/20261006090100_limitup_tables.sql 82~106행 · 251~260행, supabase/migrations/20261006090200_limitup_load_rpcs.sql 100~110행, supabase/migrations/20261006090400_limitup_report_rpcs.sql 70~100행, supabase/migrations/20261006090500_limitup_commit_day_timeout.sql (머리말 · NOTIFY 꼬리 형식), supabase/tests/limitup_load.test.sql 1~60행, supabase/tests/limitup_report.test.sql 70~155행, .planning/sketches/012-limitup-lock-risk/index.html 35~40행 · 141~163행, webapp/src/components/analytics/limitup-event-card.tsx 전체, webapp/e2e/specs/limitup-report.spec.ts 40~120행 · 297~340행</read_first>
  <behavior>
    - lockRiskRowsOf([덕우 lock 1 broke true · sell 9.8e8 · cancel 9.2e8 · r3 0.04 · r10 0.40 · r60 null · pre 0.25]) → 1줄, prefix null, 「9.8억」 · 「9.2억」 · 위험도 [「+3초」 「4%」, 「+10초」 「40%」, 「+60초」 「—」, 「깨짐 3초 전」 「25%」]
    - broke false(또는 null) + pre 1.92 → 마지막 라벨 「끝 3초 전」 · 「192%」 (100% 초과 그대로)
    - 6값이 모두 null 이거나 키가 없는(undefined) 잠김 → 줄 없음. 모든 잠김이 그렇다면 [] → 칩 영역 · 캡션 렌더 0
    - 한 종목 잠김 2개(lock_id 1 · 2) → 두 줄, prefix 「잠김 1」 · 「잠김 2」(lock_id 순). 잠김 1개면 prefix null
    - 금액 1억 미만은 fmtKrwShort 그대로(「7,000만」), sell/cancel null → 「—」
    - pgTAP: 새 키가 있는 locks payload 를 commit 하면 6열이 그 값이다. 키 없는 기존 시나리오 A 행은 6열 모두 NULL 이다. 보고서 JSON day.locks 원소에 sell_krw · risk_pre 키가 값 그대로(없던 행은 JSON null로) 실린다
  </behavior>
  <action>
**(a) 마이그레이션(IDE-REPORT).** `supabase/migrations/20261006120000_limitup_locks_lock_risk.sql` 을 새로 만든다. 머리말은 기존 limitup 마이그레이션 형식(====== 블록 · 한국어)을 따르고 다음을 적는다.
- 왜: gh-trade ea8d9171 locks export 새 키 6개. sell_krw · cancel_krw 는 그 잠김 합(원 정수), risk_3s/10s/60s 는 잠김 시작 +3/+10/+60초, risk_pre 는 깨짐/끝 −3초. 값은 소수(0.36)이고 100% 초과면 1 초과, 잠김 밖이나 q_krw 0 이면 null 이다.
- 적재 RPC 는 `jsonb_populate_record` + `.*` 위치 대응이라 새 열이 표와 레코드 양쪽 끝에 붙어 그대로 채워진다. 보고서 RPC 는 `to_jsonb(l)` 이라 그대로 나간다. 두 RPC 본문은 무변경이다.
- 권한: 20261006090100 의 표 단위 RLS · REVOKE · service_role GRANT 가 새 열에도 적용된다(열 단위 GRANT 없음 — 새 GRANT/POLICY 를 더하지 않는다).
- 옛 날짜 행은 NULL 이다(gh-trade 재export 뒤 files_sig 가 바뀌면 워커가 다시 적재한다).
- 되돌리기: DROP COLUMN 6개.
본문: BEGIN; `ALTER TABLE public.limitup_locks` 로 sell_krw bigint, cancel_krw bigint, risk_3s double precision, risk_10s double precision, risk_60s double precision, risk_pre double precision 를 ADD COLUMN 한다(nullable · 기본값 없음). 열마다 COMMENT ON COLUMN 을 단다. COMMIT; 뒤에 090500 과 같은 `NOTIFY pgrst, 'reload schema';` 를 둔다. 원격 반영(db push)은 하지 않는다.

**(b) pgTAP.** limitup_load.test.sql 에 블록을 하나 더한다. 새 날짜(예: 20261003)에 6키를 실은 locks payload 를 stage → commit 한 뒤 6열 값이 그대로 들어갔는지 is() 로 본다(정수 · 소수 · 1 초과 값 1.92 · null 하나). 기존 시나리오 A 의 키 없는 lock 행은 sell_krw · risk_pre IS NULL 이어야 한다. col_type_is 로 6열 타입(bigint ×2 · double precision ×4)도 본다. plan(N) 은 실제 단언 수로 고친다.
limitup_report.test.sql 은 20261002 locks 중 하나(lock_id 2 행)의 payload 에 6키를 더한다. 보고서 JSON `day.locks` 의 그 원소에 sell_krw · risk_pre 가 값으로, 다른 원소에는 키가 JSON null 로 실리는지 단언한다. plan 수를 고친다. 두 파일을 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` 와 `… limitup_report.test.sql` 로 돌려 전부 ok 를 확인한다(로컬 일회용 컨테이너 · 원격 접촉 0).

**(c) shared 타입.** limitup-report.ts `LimitupLockRow` 에 `sell_krw?: number | null; cancel_krw?: number | null; risk_3s?: number | null; risk_10s?: number | null; risk_60s?: number | null; risk_pre?: number | null;` 를 더한다. optional 인 이유는 마이그레이션 전 응답과 옛 픽스처에 키가 없기 때문이다. 필드마다 JSDoc 에 뜻 · 단위(원 / 소수 — 100% 초과면 1 초과) · 「gh-trade ea8d9171 · 옛 날짜 null」 을 단다. 인터페이스 주석 「22열」 은 「28열(ea8d9171 +6)」 으로 고친다. `LimitupGridCol` 정의 바로 위에 한 줄 주석을 둔다: 격자 cols lock_sell_krw · lock_cancel_krw(ea8d9171)는 지금 쓰지 않는다 — 보고서는 스케치 012-A(locks 행 요약 칩)만 쓴다(quick-261006-ide). 서버(server/src/services/limitup-report.ts)는 RPC JSON 을 그대로 돌려주므로 바꾸지 않는다. 이를 확인해 SUMMARY 에 적는다.

**(d) 뷰 모델(webapp/src/lib/limitup-lanes.ts).** 서식 도우미 근처에 export 함수 `lockRiskRowsOf(locks: readonly LimitupLockRow[]): LockRiskRow[]` 와 타입 `LockRiskRow = { lockId: number; prefix: string | null; sell: string; cancel: string; risks: { label: string; value: string }[] }` 를 둔다.
- 입력은 그 종목의 locks 다. lock_id 오름차순으로 돈다.
- 6값이 모두 null/undefined 인 잠김은 건너뛴다.
- prefix 는 입력 locks 가 2개 이상일 때 `잠김 ${lock_id}`, 아니면 null 이다.
- sell/cancel 은 null 이면 「—」, 아니면 fmtKrwShort 다.
- risks 라벨은 「+3초」 「+10초」 「+60초」 와, broke === true 면 「깨짐 3초 전」, 아니면 「끝 3초 전」 이다. 값은 null 이면 「—」, 아니면 `${Math.round(r * 100)}%` 다.
JSDoc 에 스케치 012-A 채택(2026-10-06) · 판정 기준이 아닌 비율 수치 · 출처 gh-trade locks 새 키를 적는다. limitup-lanes.test.ts 에 behavior 의 경우들을 먼저(RED) 넣는다.

**(e) 사건 카드(limitup-event-card.tsx).** `const lockRisk = useMemo(() => lockRiskRowsOf(locks), [locks])`. 「잠김 구간」 블록(lockWin !== null 분기)에서 LANE_HEAD 다음 · LimitupLane/LaneSlot 앞에 `lockRisk.length > 0` 일 때 칩 영역 `data-slot="limitup-lock-risk"` 를 둔다. 격자 로딩/에러와 무관하게 보인다 — 보고서 응답 값이라서다.
- 잠김마다 한 줄 `data-slot="limitup-lock-risk-row"` · `data-lock-id` 를 둔다. prefix 가 있으면 줄 머리 글자(CAPTION 톤)로 쓴다.
- 칩 3개(`data-slot="limitup-lock-risk-chip"` · `data-kind="sell|cancel|risk"`)는 스케치 riskChips 모양을 따른다. 라벨은 작은 --muted-fg, 값은 mono font-semibold다. 누적 매도 · 취소 값은 `text-[var(--down)]`, 위험도 값은 `text-[var(--fg)]`(색 없음 — 신호등 색 금지), 구분 「·」 은 --faint 다. 배경은 요약 상자와 같은 `bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]` 에 rounded-full 이다. 새 토큰을 만들지 않는다.
- 위험도 칩의 각 시점 조각(「+3초 4%」)은 whitespace-nowrap 단위로 묶고, 칩 자체는 조각 사이에서 줄바꿈될 수 있게 flex-wrap 으로 한다. 줄 전체도 flex-wrap gap 이다. 390 에서 가로 넘침이 없어야 한다.
- 레인(또는 LaneSlot) 뒤에 `lockRisk.length > 0` 일 때만 캡션 `<p data-slot="limitup-lock-risk-caption" className={CAPTION}>` 「위험도 = 그 시점까지 누적 매도 ÷ 그 시점 대기 금액 · 100% 를 넘을 수 있다」 를 1회 둔다.
- 컴포넌트 머리 JSDoc 세로 순서에 「잠김 구간 → (값이 있으면) 요약 칩 줄 · 캡션 — 스케치 012-A · quick-261006-ide」 를 더한다.
limitup-event-card.test.tsx 에 단위 테스트를 더한다(lockRow 픽스처에 값 주입 — src/test-fixtures 는 Partial 이라 기본값 수정 불필요): 칩 텍스트 · 「잠김 1/2」 prefix · 전부 null → 칩/캡션 0 · broke 별 라벨 · 192%.

**(f) e2e(limitup-report.spec.ts, 3100).** 실 export 픽스처 파일(webapp/e2e/fixtures/limitup-report.ts · src/test-fixtures/limitup-export · workers 픽스처)은 고치지 않는다. 대신 다음을 한다.
- P28-R1 에 「실 export 10/02 에는 새 키가 없다 → 펼친 덕우전자 카드에 `[data-slot="limitup-lock-risk"]` 0개」 단언을 더한다.
- `installLimitupMocks(page, opts?)` 에 spec 안 선택 인자(예: `lockRisk`)를 더한다. 이 인자는 응답 body 의 day.locks 중 덕우전자 · 엑시온그룹 잠김 행 전부에 6값을 덧입힌다. 값은 스케치 예시값이다: 덕우 9.8e8 · 9.2e8 · 0.04 · 0.40 · null · 0.25 / 엑시온 2.3e8 · 1.1e8 · null · 0.01 · 0.06 · 1.92. 주석에 「합성값 — 칩 모양 회귀용, 실 export 아님」 을 단다.
- 새 테스트 P28-R1c(1280 · 390)를 만든다. 덕우 칩 「누적 매도 9.8억」 · 「취소 9.2억」 · 위험도에 「깨짐 3초 전 25%」 와 「+60초 —」 가 있어야 한다. 엑시온 행을 펼치면 「끝 3초 전 192%」 가 보여야 한다. 엑시온 잠김이 2개 이상이면 「잠김 N」 머리도 단언한다 — 픽스처 exportLocks() 를 읽고 기대값을 정한다. 캡션은 1회다. 390 에서 카드 scrollWidth ≤ clientWidth 이고 칩마다 오른쪽 끝이 카드 안이어야 한다.
- shots/ 에 `limitup-lock-risk-1280.png` · `limitup-lock-risk-390.png` 를 남기고 Read 로 본다.

**(g) 커밋 2.** `git status -sb` 확인 뒤 위 files 를 경로 지정 stage 한다. 메시지 예: `feat(quick-261006-ide): 상한가 보고서 잠김 구간 요약 칩(누적 매도·취소·위험도 4시점) + limitup_locks 6열 — 스케치 012-A`. db push 는 하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && test -f supabase/migrations/20261006120000_limitup_locks_lock_risk.sql && grep -q "risk_pre" supabase/migrations/20261006120000_limitup_locks_lock_risk.sql && grep -q "lockRiskRowsOf" webapp/src/components/analytics/limitup-event-card.tsx && grep -q "limitup-lock-risk-caption" webapp/src/components/analytics/limitup-event-card.tsx && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_report.test.sql && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/limitup-report.spec.ts</automated>
  </verify>
  <done>마이그레이션 1개가 limitup_locks 에 6열을 더한다(RPC · 권한 무변경). 두 pgTAP 파일이 전부 ok 다(TAP 출력에 not ok 0). 사건 카드 「잠김 구간」 에 잠김별 칩 줄과 캡션이 스케치 012-A 대로 나온다. 옛 데이터(6값 null)에는 칩이 없다. 1280/390 e2e(P28-R1 · R1b · R1c)와 webapp 단위가 통과하고 스크린샷에 결함이 없다. 커밋 1개(Co-Authored-By 없음 · push · db push 없음).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: limitup-sync 가 export schema_version 1 · 2 를 수용 + 인박스 노트 닫기</name>
  <files>workers/limitup-sync/src/manifest.ts, workers/limitup-sync/src/index.ts, workers/limitup-sync/tests/manifest.test.ts, workers/limitup-sync/tests/dispatch.test.ts, docs/inbox/from-gh-trade/261006-limitup-lock-risk.md</files>
  <read_first>workers/limitup-sync/src/manifest.ts, workers/limitup-sync/src/index.ts 1~30행 · 85~95행 · 175~265행, workers/limitup-sync/tests/dispatch.test.ts 100~220행, docs/inbox/from-gh-trade/README.md</read_first>
  <behavior>
    - manifest schema_version 2 인 날짜 → skip 없이 stage + limitup_commit_day 1회, p_schema_version = 2
    - schema_version 1 → 지금과 같이 적재
    - schema_version 3 → 파일을 읽지 않고 limitup_record_skip { p_reason: "schema" } 1회 · warn detail 에 schema_version 3 과 known [1, 2] · stage/commit 0
  </behavior>
  <action>
**(a) 판 수용(IDE-SCHEMA2).** manifest.ts 의 단일 상수를 `export const KNOWN_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1, 2]);` 로 바꾼다. JSDoc 에 「1 = Phase 28 원판, 2 = gh-trade ea8d9171 열 추가 판 올림(locks sell_krw · cancel_krw · risk_*, grid lock_sell_krw · lock_cancel_krw) — 워커는 판에 따라 다르게 읽지 않는다(payload 원문 · 격자 파일 그대로)」 를 적는다. index.ts 는 import · re-export 를 새 이름으로 바꾸고, 게이트는 `if (!KNOWN_SCHEMA_VERSIONS.has(m.schema_version))` 로 한다. skip detail 의 known 은 `[...KNOWN_SCHEMA_VERSIONS]` 로 한다. 머리 JSDoc 21행 설명도 「모르는 판(1 · 2 밖)」 으로 맞춘다. 다른 곳에서 옛 상수 이름을 쓰는지 `grep -rn "KNOWN_SCHEMA_VERSION\b" workers scripts server webapp packages relay` 로 확인하고 모두 옮긴다. 워커 src 에 판 값으로 갈라지는 다른 코드가 없음(load.ts 는 p_schema_version 전달만, derive.ts GridJson.schema_version 은 타입만)도 확인해 SUMMARY 에 적는다.
테스트(RED 먼저): dispatch.test.ts 의 「모르는 판」 예 2 를 3 으로 바꾼다(160 · 213행 근처 2곳 · 기대 detail 포함). 「schema_version 2 → 정상 적재(stage · commit 1회 · p_schema_version 2 · skipped.schema 빈 배열)」 케이스를 하나 추가한다. manifest.test.ts 의 KNOWN_SCHEMA_VERSION 참조는 `KNOWN_SCHEMA_VERSIONS.has(...)` 로 바꾼다.
다음도 확인해 SUMMARY 「gh-trade 회신 재료」 에 적는다: relay · shared · webapp 어디에도 85 featureSchema 나 격자 schema_version 으로 분기하는 코드가 없다. `grep -rn "featureSchema\|schema_version" relay/src packages/shared/src webapp/src server/src` 결과에서 비교 연산이 없어야 한다. 그러면 gh-trade 의 kLimitFeatureSchema · 사전 판 올림이 안전하다.

**(b) 커밋 3.** `git status -sb` 확인 뒤 workers/limitup-sync 의 4개 경로만 stage 한다. 메시지 예: `feat(quick-261006-ide): limitup-sync export schema_version 1·2 수용 — gh-trade 판 올림 준비`.

**(c) 인박스 닫기(IDE-INBOX).** docs/inbox/from-gh-trade/261006-limitup-lock-risk.md 의 frontmatter 를 바꾼다. `status: open` → `status: done`, `done_commit:` → 커밋 3 의 8자리 해시에 주석 `# T1 <해시> · T2 <해시> · T3 <해시> (quick-261006-ide)` 를 붙인다(README 형식 — 다른 done 노트처럼 한 해시 + 주석). 본문은 바꾸지 않는다. `git status -sb` 확인 뒤 **이 파일 경로 하나만** stage 해 커밋한다. 메시지 예: `docs(inbox): 261006-limitup-lock-risk done — 카드 누적 행·보고서 잠김 요약 칩·schema_version 2 수용(<T3 해시>)`.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && grep -q "KNOWN_SCHEMA_VERSIONS.has" workers/limitup-sync/src/index.ts && grep -q "new Set(\[1, 2\])" workers/limitup-sync/src/manifest.ts && pnpm --filter @gh-radar/limitup-sync run typecheck && pnpm --filter @gh-radar/limitup-sync run test && grep -q "^status: done" docs/inbox/from-gh-trade/261006-limitup-lock-risk.md && grep -Eq "^done_commit: [0-9a-f]{8}" docs/inbox/from-gh-trade/261006-limitup-lock-risk.md && SUBJ="$(git log -1 --format=%s)" && [[ "$SUBJ" == "docs(inbox): 261006-limitup-lock-risk done"* ]]</automated>
  </verify>
  <done>워커가 판 1 · 2 를 적재하고 그 밖은 skip "schema" 한다(typecheck · vitest 통과). 판으로 분기하는 다른 소비처가 없다는 확인이 SUMMARY 에 있다. 인박스 노트가 done + done_commit 으로 경로 지정 커밋되어 있다. 커밋 2개(워커 · 인박스), Co-Authored-By 없음, push 없음.</done>
</task>

</tasks>

<deploy_main_session>
## 배포 — 메인 세션 몫 (executor 는 실행 금지 · SUMMARY 에 이 목록을 그대로 옮긴다)

순서는 「DB → 워커 → relay → (server) → push」 이고, push 가 곧 webapp 프로덕션 배포다.

1. **DB 마이그레이션** — `supabase db push --linked --yes`(허용 규칙 접두사 그대로 · 파이프 · `yes |` 금지). 20261006120000 1개.
   **오늘 밤 limitup-sync 적재(21:20 KST) 전에 반영해야 한다.** gh-trade 가 20:30 배치 전에 119 tickana 를 교체하고 9/29~10/2 를 --force 재export 한다. 마이그레이션 전에 워커가 새 키 실린 날짜를 적재하면 jsonb_populate_record 가 새 키를 버린다. 그러고 나면 files_sig 가 같아 다시 적재되지 않는다(그때는 해당 날짜 limitup_loads.files_sig 를 비워 재적재를 유도해야 한다).
2. **limitup-sync 워커** — `scripts/deploy-limitup-sync.sh`(GCP_PROJECT_ID · SUPABASE_URL 필요 — 메모리 「워커 배포 스크립트 env」). gh-trade 가 schema_version 2 로 올리기 **전에** 반영한다.
3. **relay** — **20:00 KST 이후에만**(장 08:00~20:00) `scripts/deploy-relay.sh`. 새 필드를 실제로 보려면 gh-trade 서버(85 새 필드)도 20:00 이후 재기동되어야 한다. 그 전에는 새 relay 가 0 을 싣는다(잠김 중 「매도 0」 · 깨짐 「—」 — gh-trade 문서의 구 서버 동작).
4. **server** — 변경 없음(보고서 RPC JSON 을 그대로 통과) → 배포 불필요.
5. **push** — relay 배포가 끝난 뒤에만 한다. 구 relay JSON 에는 lockSellKrw/lockCancelKrw 가 없어 새 webapp 카드가 깨진 숫자를 그린다.
6. **gh-trade 회신** — 워커 배포 뒤 「schema_version 2 판 올림 진행 가능(워커 KNOWN_SCHEMA_VERSIONS {1,2}) · Supabase limitup_locks 6열 추가 · 격자 표 열은 추가 안 함(스케치 012-A 는 locks 만) · 85 featureSchema 분기 없음」 을 알린다.
</deploy_main_session>

<verification>
- 생성물: `head -8 relay/src/generated/StockDMA.fbs` 에서 server-repo-commit ea8d9171 · flatc 25.12.19 를 확인한다. `git diff HEAD~4 -- relay/src/generated` 는 85 말미 두 필드 관련 줄뿐이어야 한다.
- 전체 회귀(프로젝트 config build/test 명령): `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` 와 `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test`, 그리고 `pnpm --filter @gh-radar/limitup-sync run test` 를 돈다.
- e2e(3100): trading-workbench `-g "P28-"` · order-log `-g "P28-O1"` · limitup-report 전체.
- pgTAP: limitup_load · limitup_report 둘 다 not ok 0.
- 커밋 4개(T1 · T2 · T3 · 인박스)가 모두 한글 메시지이고 Co-Authored-By 가 없다: `MSGS="$(git log -4 --format=%B)" && ! grep -q "Co-Authored-By" <<<"$MSGS"`. 원격에 push 되지 않았다: `git status -sb` 에 ahead 4.
- gh-trade 작업 트리는 실행 전과 같다.
</verification>

<success_criteria>
- 실시간 카드 「상한가」 탭이 WinForms gp8 · f1j 와 같은 3줄(누적/10초/창구) · 같은 문구 · 같은 색 규칙이다. 상태는 툴팁 첫 줄이고, 잠김 경과는 누적 행 머리(--up 보통 굵기)다. 카드 높이는 불변이다.
- relay 가 85 lock_sell_krw · lock_cancel_krw 를 원 단위 number 로 중계한다(구 서버 0).
- 보고서 펼친 상세 「잠김 구간」 에 스케치 012-A 칩 줄(잠김별) + 캡션 1회가 나온다. 옛 데이터에는 칩이 없다. 390 에서 넘침이 없다.
- limitup_locks 6열 마이그레이션 파일이 있고 로컬 pgTAP 로 적재 · 보고서 경로가 검증됐다(원격 미반영).
- limitup-sync 가 schema_version 1 · 2 를 적재한다.
- 인박스 노트가 done 이다. SUMMARY 에 배포 목록 · gh-trade 회신 재료 · hand-copy 3곳 점검 결과 · 스크린샷 경로가 있다.
</success_criteria>

<output>
Create `/Users/alex/repos/gh-radar/.planning/quick/261006-ide-lock-risk-relay-85-lock-sell-cancel-repo/261006-ide-SUMMARY.md` when done — 커밋 해시 4개, 「배포 — 메인 세션 몫」 목록(위 절 그대로), gh-trade 회신 재료, relay hand-copy 3곳 점검 결과, 스크린샷 경로(shots/ 4장)와 고친 시각 결함, 못 돈 검증이 있으면 그 원인.
</output>
