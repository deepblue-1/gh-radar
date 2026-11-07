# Quick Task 261107-jhk: 어드민 발사 화면 상단 정리 · 「러쉬 주문」 개명 - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Task Boundary

`/admin/launch` 폰 화면 상단이 어수선하다(사용자 스크린샷 2026-11-07): 제목 · 설명 · 서버 칩 · 탭 · 날짜 알약 · 발사 세그먼트 ·
출처 배지가 6줄로 쌓이고 모양이 제각각이며, 서버 칩이 탭 위에 있어 위계가 어색하다. 상단을 정리하고 메뉴 · 제목을 「러쉬 주문」 으로 바꾼다.
직전 quick 261107-iep(서버 칩 · `?gw`)의 동작은 그대로 두고 **배치 · 문구만** 바꾼다. 경로 `/admin/launch` · 쿼리 키 · API 무변경.

</domain>

<decisions>
## Implementation Decisions

### 채택 목업
- `reference/mockup-launch-header.html` 변형 **A 한 줄 컨트롤** + 사용자 수정 → `reference/mockup-launch-header-v2.html` 위계안 **H1 탭 먼저 · 서버는 필터 줄**.

### 상단 순서 (위 → 아래) — H1
1. 제목 「러쉬 주문」 (PageHeader · **설명 문단 없음**)
2. 탭 줄 「주문 내역 · 경계 지도」 (지금 밑줄 탭 그대로)
3. 서버 칩 줄 [KB120][교보119][교보112] (261107-iep 칩 그대로 · 자리만 탭 아래로)
4. 컨트롤 한 줄: 주문 내역 = 날짜 알약 + 발사 세그먼트 / 경계 지도 = 범위 칩 + 발사 세그먼트
- 서버 칩 줄과 컨트롤 줄은 탭 아래의 「무엇을 볼지」 필터 묶음 — 둘 사이 간격은 탭-필터 간격보다 좁게(목업 `.ctx` gap 10px).
- 서버 칩은 두 탭 공용이므로 탭 패널 밖(Tabs 목록 바로 아래)에 한 번만 둔다. 컨트롤 줄은 탭마다 다르므로 탭 패널 안 그대로여도 된다 — 보이는 순서만 위와 같으면 된다.

### 컨트롤 줄
- 발사 세그먼트는 **우정렬 금지** — 날짜 알약(또는 범위 칩) **바로 오른쪽에 붙인다**(gap 10px · `ml-auto` 없음).
- 발사 세그먼트 글자를 짧게: 「16:00 예약」→「16:00」, 「09:00:30 개장차익」→「09:00:30」. 전체 이름은 `title`(툴팁) · `aria-label` 로 남긴다. 두 탭 공용 `LaunchFireSeg` 한 벌.
- 폰 390 에서 한 줄에 들어가야 한다(날짜 알약 + 짧은 세그먼트 ≈ 320px · 범위 칩 3 + 세그먼트 ≈ 350px). 넘치면 wrap 은 허용(잘림 금지).

### 지우는 문구
- 주문 내역 출처 배지 「KB120 저널 80 · 16:00:01 적재」 삭제(`data-slot="launch-source"`).
- 경계 지도 실제 범위 글 「10/24 ~ 11/06 · 10일」 삭제(`data-slot="launch-range-text"`) — 같은 결로 목업에서 빼고 사용자에게 알렸고 이견 없음.
- 제목 밑 설명 「gh-trade 서버 발사 결과 · 머리 + 조각」 삭제.

### 이름
- 사이드바 메뉴 라벨 「발사」→「러쉬 주문」 (`webapp/src/components/layout/app-sidebar.tsx` `NAV_ADMIN_LAUNCH`).
- 페이지 제목 「발사」→「러쉬 주문」, 문서 제목 「발사 · Admin」→「러쉬 주문 · Admin」(날짜 붙는 꼴 유지).
- 본문 안 「발사」 용어(카드 「오프셋 (발사 기준)」, 「다음 발사 계획」, 표 머리 「발사」, 빈 상태 문구 등)는 **바꾸지 않는다** — 메뉴명 · 페이지 제목만.

### Claude's Discretion
- 범위 글을 지우면 응답 days 계산(`launchRangeOf`)이 쓰이지 않게 되면 정리할지 — 다른 곳에서 쓰면 남긴다.
- 테스트(단위 · e2e)에서 지운 문구 · 바뀐 이름을 기대하던 곳을 고친다. 사이드바 트리 e2e 등 「발사」 라벨을 찾는 다른 spec 도 grep 으로 찾아 맞춘다.

</decisions>

<specifics>
## Specific Ideas

- 사용자 원문: 「한줄 컨트롤로 하되, 'KB120 저널 80 · 16:00:01 적재' 이런 문구 삭제하고, 발사 타이틀 밑에 설명도 없애줘. '발사' 메뉴명과 타이틀도 '러쉬 주문'으로 수정해줘. 16시, 09:00:30 탭도 우정렬 하지말고 왼쪽 날짜 오른쪽에 바로 붙여줘.」
- 「서버를 칩으로 고르고 그 밑이 탭이라서 위계가 좀 이상해 보이는데」 → H1(탭 → 서버 칩 → 날짜 · 발사) 채택.

</specifics>

<canonical_refs>
## Canonical References

- 채택 목업: `.planning/quick/261107-jhk-admin-launch-header-redesign/reference/mockup-launch-header-v2.html` (H1) · 바탕 `mockup-launch-header.html` (A)
- 직전 작업: `.planning/quick/261107-iep-admin-launch-per-server-view/` (서버 칩 · `?gw`)
- 코드: `webapp/src/components/admin/launch-client.tsx` · `launch-orders-tab.tsx` (`LaunchFireSeg` · 출처 배지) · `launch-map-tab.tsx` (범위 칩 · 범위 글) · `launch-server-chips.tsx` · `webapp/src/components/layout/app-sidebar.tsx` · `webapp/src/components/layout/page-header.tsx`
- 테스트: `webapp/src/components/admin/__tests__/launch-*.test.tsx` · `webapp/e2e/specs/admin-launch.spec.ts` · 사이드바 관련 spec/test (grep 「발사」)

</canonical_refs>
