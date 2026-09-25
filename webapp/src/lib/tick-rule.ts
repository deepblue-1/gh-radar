'use client';

/**
 * 종목 ISIN → 호가 단위 잠금 강도(`TickRule`) — Phase 20 D-15a (20-REVIEW WR-05).
 *
 * ① 왜 필요한가
 *   가격 입력 검증(`priceInputIssue`)은 **주식** 호가 단위 표 하나뿐이다. ETF·ETN·ELW 는 단위가 다를 수
 *   있어, 그 표로 확인을 잠그면 유효한 가격을 넣을 수 없다(상따 시트·인라인 · 수동주문 시트). 그래서 카드가
 *   종목 분류를 알아 잠금 강도를 가른다 — 주식이면 잠금, ETP·분류 불명이면 경고만(`priceIssueLocks`).
 *
 * ② 분류의 원천 = 종목 마스터 `stocks.security_group` (새 판별자를 만들지 않는다)
 *   ETP 판정은 server `/api/stocks/search` · SQL 선례 4곳과 **같은 블랙리스트**(ETF·ETN·ELW)다 —
 *   `@gh-radar/shared` `tickRuleOfSecurityGroup` 한 곳. 조회는 webapp → Supabase 직접(RLS
 *   `anon, authenticated` SELECT 허용 · `stocks.isin` 부분 유니크 인덱스) — 서버·relay·스키마 변경이 없다.
 *   ★ relay 프레임에는 분류가 없다(`SymbolMap` 은 이름·코드·시장만 푼다). 프로토콜을 넓히지 않고 기존
 *     컬럼을 읽기만 한다.
 *   ★ master-sync 는 ETP 행에 `isin` 을 싣지 않는다(KRX ETP 응답에 표준코드가 없다 · `upsert.ts`). 그래서
 *     ETP 카드의 ISIN 은 마스터에서 **찾지 못하고** `unknown` 이 된다 — 규칙상 ETP 와 같은 경고만이다.
 *     「찾았는데 ETF」(같은 코드의 주식 행에 isin 이 보존된 경우)는 `etp` 다.
 *
 * ③ 상태 셋
 *   - `undefined` — 아직 조회 중(또는 ISIN 없음). 호출부는 기존 D-15 잠금(= `stock`)으로 둔다
 *     (`PadCtx.tickRule` 미지정 규칙) — 대다수인 주식 카드가 조회 한 번 동안 느슨해지지 않는다.
 *   - `stock` / `etp` — 마스터가 답했다.
 *   - `unknown` — 마스터에 없음 · 미확인 sentinel · 조회 실패. 경고만 한다(사용자 결정 D-15a).
 *     실패는 로그를 남긴다(무로그 fail-safe 금지) · 캐시하지 않는다(다음 마운트가 다시 묻는다).
 *
 * ④ 캐시 — 분류는 장중에 바뀌지 않는다. 성공 결과를 탭 메모리에 ISIN 별로 한 번 들고, 같은 ISIN 의 동시
 *   조회는 한 요청을 공유한다(작업대 카드 여러 장 · 호가 탭).
 */

import { useEffect, useState } from 'react';
import { tickRuleOfSecurityGroup, type TickRule } from '@gh-radar/shared';

import { createClient } from '@/lib/supabase/client';

const resolved = new Map<string, TickRule>();
const inflight = new Map<string, Promise<TickRule>>();

/** 테스트 전용 — 모듈 캐시를 비운다. */
export function clearTickRuleCache(): void {
  resolved.clear();
  inflight.clear();
}

/** 마스터 한 행 조회 → 잠금 강도. 행이 없으면 `unknown`. 오류는 던진다(호출부가 로그·폴백). */
export async function fetchTickRule(isin: string): Promise<TickRule> {
  const { data, error } = await createClient()
    .from('stocks')
    .select('security_group')
    .eq('isin', isin)
    .maybeSingle();
  if (error) throw error;
  const row = data as { security_group: string | null } | null;
  return tickRuleOfSecurityGroup(row?.security_group);
}

function loadTickRule(isin: string): Promise<TickRule> {
  const pending = inflight.get(isin);
  if (pending !== undefined) return pending;
  const p = fetchTickRule(isin).then(
    (rule) => {
      resolved.set(isin, rule);
      inflight.delete(isin);
      return rule;
    },
    (err: unknown) => {
      inflight.delete(isin);
      console.warn('[tick-rule] 종목 분류 조회 실패 — 호가 단위는 경고만 한다(D-15a)', isin, err);
      return 'unknown' as const;
    },
  );
  inflight.set(isin, p);
  return p;
}

/**
 * 카드 종목의 호가 단위 잠금 강도. `undefined` = 조회 중(호출부는 주식 잠금 그대로) — 파일 상단 ③.
 */
export function useTickRule(isin: string): TickRule | undefined {
  const [state, setState] = useState<{ isin: string; rule: TickRule | undefined }>(() => ({
    isin,
    rule: resolved.get(isin),
  }));

  useEffect(() => {
    if (isin === '') return;
    const hit = resolved.get(isin);
    if (hit !== undefined) {
      setState({ isin, rule: hit });
      return;
    }
    let alive = true;
    void loadTickRule(isin).then((rule) => {
      if (alive) setState({ isin, rule });
    });
    return () => {
      alive = false;
    };
  }, [isin]);

  // ISIN 이 바뀐 직후 한 렌더 — 옛 종목의 분류를 새 종목에 쓰지 않는다.
  return state.isin === isin ? state.rule : resolved.get(isin);
}
