---
phase: quick-260908-scu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
autonomous: true
requirements: [RELAY-01, RELAY-02, RELAY-03]

must_haves:
  truths:
    - "15-LIVE-VERIFICATION.md 의 2026-09-06 기록(§1~§7)이 한 글자도 바뀌지 않은 채 보존된다"
    - "§8 재집계 절이 SC-4~SC-8 · §4-A~§4-E 미증명 · §5 이관 15건 전부를 하나도 빠뜨리지 않고 재판정한다"
    - "재판정된 모든 ✅ 는 실측 명령 출력 또는 커밋 해시를 근거로 갖는다 — 근거 없는 항목은 ⚠ 로 남는다"
    - "REQUIREMENTS 의 RELAY-01/02/03 정의부 체크박스와 Traceability 행이 서로 어긋나지 않는다"
    - "ROADMAP 이 Phase 15 를 20/20 실행 완료로 표기한다"
    - "STATE 에 Phase 15 종결 기록이 다른 phase 의 Production State 형식으로 존재한다"
    - "Phase 16 을 병행 실행 중인 다른 세션의 편집(STATE Current Position · progress 프론트매터 · ROADMAP Phase 16 행)이 손상되지 않는다"
  artifacts:
    - path: ".planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md"
      provides: "§8 2026-09-08 재집계 (라이브 전환 이후) + §3 표 머리 포인터"
      contains: "## 8. 2026-09-08 재집계"
    - path: ".planning/REQUIREMENTS.md"
      provides: "RELAY-01/02/03 재판정 — 정의부 체크박스 + Traceability + Last updated"
    - path: ".planning/ROADMAP.md"
      provides: "Phase 15 20/20 실행 완료 정합"
    - path: ".planning/STATE.md"
      provides: "Phase 15 Production State 종결 기록"
  key_links:
    - from: ".planning/REQUIREMENTS.md 정의부 `- [x] **RELAY-0N**`"
      to: ".planning/REQUIREMENTS.md Traceability `| RELAY-0N | Phase 15 | Complete`"
      via: "체크박스 ⇔ 상태 대칭"
      pattern: "RELAY-0[123]"
    - from: ".planning/phases/15-.../15-LIVE-VERIFICATION.md §3 SC 표"
      to: "동 문서 §8 재집계"
      via: "표 머리 포인터 1줄"
      pattern: "§8"
---

<objective>
Phase 15 는 plan 20개 전부 실행 완료인데 장부가 실제와 어긋나 있다. 2026-09-06 종결(A안 `skip-live`) 이후
**실제로 라이브 전환이 일어났고**(D-17 철회 · DMA_HOST 실 게이트웨이 · VPN 상시 유지 · 실사용 UI 결함 수정),
그 사실이 어느 문서에도 재판정으로 반영돼 있지 않다.

Purpose: 장부(SC 집계 · 요구사항 상태 · ROADMAP · STATE)를 실제 상태와 일치시킨다.
Output: `15-LIVE-VERIFICATION.md` §8 재집계 + `REQUIREMENTS.md` RELAY-01/02/03 재판정 + `ROADMAP.md` 정합 + `STATE.md` 종결 기록.

**이 plan 은 코드를 한 줄도 바꾸지 않는다. 배포하지 않는다. 새 주문을 내지 않는다.** 읽기 전용 확인만 한다.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/STATE.md

<hard_constraints>
## 1. 동시 편집 — 다른 세션이 같은 master 에서 Phase 16 을 실행 중이다

실측 확인됨: `fc8bab2 feat(16-01): dma_orders.origin 컬럼 추가 + 프로덕션 적용` 이 이미 들어와 있다.
그 세션은 `ROADMAP.md`(Phase 16 체크박스)와 `STATE.md`(Current Position · progress 프론트매터)를 갱신한다.

- **파일 전체 재작성 금지.** Edit 툴의 유일 문자열 치환만 쓴다. `Write` 로 기존 4개 문서를 덮어쓰지 않는다.
- **각 Edit 직전에 대상 구간을 다시 읽는다.** 이 PLAN 이 인용한 행 번호는 이미 밀렸을 수 있다. 행 번호를 신뢰하지 말고 문자열로 찾는다.
- **건드리지 않는 것:** ROADMAP 의 Phase 16 관련 행 전부 · ROADMAP `### Phase 16:` 절 전체 · STATE 의 `## Current Position` 블록(`Phase:` ~ `Progress:` 줄) · STATE 프론트매터(`progress:` · `status:` · `stopped_at:` · `last_updated:` · `last_activity:`) · STATE `## Session Continuity` 절.
- **task 마다 즉시 커밋해 창을 좁힌다.** `git add` 는 파일 단위 명시. `git add -A` / `git add .` 금지.
- **커밋 직전 `git status --porcelain` 으로 다른 세션의 미커밋 변경이 섞이지 않았는지 확인한다.** 내 대상 파일 외의 항목이 보이면 그 파일은 add 하지 않는다.

## 2. 실계좌 라이브 — 쓰기 동작 전면 금지

relay 는 현재 실 DMA 게이트웨이(`10.41.1.120:9100`)에 붙어 있고 **주문 경로가 실계좌에 닿는다**
(`infra/relay/README.md` §실서버 라이브 상태).

- `POST /api/orders` 호출 금지 · relay `OrderApi` 호출 금지 · DMA 로그인 호출 금지.
- 허용되는 것은 읽기뿐: `curl /healthz` · Supabase REST `GET`(count) · `git log` · `git show` · 파일 읽기 · `scripts/smoke-relay.sh --check-isin`.
- Supabase 는 **읽기만**. `PATCH`/`POST`/`DELETE` 금지.

## 3. 문서 기록 규율

- KB VPN 계정 ID 리터럴을 새로 쓰지 않는다. 직전 quick(260908-py9)이 저장소 전량을 맨 토큰 `KB_VPN_ACCOUNT` 로 마스킹했다 — **그 게이트를 깨지 않는다.**
- DMA `user_id` 값 · 전체 계좌번호를 새로 쓰지 않는다.
- 커밋 메시지는 한글. `Co-Authored-By` 를 절대 넣지 않는다.
- worktree 격리 없이 main tree(`master`)에서 직접 작업한다.
</hard_constraints>

<interfaces>
<!-- 재판정의 핵심 추론이 여기 걸려 있다. 코드를 뒤지지 말고 이 사실을 그대로 쓴다. -->

`/healthz` 페이로드의 의미 (`relay/src/order/order-api.ts` · `relay/src/dma/session-manager.ts` 실측):

- `sessionCount` = `SessionManager` 가 들고 있는 **사용자별 DMA 세션 수** (`session-manager.ts:207` → `this.#sessions.size`).
- `dma` = `order-api.ts:324` 의 `sessionsOk = stats.sessionCount === 0 || stats.readyCount > 0`.

따라서 **`sessionCount: 1` 과 `dma: true` 가 동시에 참이면 `readyCount > 0` 이 강제된다** — 즉
세션 하나가 `Ready` 상태에 도달해 있다. 상태기계는 `Idle → Connecting → LoggingIn → DeclaringAccounts → Ready`
(ROADMAP SC-3)이므로 **Ready 도달은 로그인 성공 + 계좌 선언 완료를 함의한다.**

세션은 wss 첫 메시지 인증 + `dma_credentials` allowlist 통과 후에만 생성된다(SC-4). 따라서
`sessionCount ≥ 1` 은 **allowlist positive 경로가 실제로 열렸다**는 증거이기도 하다.

`dma: true` 단독은 증거가 아니다 — `sessionCount === 0` 일 때도 `true` 다. **두 값을 반드시 함께 읽는다.**
</interfaces>

<evidence_map>
<!-- §8 재판정에 쓸 근거. 커밋은 전부 실재 확인됨(2026-09-08). -->

| 근거 | 무엇을 증명하는가 |
|------|-------------------|
| `f13eb7d` docs(15): D-17 철회 — DMA user_id 를 WinForms 와 동일하게 (2026-09-06) | 15-20 이 "미확인"으로 남긴 **선행조건 3**(users.toml 전용 user_id)이 설계째 철회됐다 → 그 미증명 항목은 해소가 아니라 **조건 소멸** |
| `1ef7cc7` VPN 상시 유지 — 부팅 자동기동 + failed 회수 워치독 (2026-09-06) | §2 의 `inactive`+`disabled` 실측이 무효화됐다 |
| `f9ca062` VPN·웹관문 상시 유지 — 재접속 상한 철회 + startup 재실행 안전 (2026-09-06) | 상시 유지가 정책으로 확정 |
| `a2c5238` healthz 의 vpn 을 회선 실측으로 — "접속자 0명일 때 장애가 안 보이던 구멍" (2026-09-06) | 실운영에서 발견된 결함 = 운영이 실제로 돌고 있다 |
| `531930e` 계좌 상태 0수량 삭제 계약 반영 — 중계 캐시·브라우저 병합 동시 수정 (2026-09-06) | **실 게이트웨이 동작을 보고서야 알 수 있는 계약.** 계좌 상태 스냅샷/델타가 실데이터로 흘렀다는 증거 |
| `fd7942b` 잔고·미체결 종목명 표시 + 전 종목 취소 — relay ISIN 역매핑 (2026-09-06) | 잔고·미체결이 **화면에** 떠 있고 실데이터가 렌더된다 |
| `da24eec` 호가주문창 체결·호가·주문 순 재배치 + 호가 행 전체 클릭 (2026-09-06) | 실사용 중 발견된 UI 결함 |
| `12bd478` 호가창 모바일 잘림 수정 + 체결 구분열 제거 (2026-09-07) | 프로덕션 브라우저에서 호가주문 탭이 **사용자에 의해 관측**되고 있다 |
| `dd2a8cc` docs(ops): relay-down 알림 매뉴얼 갱신 + 임계값 1.0 → 0.9 (2026-09-06) | 이관 8 튜닝됨 |
| `8816557` fix(workers): master-sync 3개월 무증상 정지 복구 — basDd 역탐색 + sweep 페이징 (2026-09-06) | 이관 4 근본 수정 → ISIN 42종목 결손의 원인 제거 |
| `ace2f7d` docs(15-20): phase 15 종결 plan SUMMARY (2026-09-06) | 15-20 SUMMARY 실재 — ROADMAP 체크박스가 틀렸다 |
| `infra/relay/README.md` §현재 운영 상태 (2026-09-08 실측, quick-260908-py9) | `DMA_HOST` = 실 게이트웨이 · `openconnect@kb` = `active`+`enabled` · `kbvpn-*` 타이머 2개 · 세션 인증 만료 예정 2026-09-20 |
| `infra/relay/README.md` §실서버 라이브 상태 (D-27 해제됨) | 라이브 전환 경위 + 실계좌 경고 정본 |
| quick-260908-py9 SUMMARY | 이관 12(VPN 14일 만료) · 14(계정 ID 잔존) · §4-E 종결 |
| quick-260908-qnf SUMMARY | 이관 5 · 6 · 7 · 9 · 10 · 11 종결. 선재 E2E 11건 → **0**, `stock-detail-tabs` 포함 4개 스펙 29건 green |
| 2026-09-08 사용자 재확인 | 이관 3(`DMA_CRED_KEY` 회전) — **회전하지 않음. 수용된 리스크로 종결.** 자격증명 등록 후이므로 "등록 직전 재검토" 조건은 소멸 |
</evidence_map>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 읽기 전용 실측 수집 + 15-LIVE-VERIFICATION.md §8 재집계 append</name>

  <files>.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md</files>

  <action>
**Step 1 — 읽기 전용 실측을 먼저 수집한다. 측정하기 전에 결론을 쓰지 않는다.**

세 가지를 순서대로 읽는다. 전부 읽기 전용이며 주문 경로를 건드리지 않는다.

(a) relay 라이브 상태:
`curl -s --max-time 10 https://dma.jx1.io/healthz` 를 실행해 `status` · `vpn` · `dma` · `version` · `sessionCount` 를 그대로 기록한다.
`<interfaces>` 의 `sessionCount`/`dma` 해석 규칙을 적용해 **Ready 도달 여부**를 판정한다.
`sessionCount` 가 0 이면 `dma:true` 는 아무것도 증명하지 않는다 — 그 경우 관련 항목을 ⚠ 로 남기고 그 사실을 명시한다.

(b) `dma_credentials` · `dma_orders` 행 수 (Supabase REST, `count=exact`, 본문 폐기):
자격증명 해석은 `scripts/smoke-relay.sh` 와 같은 정본(`workers/master-sync/.env`)을 쓴다. 예:

    U=$(sed -n 's/^SUPABASE_URL=//p' workers/master-sync/.env | tr -d '"' | head -1)
    K=$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' workers/master-sync/.env | tr -d '"' | head -1)
    for t in "dma_credentials?select=user_id" "dma_orders?select=id"; do
      printf '%s -> ' "${t%%\?*}"
      curl -fsS -G -o /dev/null -D - "$U/rest/v1/$t" \
        -H "apikey: $K" -H "Authorization: Bearer $K" \
        -H "Prefer: count=exact" -H "Range: 0-0" | tr -d '\r' | sed -n 's#^[Cc]ontent-[Rr]ange: .*/##p'
    done

`dma_orders` 가 0 이 아니면 status 분포도 읽는다(상태 문자열만, PII 없음):
`curl -fsS -G "$U/rest/v1/dma_orders?select=status" -H "apikey: $K" -H "Authorization: Bearer $K"`
**절대 `POST`/`PATCH`/`DELETE` 를 보내지 않는다. 새 주문을 내지 않는다.**
`$K` 값을 출력하거나 문서에 쓰지 않는다.

(c) ISIN 결손 재확인 (이관 4 / §4-C 마지막 행):
`bash scripts/smoke-relay.sh --check-isin` 를 실행해 ISIN-1/2/3a/3b 결과와 **활성 주식 총수 / isin NULL 종목 수**를 그대로 기록한다.
이 서브커맨드는 Supabase 읽기 프로브만 수행한다.

**Step 2 — 재판정 원칙.**

- **근거 없이 초록으로 만들지 않는다.** 각 항목마다 "무슨 실측이 이것을 증명하는가"를 한 줄로 적는다. 근거를 못 대면 ⚠ 로 남긴다.
- 세 가지 결말을 구분한다: **증명됨**(실측·커밋 근거 있음) / **여전히 미증명**(근거 없음 — 해소 조건을 다시 적는다) / **조건 소멸**(설계가 철회돼 항목 자체가 사라짐 — 예: D-17).
- 실측이 이 PLAN 의 `<evidence_map>` 기대와 어긋나면 **실측이 이긴다.** 어긋난 사실을 §8 에 명시한다.

**Step 3 — 문서 편집. `15-LIVE-VERIFICATION.md` 를 덮어쓰지 않는다.**

그 문서는 2026-09-06 시점의 정직한 기록이고, 15-20 이 "미접속을 실측으로 남긴" 가치가 있다.
§1~§7 을 한 글자도 고치지 않는다. 두 곳만 손댄다.

(A) **§3 표 머리 포인터 1줄.** `## 3. SC-1 ~ SC-8 집계` 아래 "판정 규칙 3가지" 블록과 SC 표 사이에
인용 1줄을 삽입한다 — 문구에 `§8` 을 포함하고, "이 표는 2026-09-06 시점 판정이며 라이브 전환 이후
재판정은 §8 이 정본"이라는 뜻이 담기게 한다. **표의 기존 행은 건드리지 않는다.**

(B) **문서 끝에 §8 을 append.** 아래 5개 소절을 모두 포함한다.

    ## 8. 2026-09-08 재집계 — 라이브 전환 이후

    ### 8.1 재집계 근거 (전부 읽기 전용 실측)
    표 컬럼: 근거 | 실측값 또는 커밋 | 무엇을 증명하는가
    → Step 1 의 (a)(b)(c) 실측 3종 + `<evidence_map>` 커밋들. `sessionCount`/`dma` 해석 규칙을 명시할 것.

    ### 8.2 SC-4 ~ SC-8 재판정
    표 컬럼: SC | 2026-09-06 판정 | 2026-09-08 재판정 | 근거 | 남은 미증명
    → SC-4 · SC-5 · SC-6 · SC-7 · SC-8 **다섯 개 전부** 한 행씩. SC-1~3 은 이미 ✅ 이므로 재판정 대상이 아니다(그 사실을 한 줄로 적는다).
    → 재판정은 실측에서 도출한다. 부분적으로만 증명되면 ⚠ 를 유지하고 남은 것을 적는다.

    ### 8.3 §4-A ~ §4-E 미증명 항목 재분류
    표 컬럼: 출처 | 미증명 항목 | 재판정 | 근거 또는 남은 해소 조건
    → §4-A 3항 · §4-B 3항 · §4-C 6항 · §4-D 4항 · §4-E 1항을 **하나도 빠뜨리지 않고** 훑는다.
    → 판단 지침(실측과 충돌하면 실측 우선):
      · §4-A allowlist positive → `sessionCount ≥ 1` + `dma:true` 면 증명됨. `dma_credentials` 행 수로 교차 확인.
      · §4-A 실브로커 호가/체결 → `DMA_HOST` 실 게이트웨이 + `531930e`(0수량 삭제 계약) + `fd7942b`.
      · §4-A 5분 유예 실관측 → 관측 기록이 없으면 **여전히 ⚠**. 5분 대기 관측을 이 quick 에서 새로 하지 않는다.
      · §4-B `LoginResp.accounts` 채워짐 / 계좌 선언 Ready 도달 → Ready 도달 추론 + `531930e`.
      · §4-B users.toml 전용 user_id (D-17) → `f13eb7d` 로 **조건 소멸**. 증명됨이라고 쓰지 말고 철회 사실로 닫는다.
      · §4-B 잔고·미체결 화면 표시 → `fd7942b`.
      · §4-C 도달성(INV-9) · 브라우저 주문 왕복 · `dma_orders` status 전이 · `GET /api/orders` 복원 → **네 항목 모두 `dma_orders` 행 수 실측에 달렸다.** 행이 있으면 status 분포를 근거로 전이를 판정하고, **0행이면 네 항목 전부 ⚠ 유지** + 해소 조건을 다시 적는다. 판정하려고 새 주문을 내지 않는다.
      · §4-C 실브로커 응답 코드·타이밍 vs mock(median 3.33ms 는 loopback) → 실계통 지연 측정 기록이 없으면 ⚠ 유지.
      · §4-C ISIN 42종목 결손 → `8816557` + Step 1(c) 수치로 닫는다. NULL 0 이면 해소, 잔존하면 **그 수치를 적고 ⚠ 유지**.
      · §4-D Playwright → quick-260908-qnf 가 `stock-detail-tabs` 포함 4개 스펙 29건 green 을 실행했다. `orderbook` 7건 재실행 기록은 없으므로 **부분 해소**로 적는다.
      · §4-D 프로덕션 브라우저 직접 관찰 → `da24eec` · `12bd478` 이 실사용 발견 결함 수정이다. **사용자 관측**으로 닫되 "Claude 가 관측한 것은 아니다"를 명시한다.
      · §4-D 배포 번들 wss URL 인라인 → 라이브 wss 세션이 실제로 열렸다는 사실(`sessionCount`)로 판정한다.
      · §4-D 선재 E2E 11건 → quick-260908-qnf 가 0 으로 청산. 해소.
      · §4-E 비밀 미기록 → quick-260908-py9 가 닫았고 §4-E 하단에 이미 기록돼 있다. 재확인만 하고 중복 서술하지 않는다.

    ### 8.4 §5 이관 15건 상태 재집계
    표 컬럼: # | 항목 요약 | 2026-09-08 상태 | 근거
    → **행 머리를 `| 1 |` 부터 `| 15 |` 까지 정확히 15행**으로 쓴다(자동 검증 게이트가 이 형태를 센다).
    → 1 = `dma_credentials` 행 수 실측으로 판정 / 2 = 사용자 실사용 관측으로 닫음 /
      **3 = 2026-09-08 사용자 재확인: `DMA_CRED_KEY` 회전하지 않음 — 수용된 리스크로 종결. 자격증명 등록 후이므로 "등록 직전 재검토" 조건은 소멸했다는 사실과 함께 닫는다. 재론하지 않는다.** /
      4 = `8816557` + ISIN 수치로 닫음 / 5·6·7·9·10·11 = quick-260908-qnf(이미 §5 에 반영됨 — 재확인만) /
      **8 = `dd2a8cc` 로 1.0 → 0.9 튜닝됨. 원 권고(0.5~0.7)와의 차이를 남기되, 오경보를 실제로 관측하기 전에는 추가 조정하지 않음으로 판단해 닫는다.** /
      12·14 = quick-260908-py9 / 13 = 정정 완료 / 15 = 이 quick 의 Task 2 가 처리.

    ### 8.5 재집계 후에도 남는 것
    → ⚠ 로 남은 항목만 불릿으로. 각 항목에 "무엇을 하면 닫히는가"를 한 줄씩. 남은 게 없으면 없다고 쓴다.

**금지:** 새 주문 · 코드 변경 · 배포 · `15-LIVE-VERIFICATION.md` §1~§7 수정 · KB VPN 계정 ID/DMA user_id/전체 계좌번호 기록 · Supabase 쓰기.

**커밋:** `git add` 로 `15-LIVE-VERIFICATION.md` **한 파일만** 명시. 커밋 직전 `git status --porcelain` 확인.
메시지 예: `docs(15): 라이브 전환 반영 재집계 — SC-4~8·미증명·이관 15건 재판정(§8)`. `Co-Authored-By` 금지.
  </action>

  <verify>
    <automated>
F=.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-LIVE-VERIFICATION.md
test "$(grep -c '^## 8\. 2026-09-08 재집계' "$F")" -eq 1 \
&& test "$(sed -n '/^## 3\./,/^## 4\./p' "$F" | grep -c '§8')" -ge 1 \
&& test "$(sed -n '/^## 8\./,$p' "$F" | grep -cE '^\| (1[0-5]|[1-9]) \|')" -eq 15 \
&& test "$(sed -n '/^## 8\./,$p' "$F" | grep -oE '§4-[A-E]' | sort -u | wc -l | tr -d ' ')" -eq 5 \
&& test "$(sed -n '/^## 8\./,$p' "$F" | grep -oE 'SC-[45678]' | sort -u | wc -l | tr -d ' ')" -eq 5 \
&& test "$(sed -n '/^## 8\./,$p' "$F" | grep -cE '8\.[1-5] ')" -ge 5 \
&& test "$(git diff HEAD~1 -- "$F" | grep -cE '^-[^-]')" -le 2 \
&& test "$(grep -rlIE 'kb[s]124' .planning tasks 2>/dev/null | wc -l | tr -d ' ')" -eq 0 \
&& test "$(git diff --name-only HEAD~1 HEAD | grep -vc '^\.planning/')" -eq 0 \
&& echo VERIFY-1-OK
    </automated>
  </verify>

  <done>
§8 이 5개 소절과 함께 존재하고, §3 표 머리에 §8 포인터가 있고, §5 이관 15행이 전부 재판정됐고,
§4-A~§4-E 와 SC-4~SC-8 이 전부 언급됐고, 기존 본문 삭제 라인이 2줄 이하(포인터 삽입에 따른 최소 변경)이며,
커밋 diff 에 `.planning/` 밖 파일이 0개다.
  </done>
</task>

<task type="auto">
  <name>Task 2: REQUIREMENTS.md RELAY-01/02/03 재판정 (정의부 + Traceability + Last updated)</name>

  <files>.planning/REQUIREMENTS.md</files>

  <action>
Task 1 의 §8 결과에 **따른다.** 결과를 다시 만들지 말고 §8 을 읽어 판정을 옮긴다.

**판정 규칙:** 해당 요구사항의 근거가 §8 에서 전부 증명됐으면 `Complete` 로 올린다.
**하나라도 근거가 부족하면 그 항목만 `Pending` 으로 두고, 무엇이 남았는지 한 줄로 명시한다.**
남은 것을 적을 때는 **`잔여:`** 로 시작하는 구절을 포함한다(자동 검증 게이트가 이 토큰을 찾는다).

각 요구사항이 어느 SC 에 걸려 있는지:
- **RELAY-01** (시세 팬아웃 · wss 첫 메시지 인증 · allowlist · 종목 구독 · 4탭 재구성 · 호가주문 탭) → SC-4 · SC-5 · SC-7
- **RELAY-02** (주문 릴레이 · `OrderResp` ≤5초 · 체결/취소 wss 푸시 · `dma_orders` 기록 · 오늘 주문 목록 복원 · ISIN 매핑 · 409) → SC-6
- **RELAY-03** (VM · 고정 IP · 방화벽 3규칙 · openconnect systemd · Caddy TLS · Dockerfile · 스크립트 3종 · 알림 정책 · VPN 선검증 기록) → SC-2 · SC-8

**두 곳을 반드시 함께 갱신한다 — 한쪽만 고치면 장부가 다시 어긋난다.**

1. **정의부** `### DMA Relay` 절의 `- [ ] **RELAY-01**:` / `- [ ] **RELAY-02**:` / `- [ ] **RELAY-03**:` 체크박스.
   Complete 로 올리는 항목만 `- [x]` 로 바꾼다. **본문 서술은 건드리지 않는다** (체크박스 문자만 치환).
2. **Traceability 표** 의 `| RELAY-01 | Phase 15 | Pending |` 3행. 체크박스와 **대칭**이어야 한다:
   `- [x]` ⇔ `| ... | Complete ... |`, `- [ ]` ⇔ `| ... | Pending — 잔여: ... |`.
   `Complete` 행에는 `THEME-03`/`THEME-04` 행처럼 괄호 안에 짧은 근거를 덧붙인다(예: 재집계 출처 + 핵심 실측).

3. **문서 하단 `*Last updated:*` 줄.** 이 줄은 Phase 16 세션도 갱신하므로 **통째로 교체하지 말고**,
   편집 직전에 다시 읽어 현재 문장 끝에 이 quick 의 갱신 사실을 덧붙인다.
   덧붙이는 문구에 `RELAY-01/02/03 재판정` 을 포함한다.

**Coverage/Unmapped 집계 줄이 있다면 요구사항 개수는 변하지 않으므로 손대지 않는다.**

편집 직전에 대상 3구간(정의부 · Traceability · Last updated)을 각각 다시 읽는다. 행 번호는 밀렸을 수 있다.

**커밋:** `git add .planning/REQUIREMENTS.md` 한 파일만. 직전 `git status --porcelain` 확인.
메시지 예: `docs(15): REQUIREMENTS RELAY-01/02/03 재판정 — 정의부·Traceability 대칭 갱신`. `Co-Authored-By` 금지.
  </action>

  <verify>
    <automated>
R=.planning/REQUIREMENTS.md
ok=1
for r in RELAY-01 RELAY-02 RELAY-03; do
  box=$(grep -c "^- \[x\] \*\*${r}\*\*" "$R")
  tra=$(grep -cE "^\| ${r} \| Phase 15 \| Complete" "$R")
  if [ "$box" -ne "$tra" ]; then echo "MISMATCH $r box=$box trace=$tra"; ok=0; fi
done
BAD=$(grep -E '^\| RELAY-0[123] \| Phase 15 \|' "$R" | grep 'Pending' | grep -v '잔여' | wc -l | tr -d ' ')
ROWS=$(grep -cE '^\| RELAY-0[123] \| Phase 15 \|' "$R")
DEFS=$(grep -cE '^- \[(x| )\] \*\*RELAY-0[123]\*\*' "$R")
LU=$(grep -c 'RELAY-01/02/03 재판정' "$R")
test "$ok" -eq 1 && test "$BAD" -eq 0 && test "$ROWS" -eq 3 && test "$DEFS" -eq 3 && test "$LU" -ge 1 \
&& test "$(git diff --name-only HEAD~1 HEAD | grep -vc '^\.planning/')" -eq 0 \
&& echo VERIFY-2-OK
    </automated>
  </verify>

  <done>
RELAY-01/02/03 각각의 정의부 체크박스와 Traceability 상태가 대칭이고, Traceability 3행 · 정의부 3항이 모두 남아 있고,
`Pending` 으로 남은 행에는 `잔여:` 사유가 붙어 있고, `*Last updated:*` 줄에 재판정 사실이 기록됐으며,
커밋 diff 에 `.planning/` 밖 파일이 0개다.
  </done>
</task>

<task type="auto">
  <name>Task 3: ROADMAP.md 정합 + STATE.md Phase 15 종결 기록</name>

  <files>.planning/ROADMAP.md, .planning/STATE.md</files>

  <action>
**A. `ROADMAP.md` — 세 곳. 전부 유일 문자열 치환. Phase 16 관련 행은 손대지 않는다.**

편집 직전에 각 구간을 다시 읽는다(다른 세션이 Phase 16 행을 갱신했을 수 있다).

1. **상단 Phases 목록의 Phase 15 행.** 현재:
   `- [ ] **Phase 15: DMA 중계 서버(relay)** - ... (in progress, 4/20 plans)`
   → `- [x]` 로 바꾸고 꼬리표를 완료 표기로 교체한다(`(completed 2026-09-06, 20/20 plans)` 형태 — 같은 목록의 Phase 13/14 행 서술 형식을 따른다).
   **바로 아래 Phase 16 행은 건드리지 않는다.**

2. **Phase 15 상세의 `**Plans:**` 줄.** 현재 `**Plans:** 19/20 plans executed` → `20/20 plans executed`.

3. **Wave 6 의 `15-20-PLAN.md` 체크박스.** `- [ ] 15-20-PLAN.md` → `- [x] 15-20-PLAN.md`.
   근거: SUMMARY 실재(`ace2f7d`, `15-20-SUMMARY.md`).

**B. `STATE.md` — Phase 15 종결 기록.**

- **새 절 `### Phase 15 Production State (2026-09-08)` 을 `### Phase 10 Production State (2026-06-09)` 절 바로 앞에 삽입한다** (최신이 위로 오는 기존 배치 관례).
  기존 `### Phase 10` / `### Phase 9` 절의 서술 형식(불릿 3~5개, 실측 수치와 리소스 이름을 담은 산문)을 따른다.
- 담을 내용(전부 Task 1 §8 에서 확정된 사실만 — 새로 측정하지 않는다):
  · plan **20/20** 실행 완료 + 종결 plan 15-20 은 2026-09-06 A안(`skip-live`)로 마감했다는 사실
  · 그 이후 라이브 전환: D-17 철회(`f13eb7d`)로 웹이 WinForms 와 동일 DMA 세션에 합류 · `DMA_HOST` 실 게이트웨이 전환 · **주문 경로가 실계좌에 닿는다**
  · VPN 상시 유지(`openconnect@kb` `active`+`enabled`, `kbvpn-watchdog`/`kbvpn-renew` 타이머 2개) · `/healthz` 실측값
  · SC 재집계 결과(✅/⚠ 개수)와 남은 ⚠ 항목 요약 + 정본 포인터 `15-LIVE-VERIFICATION.md §8`
  · RELAY-01/02/03 재판정 결과
- **금지:** DMA `user_id` 값 · 전체 계좌번호 · KB VPN 계정 ID 를 쓰지 않는다.

- **`## Quick Tasks Completed` 표 맨 끝에 이 quick 1행 추가.** 형식은 바로 위 `260908-qnf` 행과 동일:
  `| 260908-scu | Phase 15 장부 재집계 — ... | 2026-09-08 | <commit1>·<commit2>·<commit3> | [260908-scu-...](./quick/260908-scu-phase-15-sc-4-8-relay-01-03-roadmap-stat/) |`
  커밋 해시는 Task 1·2 의 실제 해시 + 이 task 의 해시를 커밋 후 `git log` 로 확인해 채운다(이 task 자신의 해시는 커밋 뒤 amend 없이, 앞 두 개만 먼저 채우고 자기 해시는 생략하거나 커밋 후 별도 반영하지 않는다 — 표 정확성보다 동시 편집 창을 좁히는 게 우선이다).

- **절대 건드리지 않는 것:** 프론트매터 전체(`progress:` · `status:` · `stopped_at:` · `last_updated:` · `last_activity:`) ·
  `## Current Position` 블록(`Phase: 16` ~ `Progress:` 줄) · `## Session Continuity` 절 ·
  `### Roadmap Evolution` 의 Phase 16 항목. 이것들은 Phase 16 세션 소유다.

**커밋:** `git add .planning/ROADMAP.md .planning/STATE.md` 두 파일만 명시.
커밋 직전 `git status --porcelain` 으로 다른 세션의 미커밋 변경이 섞이지 않았는지 확인한다.
메시지 예: `docs(15): ROADMAP·STATE 정합 — Phase 15 20/20 종결 + 라이브 전환 기록`. `Co-Authored-By` 금지.
  </action>

  <verify>
    <automated>
test "$(grep -c 'in progress, 4/20 plans' .planning/ROADMAP.md)" -eq 0 \
&& test "$(grep -c '^- \[x\] \*\*Phase 15:' .planning/ROADMAP.md)" -eq 1 \
&& test "$(grep -c '19/20 plans executed' .planning/ROADMAP.md)" -eq 0 \
&& test "$(grep -c '20/20 plans executed' .planning/ROADMAP.md)" -eq 1 \
&& test "$(grep -c '^- \[ \] 15-20-PLAN.md' .planning/ROADMAP.md)" -eq 0 \
&& test "$(grep -c '^- \[x\] 15-20-PLAN.md' .planning/ROADMAP.md)" -eq 1 \
&& test "$(grep -c '^### Phase 16:' .planning/ROADMAP.md)" -eq 1 \
&& test "$(grep -c '^### Phase 15 Production State' .planning/STATE.md)" -eq 1 \
&& test "$(grep -c '^Phase: 16 (trading-limit-chaser-vi-my-page)' .planning/STATE.md)" -eq 1 \
&& test "$(sed -n '1,15p' .planning/STATE.md | grep -c '^progress:')" -eq 1 \
&& test "$(grep -c '^| 260908-scu |' .planning/STATE.md)" -eq 1 \
&& test "$(git diff --name-only HEAD~1 HEAD | grep -vc '^\.planning/')" -eq 0 \
&& echo VERIFY-3-OK
    </automated>
  </verify>

  <done>
ROADMAP 상단 목록 Phase 15 행이 `[x]` + 완료 표기이고, `**Plans:** 20/20 plans executed` 이고,
`15-20-PLAN.md` 체크박스가 `[x]` 이고, Phase 16 절이 그대로 남아 있다.
STATE 에 `### Phase 15 Production State` 절과 `260908-scu` quick 행이 있고,
`Phase: 16 ...` Current Position 줄과 `progress:` 프론트매터가 손상되지 않았다.
커밋 diff 에 `.planning/` 밖 파일이 0개다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 이 세션 ↔ 병행 Phase 16 세션 (같은 `master` 작업 트리) | 두 세션이 `ROADMAP.md`·`STATE.md` 를 동시에 편집한다. 전체 재작성은 상대 편집을 조용히 되돌린다 |
| 이 세션 ↔ 실계좌 DMA 게이트웨이 (라이브) | `POST /api/orders` · relay `OrderApi` 는 실계좌에 주문을 낸다 |
| 이 세션 ↔ Supabase production (service role 키) | service role 키는 RLS 를 우회한다 |
| 문서 ↔ 저장소 (비밀 기록 게이트) | KB VPN 계정 ID · DMA user_id · 전체 계좌번호가 문서에 유입될 수 있다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-scu-01 | Tampering | `.planning/ROADMAP.md` · `.planning/STATE.md` | mitigate | 전체 재작성 금지 · Edit 유일 문자열 치환만 · 편집 직전 대상 구간 재독 · task 마다 즉시 커밋 · verify 에 `Phase: 16` Current Position 줄과 `progress:` 프론트매터 잔존 단언 |
| T-scu-02 | Tampering | 실계좌 주문 경로 (relay `OrderApi` · `POST /api/orders`) | mitigate | 쓰기 동작 전면 금지를 `<hard_constraints>` 에 명시. 판정은 `dma_orders` **읽기** 카운트로만 수행. 0행이면 새 주문을 내지 않고 ⚠ 유지 |
| T-scu-03 | Tampering | Supabase production (service role) | mitigate | `GET` + `Prefer: count=exact` + `Range: 0-0` 만. `POST`/`PATCH`/`DELETE` 금지. 본문은 `-o /dev/null` 로 폐기 |
| T-scu-04 | Information Disclosure | 문서에 기록되는 문자열 | mitigate | KB VPN 계정 ID·DMA user_id·전체 계좌번호 기록 금지 + 저장소 전역 마스킹 게이트를 Task 1 verify 에 포함 |
| T-scu-05 | Information Disclosure | service role 키 (`workers/master-sync/.env`) | mitigate | 키를 변수에만 담고 출력·문서 기록 금지. 넓은 패턴 grep 으로 env 를 훑지 않는다(15-08 선례) |
| T-scu-06 | Repudiation | §8 재판정의 근거 | mitigate | 항목마다 재현 가능한 실측 명령 출력 또는 커밋 해시를 적는다. 근거 없으면 ⚠ 유지 — "라이브 됐으니 다 됐다"는 추정 금지 |
| T-scu-07 | Tampering | `15-LIVE-VERIFICATION.md` §1~§7 (2026-09-06 정직한 기록) | mitigate | 덮어쓰기 금지 · append + 포인터 1줄만 · verify 가 삭제 라인 수 ≤2 를 단언 |
| T-scu-SC | Tampering | 패키지 설치 | accept | 이 plan 은 패키지를 설치하지 않는다 (문서 전용, 코드 변경 0) |
</threat_model>

<verification>
전체 완료 후 (읽기 전용):

1. `git log --oneline -3` — 커밋 3개, 전부 한글 메시지, `Co-Authored-By` 0건:
   `git log -3 --format=%B | grep -c 'Co-Authored-By'` → `0`
2. 코드 변경 0: `git diff --name-only HEAD~3 HEAD | grep -vc '^\.planning/'` → `0`
3. 장부 대칭: Task 2 의 verify 블록 재실행 → `VERIFY-2-OK`
4. 병행 세션 무손상: `git status --porcelain` 에 내 대상 파일 4개 외의 잔여 변경이 없고,
   `grep -c '^Phase: 16 (trading-limit-chaser-vi-my-page)' .planning/STATE.md` → `1`
5. 비밀 게이트: `grep -rlIE 'kb[s]124' .planning tasks | wc -l` → `0`
</verification>

<success_criteria>
- `15-LIVE-VERIFICATION.md` §1~§7 이 보존된 채 §8 재집계가 append 됐고 §3 에 포인터가 있다.
- SC-4~SC-8 · §4-A~§4-E 미증명 전 항목 · §5 이관 15건이 **하나도 빠짐없이** 재판정됐다.
- 재판정된 ✅ 는 전부 실측 출력 또는 커밋 해시를 근거로 가지며, 근거 없는 항목은 ⚠ 로 남아 해소 조건이 적혀 있다.
- `REQUIREMENTS.md` RELAY-01/02/03 의 정의부 체크박스와 Traceability 상태가 대칭이고, Pending 잔존 시 `잔여:` 사유가 붙어 있다.
- `ROADMAP.md` 가 Phase 15 를 `[x]` + `20/20 plans executed` + `15-20-PLAN.md [x]` 로 표기한다.
- `STATE.md` 에 `### Phase 15 Production State (2026-09-08)` 절과 `260908-scu` quick 행이 있다.
- 코드 변경 0 · 배포 0 · 새 주문 0 · Supabase 쓰기 0.
- Phase 16 세션 소유 구간(ROADMAP Phase 16 · STATE Current Position/progress/Session Continuity)이 무손상이다.
</success_criteria>

<output>
완료 시 `.planning/quick/260908-scu-phase-15-sc-4-8-relay-01-03-roadmap-stat/260908-scu-SUMMARY.md` 를 작성한다.
SUMMARY 에는 (a) Step 1 읽기 전용 실측 3종의 실제 값, (b) SC-4~SC-8 재판정 전후 표,
(c) 여전히 ⚠ 로 남은 항목과 각각의 해소 조건, (d) RELAY-01/02/03 최종 상태와 근거를 담는다.
</output>
