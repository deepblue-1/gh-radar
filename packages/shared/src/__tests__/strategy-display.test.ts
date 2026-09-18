import { describe, it, expect } from "vitest";
import { sideDisplayText, serverMsgBadge } from "../strategy-display";

/**
 * 표시 헬퍼 2종 단위 테스트 (17-01 / D-13 · D-17).
 *
 * 정본은 gh-trade `client/Services/DMA/NotificationHub.cs` 의 `SideDisplayText`(:172)와
 * `IsQueuedOrderNo`(:154) 다. 이 파일은 그 규칙표를 **문장 단위로 굳힌다** — 뒤 wave 의
 * webapp 표면은 인라인 접미를 만들지 않고 이 두 함수만 부른다.
 *
 * 핵심 규율 둘:
 *   ① 판정 근거는 **서버 값의 형식·공백 여부·동등 비교**뿐이다. 문구 내용을 읽지 않는다
 *      (gh-trade 교훈 24 — 서버가 문구를 바꾸면 조용히 틀어지는 분기를 만들지 않는다).
 *   ② 접미는 **누적**이다. C# 정본이 세 `if` 를 연달아 적용하므로 Q-ID 이면서 접수대기인
 *      행은 `매수QP` 다 — 하나만 붙이면 WinForms 화면과 같은 행이 다르게 보인다.
 */
describe("sideDisplayText (C# NotificationHub.SideDisplayText 동형)", () => {
  it("접미 조건이 없으면 방향 단어뿐이다", () => {
    expect(sideDisplayText("B", "0001234567", "", "")).toBe("매수");
    expect(sideDisplayText("S", "0001234567", "", "")).toBe("매도");
  });

  it("Q-ID 주문번호(`Q`+숫자 9자 = 10자)면 `Q` 접미가 붙는다", () => {
    expect(sideDisplayText("B", "Q093015001", "", "")).toBe("매수Q");
    expect(sideDisplayText("S", "Q093015001", "", "")).toBe("매도Q");
  });

  it("Q-ID 형식을 **통과하지 못하면** 접미가 없다 — 형식 판정이지 의미 판정이 아니다", () => {
    // 9자(짧다) · 11자(길다) · 소문자 q · 뒤 9자에 숫자 아닌 글자 · 빈 값
    expect(sideDisplayText("B", "Q09301500", "", "")).toBe("매수");
    expect(sideDisplayText("B", "Q0930150012", "", "")).toBe("매수");
    expect(sideDisplayText("B", "q093015001", "", "")).toBe("매수");
    expect(sideDisplayText("B", "Q09301500A", "", "")).toBe("매수");
    expect(sideDisplayText("B", "", "", "")).toBe("매수");
  });

  it("`pendingStatus` 가 비어 있지 않으면 `P` 접미가 붙는다 — 문구는 읽지 않는다", () => {
    expect(sideDisplayText("S", "0001234567", "증권사 보관 · 09:00 처리", "")).toBe("매도P");
    // 문구가 무엇이든 「비어 있지 않다」 하나로 같은 결과여야 한다 (교훈 24).
    expect(sideDisplayText("S", "0001234567", "알 수 없는 새 문구", "")).toBe("매도P");
    expect(sideDisplayText("S", "0001234567", " ", "")).toBe("매도P");
  });

  it("`board` 가 G2·G3 면 `/종가` 접미가 붙고, 그 밖의 값은 접미가 없다", () => {
    expect(sideDisplayText("B", "0001234567", "", "G2")).toBe("매수/종가");
    expect(sideDisplayText("B", "0001234567", "", "G3")).toBe("매수/종가");
    // "G1" 은 서버가 보내지 않는 값이다 — 지어내서 접미를 붙이지 않는다.
    expect(sideDisplayText("B", "0001234567", "", "G1")).toBe("매수");
    expect(sideDisplayText("B", "0001234567", "", "g2")).toBe("매수");
  });

  it("접미는 **누적**이다 — C# 정본이 세 if 를 연달아 적용한다", () => {
    // Q-ID + 접수대기
    expect(sideDisplayText("B", "Q093015001", "증권사 보관", "")).toBe("매수QP");
    // Q-ID + 시간외종가
    expect(sideDisplayText("B", "Q093015001", "", "G2")).toBe("매수Q/종가");
    // 접수대기 + 시간외종가
    expect(sideDisplayText("S", "0001234567", "증권사 보관", "G3")).toBe("매도P/종가");
    // 셋 다 — 순서는 Q → P → /종가 다.
    expect(sideDisplayText("B", "Q093015001", "증권사 보관", "G2")).toBe("매수QP/종가");
  });
});

describe("serverMsgBadge (D-17 — 동등 비교만)", () => {
  it("아는 두 출처는 각자의 배지를 받는다", () => {
    expect(serverMsgBadge("LimitChaser")).toBe("[상따]");
    expect(serverMsgBadge("VITrigger")).toBe("[VI]");
  });

  it("그 밖은 전부 `[서버]` 다 — 빈 값·기존 어휘·미상 모두 같은 자리로 떨어진다", () => {
    expect(serverMsgBadge("")).toBe("[서버]");
    expect(serverMsgBadge("Account")).toBe("[서버]");
    expect(serverMsgBadge("System")).toBe("[서버]");
    expect(serverMsgBadge("SetLimitChaser")).toBe("[서버]");
    expect(serverMsgBadge("SetVITrigger")).toBe("[서버]");
    // 서버가 장래에 어휘를 늘려도 모르는 값은 조용히 기본 분기로 떨어져야 한다.
    expect(serverMsgBadge("SomeFutureSource")).toBe("[서버]");
  });

  it("자유문 해석을 하지 않는다 — 대소문자 접기·부분일치 금지", () => {
    // `toLowerCase()` 로 접으면 통과해 버리는 입력들이다.
    expect(serverMsgBadge("limitchaser")).toBe("[서버]");
    expect(serverMsgBadge("LIMITCHASER")).toBe("[서버]");
    expect(serverMsgBadge("vitrigger")).toBe("[서버]");
    // `includes()` 로 보면 통과해 버리는 입력들이다.
    expect(serverMsgBadge("SetLimitChaserResp")).toBe("[서버]");
    expect(serverMsgBadge("NotVITriggerAtAll")).toBe("[서버]");
  });
});
