'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { LAUNCH_SERVERS, type LaunchFire, type LaunchRange, type LaunchServer, type LimitupDate } from '@gh-radar/shared';

import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { launchFireParamOf, launchGatewayParamOf, launchTabOf, type LaunchTab } from '@/lib/launch-format';
import { launchRangeParamOf } from '@/lib/launch-map';
import { fmtYmdShort, parseYmdParam } from '@/lib/limitup-report';

import { LaunchMapTab } from './launch-map-tab';
import { LaunchOrdersTab } from './launch-orders-tab';
import { LaunchServerChips } from './launch-server-chips';

/**
 * LaunchClient — `/admin/launch` 본문 (Phase 35 · D-11 · D-12 · 채택 목업 변형 A · 메뉴 1개 + 탭).
 *
 * 쿼리가 진실 원본이다(새로고침 · 공유 주소 그대로).
 * - `tab` — 'orders'(기본 · 주문 내역) · 'map'(경계 지도 · 35-08). 그 밖 값은 `router.replace` 로 지운다.
 *   탭 전환은 `router.replace` 이고 다른 키(d · fire · range)를 보존한다 — 두 탭이 같은 `fire` 를 본다.
 * - `d` — YYYYMMDD(`parseYmdParam`). 없으면 최신(server 가 정한다). 형식 오류는 `router.replace` 로 d 만 지운다.
 *   날짜 이동 = `router.push`(뒤로 가기로 이전 날).
 * - `fire` — q16(기본) · n0930. 그 밖 값은 `router.replace` 로 지운다. 두 탭 공용. 주문 내역은 전환해도 다시 받지 않고(한 응답에 두 발사가 다 있다),
 *   경계 지도는 발사 기준별 응답이라 전환마다 1건 받는다.
 * - `range` — 경계 지도 프리셋 10d(기본) · 20d · all. 잘못된 값은 `router.replace` 로 지운다. 칩 전환 = `router.replace`.
 * - `gw` — 발사 서버 키(shared `LAUNCH_SERVERS` — KB120(기본) · KYOBO119 · KYOBO112 · quick-261107-iep). 두 탭 공용이고
 *   탭 줄 아래 · 컨트롤 줄 위(Tabs 안 · 탭 패널 밖 한 벌 · quick-261107-jhk H1) 서버 칩(`LaunchServerChips`)이 고른다(칩 전환 = `router.replace`). 클라이언트 필터라 서버를 바꿔도
 *   주문 내역 · 지도 · 계획을 다시 받지 않는다. 잘못된 값(KB121 · 소문자 · 빈 값)은 `router.replace` 로 지운다.
 * 갱신은 언제나 다른 키를 보존한 URLSearchParams 로 한다.
 */

const BASE = '/admin/launch';
const TITLE = '러쉬 주문 · Admin';
/** 지금 그리는 탭. */
const AVAILABLE_TABS: readonly LaunchTab[] = ['orders', 'map'];

export function LaunchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const parsedTab = launchTabOf(rawTab);
  const tab: LaunchTab = parsedTab !== null && AVAILABLE_TABS.includes(parsedTab) ? parsedTab : 'orders';
  const badTab = rawTab !== null && rawTab !== tab;

  const rawD = searchParams.get('d');
  const d = parseYmdParam(rawD);
  const badD = rawD !== null && d === null;

  const rawFire = searchParams.get('fire');
  const parsedFire = launchFireParamOf(rawFire);
  const fire: LaunchFire = parsedFire ?? 'q16';
  const badFire = rawFire !== null && parsedFire === null;

  const rawRange = searchParams.get('range');
  const parsedRange = launchRangeParamOf(rawRange);
  const range: LaunchRange = parsedRange ?? '10d';
  const badRange = rawRange !== null && parsedRange === null;

  const rawGw = searchParams.get('gw');
  const parsedGw = launchGatewayParamOf(rawGw);
  const gw: LaunchServer = parsedGw ?? LAUNCH_SERVERS[0];
  const badGw = rawGw !== null && parsedGw === null;

  /** 현재 쿼리를 복제해 고친 주소 — 다른 키는 그대로. */
  const hrefWith = useCallback(
    (mutate: (p: URLSearchParams) => void): string => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const q = p.toString();
      return q === '' ? BASE : `${BASE}?${q}`;
    },
    [searchParams],
  );

  // 잘못된 tab · d · fire · range · gw → 그 키만 지운다(정본화 — 공유 주소와 화면이 갈라지지 않게).
  useEffect(() => {
    if (!badTab && !badD && !badFire && !badRange && !badGw) return;
    router.replace(
      hrefWith((p) => {
        if (badTab) p.delete('tab');
        if (badD) p.delete('d');
        if (badFire) p.delete('fire');
        if (badRange) p.delete('range');
        if (badGw) p.delete('gw');
      }),
    );
  }, [badTab, badD, badFire, badRange, badGw, hrefWith, router]);

  useEffect(() => {
    document.title = d === null ? TITLE : `${TITLE} · ${fmtYmdShort(d)}`;
  }, [d]);

  const onTab = (v: string) => router.replace(hrefWith((p) => p.set('tab', v)));
  const onGoDate = (to: LimitupDate) => router.push(hrefWith((p) => p.set('d', to)));
  const onLatest = () => router.push(hrefWith((p) => p.delete('d')));
  const onFire = (f: LaunchFire) => router.replace(hrefWith((p) => p.set('fire', f)));
  const onRange = (r: LaunchRange) => router.replace(hrefWith((p) => p.set('range', r)));
  const onGw = (g: LaunchServer) => router.replace(hrefWith((p) => p.set('gw', g)));

  return (
    <div data-slot="admin-launch" className="mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-4">
      <PageHeader title="러쉬 주문" />
      {/* quick-261107-jhk H1 — 탭 줄 → 서버 칩(두 탭 공용 · 탭 패널 밖 한 벌) → 컨트롤 줄(각 탭 본문 첫 줄).
          간격: 탭 줄-칩 14px(gap 10 + mb-1) > 칩-컨트롤 줄 10px(gap) — 칩과 컨트롤이 한 필터 묶음으로 읽힌다. */}
      <Tabs data-slot="launch-tabs" value={tab} onValueChange={onTab} className="min-w-0 gap-2.5">
        <TabsList variant="line" className="mb-1 h-auto gap-4 border-b border-[var(--border-subtle)] p-0">
          <TabsTrigger value="orders" className="flex-none px-0.5 pb-2.5 text-[15px] font-semibold">
            주문 내역
          </TabsTrigger>
          <TabsTrigger value="map" className="flex-none px-0.5 pb-2.5 text-[15px] font-semibold">
            경계 지도
          </TabsTrigger>
        </TabsList>
        <LaunchServerChips gw={gw} onGw={onGw} />
        <TabsContent value="orders" className="min-w-0">
          <LaunchOrdersTab gw={gw} d={d} fire={fire} onGoDate={onGoDate} onFire={onFire} onLatest={onLatest} />
        </TabsContent>
        <TabsContent value="map" className="min-w-0">
          <LaunchMapTab gw={gw} fire={fire} range={range} onFire={onFire} onRange={onRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
