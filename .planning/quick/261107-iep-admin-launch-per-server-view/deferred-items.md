# Deferred items — quick-261107-iep

- **server `tests/routes/admin-launch.test.ts` P35-S9 「400 65칸」 간헐 실패(범위 밖 · 미수정).** 전체 파일을 연달아 돌리면
  약 30회 중 2회 `P35-S9 400 65칸 → VALIDATION_FAILED · relay 0회 · RPC 0회` 하나만 실패하고, 바로 다시 돌리면 통과한다.
  `-t "65칸"` 단독 10회와 전체 파일 재실행 12회는 모두 통과해 원인 메시지를 잡지 못했다. 이 작업은 이 테스트(KB120 PUT 경로 ·
  offsets 길이 검증)도 해당 코드 경로도 건드리지 않았다(GET 테스트 · 새 KYOBO112 PUT 테스트만 추가) → 원래 있던 flake 로 본다.
  supertest 가 큰 바디를 보내는 중에 400 이 먼저 와 생기는 연결 경합일 가능성이 있다.
