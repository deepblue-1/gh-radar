---
status: complete
phase: 28-limitup-feature-ingest
source: [28-VERIFICATION.md]
started: 2026-10-05T12:32:12Z
updated: 2026-10-10T00:53:25.381Z
---

## Current Test

[testing complete]

## Tests

### 1. 119 에 radar-gw-pull 공개키 등록 후 radar-gw 에서 --check → 타이머 enable → 첫 운반
expected: `--check` 119 접속 OK · `systemctl enable --now limitup-pull.timer` · `journalctl -u limitup-pull` 에 `rsync=ok upload=ok`
why_human: 119 authorized_keys 등록은 gh-trade 사용자 몫 — 지금 radar-gw --check 는 Permission denied(publickey)
result: pass (2026-10-05 21:38~21:50 KST — 메인 세션: 119 등록 · timer enabled · 첫 운반 rsync=ok upload=ok · 인박스 2건 done · 4일 재적재 smoke PASS 12 · 창구 대조 0곳 차이)

### 2. 타이머 첫 운반 후 인박스 노트 261005-limitup-feature-85.md 를 status: done + done_commit 으로 마감
expected: frontmatter status done · done_commit 8자 · 경로 지정 커밋(README 규약)
why_human: ROADMAP Goal 의 「인박스 노트 done」 은 119 등록에 막혀 있다 — 현재 open + 「119 등록 대기」 한 줄(28-15 플랜이 허용한 의도된 상태)
result: pass (2026-10-05 21:38~21:50 KST — 메인 세션: 119 등록 · timer enabled · 첫 운반 rsync=ok upload=ok · 인박스 2건 done · 4일 재적재 smoke PASS 12 · 창구 대조 0곳 차이)

### 3. gh-trade 서버가 85 를 보내는 다음 거래일 장중에 FULL 카드 「상한가」 탭 관찰
expected: 탭 제목 「상한가 · 잠김 N초」 1초 갱신 · 9칸 값 · 접었다 펼치면 즉시 복원 · relay 로그 85 미처리 warn 0
why_human: 운영에서 85 는 gh-trade 서버 Phase 27 배포 뒤 장중에만 온다 — 오늘(2026-10-05 장 마감 뒤) 관찰 불가. 코드·단위·e2e 는 통과
result: pass (2026-10-10 사용자 확인 — 「1,2,3 통과야」)

### 4. 같은 거래일 장중 dma_strategy_events 의 kind 15 행과 주문로그 「상한가 특징」 체크
expected: 분당·키당 1행 적재 · 체크 켜면 「전체」·「시세」 에 회색 줄 · 기본 숨김 · 라이브 푸시 같은 판정
why_human: kind 15 는 85 와 같이 장중에만 생긴다 · relay 라이브 푸시 경로는 실데이터 미관찰
result: pass (2026-10-10 사용자 확인 — 「1,2,3 통과야」)

### 5. 119 키 등록 뒤 첫 밤(평일 21:00 운반 → 21:20 워커) 자동 적재와 member_top 재export 재적재
expected: 새 날짜 manifest 행 수 == 표 행 수(smoke-limitup-sync.sh) · 20261002 등 옛 export 날짜가 files_sig 변경으로 날짜 단위 교체 재적재(inbox 261005-member-top-int64.md)
why_human: 지금 GCS 는 수동 시드(pre-fix export)이고 운반기 → 워커 자동 경로는 실제로 한 번도 돌지 않았다. 재적재는 W-1 이 발화할 수 있는 첫 실제 트리거이므로 그 전에 W-1 수정을 권장
result: pass (2026-10-05 21:38~21:50 KST — 메인 세션: 119 등록 · timer enabled · 첫 운반 rsync=ok upload=ok · 인박스 2건 done · 4일 재적재 smoke PASS 12 · 창구 대조 0곳 차이)

### 6. 보고서 시각 확인 — 폰 390px(격자 2단 카드 · 레인 오버레이 라벨 겹침 0) · 데스크톱 8열 · 카드 「상한가」 탭 폰 밴드 말줄임·탭 제목 한 줄
expected: plan backstop 7건(28-07 overflow·long-text, 28-11 overflow·long-text, 28-12 E7 overflow, 28-13 E8 overflow·long-text)이 눈으로 맞다
why_human: verification: backstop 진술은 존재만으로 VERIFIED 로 못 올린다. e2e(P28-2 · P28-R1b · P28-O1)가 일부를 덮는다고 SUMMARY 가 주장하나 verifier 는 e2e 를 재실행하지 않았다
result: pass (2026-10-10 사용자 확인 — 「1,2,3 통과야」)

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
