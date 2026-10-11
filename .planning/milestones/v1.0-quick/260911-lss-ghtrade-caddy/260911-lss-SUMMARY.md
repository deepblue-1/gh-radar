---
quick_id: 260911-lss
slug: ghtrade-caddy
date: 2026-09-11
status: complete
tasks: 2
---

# Quick 260911-lss Summary

**오늘 실측 2건을 정본에 남겼다 — 둘 다 증거와 한계를 함께 적었다.**

## Task 1 — 거래원 푸시(74/75) 드롭 로그 이관 항목 종결

`15-LIVE-VERIFICATION.md` §9.4 이관 1 에 종결 블록 13행 append (삭제 0행).

**근거:** 새 컨테이너 `11072e4` · 구독 활성(`KR7117670000` KRX, 10:15:46 KST) ·
장중 4.5분(10:15:46~10:20:10) 동안 `unknown-msg-type` 0건 · WARNING 드롭 0건.
대조군 `a1f4ed6` 는 같은 조건에서 40분 13건(25~55초 주기) — 4.5분이면 5~10건 구간.

**이 항목 자신의 함정을 피했다.** 「구독 발생을 확인하지 않은 0 은 아무것도 증명하지 않는다」고
스스로 적어 둔 항목이라, 구독 시각(10:15:46)을 먼저 확인하고 셌다.

**한계(부풀리지 않음):** `LOG_LEVEL=info` 라 debug 강등분(`out-of-scope`)은 직접 관측하지 못했다.
증명된 명제는 「WARNING 이 사라졌다」이지 「75가 들어와 out-of-scope 로 분류됐다」가 아니다.
후자는 단위 테스트에만 잠겨 있고, 보려면 `LOG_LEVEL=debug` 재시작이 필요한데
장중 세션 단절 비용 대비 값어치가 없다고 판단해 하지 않았다.

## Task 2 — `/ghtrade` 적용 기록 + STATE

`infra/relay/README.md` `## /ghtrade/*` 절 머리에 적용 완료 블록 26행 append.
**기록 위치를 README 하나로 고정**했다 — 운영자가 먼저 여는 파일이고, SUMMARY 와 중복 기술하면
두 곳이 갈라진다.

기록한 실측: 메타데이터 갱신 → startup 재적용(`/srv/ghtrade ready (alex:caddy 2755)` · caddy 가드
동작 · apt 0건) → `caddy validate` Valid(exit 0, `dma.log` 소유권 유지) → reload **15:39:35 KST** →
`/healthz` 200 · wss 재접속(`sessionCount` 2 · `everReadyCount` 2 · `stalledCount` 0).
양성/음성 7행 표 + **「404 만으로는 증명이 안 된다」**는 검증 순서 규율.

STATE Quick Tasks 표에 260911-dps·260911-lss 2행 추가. 삭제 0행,
`## Current Position`·`progress:` 무변경.

## 검증

- 세 파일 모두 삭제행 **0** (순수 append / 행 추가)
- D-11 고정키 저장소 전체 등장 **1회** — `infra/relay/Caddyfile` 만
- 코드 변경 0 · 배포 0 · VM 조작 0 · gcloud 0 · 실계좌 주문 0

## 이관

없음. 다만 gh-trade-9d 가 알려온 바로는 실제 발행은 gh-trade Phase 20 이 master 에 머지된 뒤이며
그때까지 `/srv/ghtrade` 가 비어 있는 것이 정상이다. 양성(헤더 있음 → 200) 재확인은
실발행 직후 그쪽 세션이 찍어 회신하기로 했다.
