# Quick Task 261019-j1w: 매집감지 매도 조기 경보 · 오늘 매수 평단 수용 — Context

**Gathered:** 2026-10-19
**Status:** 목업 채택 완료 → planning
**정본 인계 노트 2건:** `docs/inbox/from-gh-trade/261019-accum-sell-warn.md`(status: open · 미커밋 — 이 quick 이 경로 지정 커밋) ·
`docs/inbox/from-gh-trade/261019-accum-day-avg-px.md`(status: open · 커밋됨 f577d258). 둘 다 이 quick 이 `status: done` · `done_commit` 으로 닫는다.

<domain>
## Task Boundary

gh-trade quick-261019-gwm(매도 조기 경보) · quick-261019-hni(오늘 매수 평단 · 이월 갱신)가 넘긴 변경:
- 88/89 `table AccumSignal` 말미 append 3필드: `sell_warn`(bool · id 29 · vtable 62) · `sell_warns`(uint · id 30 · vtable 64) · `day_avg_px`(uint · id 31 · vtable 66). relay 는 88/89 를 읽지 않는다 — **생성물만 재생성**.
- kind 16 재해석(와이어 불변 · DB 마이그레이션 없음): `queue_case` **5** = 매도 경보 에지(켜짐·꺼짐 둘 다 즉시 1행 · 종료 행 4 가 같이 나가는 경우는 4 만) ·
  `has_remaining` = sell_warn(모든 행 종류) · `cond_metric` = min(sell_warns, 255)(사이클 누적) · `message` 끝 `|warn=<0|1>`(사람용 · 파서는 안 읽는다).
- `carry_days` 가 2 이상(최대 5)으로 올 수 있다(이월 갱신) — 「이월 D+n」 배지는 값 그대로라 변경 없음.

gh-radar 가 할 일:
1. relay 스키마 재생성 — `RELAY=/Users/alex/repos/gh-radar/relay bash server/scripts/sync-relay-schema.sh`(gh-trade 저장소 `/Users/alex/repos/gh-trade` 에서 실행 · gh-trade master HEAD 61464812 · fbs 커밋 c70b7d41 + 776320af). `--check` 실측(2026-10-19): 신규/변경 1개(`relay/src/generated/stock-dma/accum-signal.ts`) · 삭제 없음 · `.fbs` 사본 갱신. relay 코드 무변경 · 재배포 불필요(88 미사용).
2. shared `accum-signal.ts`: `AccumSignal` 에 `sellWarn: boolean`(hasRemaining) · `sellWarns: number`(condMetric) 추가 · `row` 주석에 5 추가 · 행 종류 라벨(있다면) 5 「매도 경보」. `dayAvgPx` 는 kind 16 에 없으므로 **추가하지 않는다**.
3. 작업대 「매집」 패널(`accum-strip.tsx`): 매도경보 배지(목업 **A** 채택).
4. 테스트 · 노트 2건 done · STATE.md quick 행.

**범위 밖:** 88/89 디코드 사용(웹은 relay WS 저널만 쓴다) · `/analytics/teamflow` · 알림음 · relay 재배포.

</domain>

<decisions>
## Implementation Decisions

### D-01 배지 — 목업 A (사용자 선택 · `mockup.html`)
- 자리: 「매집중」 상태 배지 **바로 옆**(이월 배지 앞) — 칩과 펼친 표 상태 열 둘 다. `sig.state === 1 && sig.sellWarn` 일 때만. 매도중(2)·청산(3)에서는 그리지 않는다(경보는 매집중 전용 · 서버 규칙).
- 모양: `BADGE` 공통 클래스 + **주황 채움** `bg-[var(--accum-sell)] text-[var(--accum-warn-fg)]` · 문구 「매도경보」 · `data-slot="accum-warn"`.
  글자색 토큰 `--accum-warn-fg` 를 globals.css 에 추가: **라이트 `#ffffff`**(#c2410c 위 ≈5.2:1) · **다크 `#111111`**(#ff9f43 위 ≈9.2:1) — planner 대비 계산으로 라이트 #111 은 3.6:1 이라 AA 미달이어서 테마별로 가른다(메인 세션 결정 2026-10-19). `tds-tokens.test.ts` 에 토큰 항목 추가.
- 새 CSS 토큰 1개(`--accum-warn-fg`)만 추가 — 아래 「새 CSS 토큰 없음」 은 이 토큰 외를 뜻한다.
- 깜빡임: 1초 주기 `steps(2)` 불투명도 깜빡임(globals.css 에 `@keyframes accum-blink` + 유틸 클래스 1개 · `motion-reduce:animate-none`). 테스트는 클래스 존재만 단언.
- 횟수: 배지 `title="이 사이클 경보 {sellWarns}회"`. 표에 열 추가 없음.
- 칩 `title`(있다면)에도 「매도경보 n회」 를 덧붙인다. 「신규」 강조·정렬·숨김 규칙 변경 없음(경보는 정렬에 영향 없음).
- 새 CSS 토큰 없음(`--accum-sell` 재사용).

### D-02 데이터
- `accumSignalOf`: `sellWarn: row.hasRemaining` · `sellWarns: row.condMetric` 추가. `row`(queueCase) 5 는 그대로 통과(읽기 규칙은 3 만 특별 취급 — `accum-list.ts` 변경 없음).
- 라이브 갱신은 기존 경로(journal.events → `accumSignalEvents` → `latestAccumByIsin`)로 충분 — 에지 행 5 가 최신 행이 되어 배지가 즉시 켜지고 꺼진다. 꺼짐을 종료 행 4 가 대신하는 경우도 최신 행의 `hasRemaining=false` 라 자연히 꺼진다.
- 테스트: shared `accum-signal.test.ts` 에 sellWarn/sellWarns 매핑 + `warn=` 키 무시 + queueCase 5 통과 · webapp `accum-strip.test.tsx` 에 배지 렌더(매집중+경보 → 칩·표 배지 · 매도중+hasRemaining=true 는 배지 없음 · 툴팁 횟수) · 기존 테스트 fixture 에 두 필드 추가.

### D-03 relay 생성물 · 노트 · 커밋
- 재생성 커밋 1건(생성물 8파일 중 바뀐 것만 · 메시지에 gh-trade 마커 커밋 `776320af`(fbs 최종) 명시 · 노트의 `fbs_sync_marker` 는 gh-trade 가 적은 값 그대로 둔다).
- 노트 2건: `status: done` · `done_commit: <코드 마지막 커밋>` — 경로 지정 add. `261019-accum-sell-warn.md` 의 질문 절이 있으면 답을 「회신」 절로.
- 커밋 메시지 한글 · `Co-Authored-By` 금지. 테스트 `--maxWorkers=2`. 배포(webapp push)는 quick 범위 밖(메인 세션 승인 뒤).

### Claude's Discretion
- 깜빡임 유틸 클래스 이름 · 배지 컴포넌트 분리(`WarnBadge`) · 테스트 파일 내 fixture 정리.

</decisions>

<specifics>
## Specific Ideas

- 배지 코드 앵커: `webapp/src/components/trading/workbench/accum-strip.tsx:264-285`(StateBadge · CarryBadge · `BADGE` 상수) · 칩 :295-335(`<CarryBadge days=…/>` :323 앞에 경보 배지) · 표 상태 열 :445-455(:453 `CarryBadge` 앞).
- shared: `packages/shared/src/accum-signal.ts:40-88`(타입 · 라벨) · :125-166(`accumSignalOf`) · `StrategyEventRow.hasRemaining`(boolean) · `condMetric`(number).
- 테스트 선례: `packages/shared/src/__tests__/accum-signal.test.ts` · `webapp/src/components/trading/__tests__/accum-strip.test.tsx` · `webapp/src/lib/__tests__/accum-list.test.ts`(fixture `sig()` 에 두 필드 추가 필요).
- 재생성 스크립트는 gh-trade 소유(`/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh`) — gh-trade 트리에서 실행 · flatc 25.12.19 고정 · 결과는 gh-radar `relay/src/generated/` 에만 쓴다. 실행 전 `git -C /Users/alex/repos/gh-trade status -sb` 로 master 깨끗한지 확인(`.planning/milestone.lock` 미추적 하나는 무시).

</specifics>

<deferred>
## Deferred Ideas

- 88/89 `dayAvgPx` 웹 표시(웹은 저널만 쓰므로 kind 16 에 평단이 실릴 때).
- 경보 알림음 · 토스트.

</deferred>
