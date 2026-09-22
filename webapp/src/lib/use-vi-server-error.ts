"use client";

import { useEffect, useRef, useState } from "react";

import type { RelayServerMessageEntry } from "@/lib/use-relay-socket";
import { isViServerMessage } from "@/lib/vi-alert";

/** VI 몫 서버 거부 1건 — **원문과 출처를 따로** 둔다(배지 판정은 렌더 자리에서 한 번). */
export interface ViServerError {
  text: string;
  src: string;
}

/**
 * 작업대의 최신 VI 몫 서버 거부 1건 (18-13 — 옛 VI 화면 상태줄 `vi-server-error` 의 판정 이관).
 *
 * ★ 판정은 `isViServerMessage` **하나**다(Pitfall 9) — 상따 몫(종목 붙은 `Account` · `LimitChaser`)과
 *   relay 자기 거부를 여기서 먹으면 사용자가 멀쩡한 VI 를 껐다 켠다(두 번째 무인 발주).
 * ★ ERROR 만 경보다. 새 VI 거부가 오면 최신 1건으로 바뀌고, 뒤이어 온 남의 통지는 지우지 않는다.
 * ★ 이미 본 항목까지만 읽는다 — relay 는 최신을 index 0 에 두고 상한(20)을 넘기면 밀어낸다.
 *   못 찾으면(밀려났다) 지금 목록 전체가 새것이다(옛 VI 화면(18-13 삭제)과 같은 규칙).
 */
export function useViServerError(
  messages: readonly RelayServerMessageEntry[],
): ViServerError | null {
  const lastMsgRef = useRef<RelayServerMessageEntry | null>(null);
  const [lastError, setLastError] = useState<ViServerError | null>(null);

  useEffect(() => {
    if (messages.length === 0) return;
    const seen = lastMsgRef.current;
    const idx = seen === null ? -1 : messages.indexOf(seen);
    const fresh = idx < 0 ? messages : messages.slice(0, idx);
    lastMsgRef.current = messages[0];
    for (const msg of [...fresh].reverse()) {
      if (!isViServerMessage(msg)) continue;
      if (msg.lv === "ERROR") setLastError({ text: msg.m, src: msg.src });
    }
  }, [messages]);

  return lastError;
}
