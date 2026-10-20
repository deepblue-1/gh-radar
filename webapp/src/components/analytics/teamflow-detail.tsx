'use client';

import type { TeamflowRow } from '@gh-radar/shared';

import { windowKeyTestOf } from '@/lib/teamflow-chart';
import {
  factLineOf,
  memberBandMatrixOf,
  memberBucketMatrixOf,
  memberFlowOf,
  summaryPartsOf,
} from '@/lib/teamflow-report';

import { TeamflowBandChart } from './teamflow-band-chart';
import { TeamflowBandTable } from './teamflow-band-table';
import { TeamflowBucketChart } from './teamflow-bucket-chart';
import { TeamflowBucketTable } from './teamflow-bucket-table';
import { TeamflowMemberMatrix } from './teamflow-member-matrix';
import { TeamflowMembers } from './teamflow-members';
import { TeamflowToggle } from './teamflow-toggle';

/**
 * 판정 기준 본문(UI-SPEC 「판정 기준 본문」 하드코딩 — gh-trade team-flow.md §3 · §4 · §5 · §10 요약). 문구를 고치지 않는다.
 */
const SUBHEAD = 'm-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]';
const CAPTION = 'text-[length:var(--t-caption)] text-[var(--muted-fg)]';

const RULES = [
  '팀 = 교보 · 한국 · 유진 · 신한 · NH 다섯 창구.',
  '팀 주문 = 들어와서 친 주문 중 ① 한 가격에 체결 조각이 2개 이상(자전거래방지) ② 매도 · 매수호가 0/0 조각 하나로 끝난 체결. 0/0 조각 뒤 200µs 안 같은 방향 조각은 한 주문으로 묶는다. 단일가 체결은 방향 분류에서 뺀다.',
  '구간 = 체결가의 기준가 대비 등락률(정수 경계 — 정확히 +20% 는 20~25% 에 든다). 상한가 가격 체결은 팀 매수 · 매도를 따로 보이고 순매수와 하루 합계에서 뺀다.',
  '매수 중 팀 = 그 구간(또는 10분) 매수주도 체결 중 팀 주문 비중(주 기준).',
  '거래원 = 마지막 거래원 집계 시점의 창구 누적 — 일반 고객이 섞인 창구 전체 수치다.',
  '호가에 걸어 두고 받아낸 팀 체결은 보이지 않아 팀 수치는 최소치다. KRX 정규장만 본다(넥스트레이드 제외).',
] as const;

/**
 * 팀 매집 펼친 상세 (Phase 33 · UI-SPEC T5 — 요약 블록 · D-14).
 *
 * - 루트 `section#tf-{isin}` · `aria-labelledby` = 행 버튼 id(`labelledBy` — 부모 DayGrid 가 `teamflowRowButtonId` 로 준다 ·
 *   import 순환을 피하려 prop 으로 받는다) · 열린 행 바로 아래에만 마운트된다(접으면 언마운트).
 * - 요약 상자: `summary_lines` 번호 목록(1~N · export 순서 · 개수 제한 없음 — 상자가 세로로 늘어난다) → 사실 줄.
 *   문장은 HTML 문자열을 주입하지 않고 `summaryPartsOf` 조각 배열을 React 요소로 그린다(`<b>` 짝만 strong).
 *   summary_lines 가 비면 번호 목록 없이 사실 줄만, 사실 줄도 없으면 상자를 그리지 않는다.
 * - 요약 다음 = [구간 가로 막대 | 다섯 창구 거래원] 2열(`grid gap-4 xl:grid-cols-2` · < xl 1열 — D-14 · UI-SPEC T6 · T7).
 *   구간 차트 아래 8px 「구간표 보기」 접힘 표.
 * - 상세 맨 아래 「판정 기준」 접힘(UI-SPEC T9 — 6항목 + 출처 줄). 세 토글 모두 기본 접힘 · 서로 독립 · 행을 접으면 초기화.
 * - (quick 261018-j17) 새 키 `payload.member_flow` 가 있을 때만 2열 바로 아래 「등락 구간별 팀 · 거래원 순매수」 블록
 *   (`teamflow-member-flow` — 소제목 · 경고(거래원 = 창구 전체 추정 · 더해도 팀 순매수 아님 · 상위 5 밖 = 모름) · 구간 행렬 ·
 *   캡션 · 「10분 거래원 표 보기」 접힘 행렬 — buckets 전부 · 창 띠). 경고가 두 행렬 앞에 한 번 오도록 출처(거래원)별로 묶었다(목업 016 안 B). 옛 행 = 블록 없음(C-07).
 * - 2열 아래 전폭 = 10분 흐름 블록(UI-SPEC T8 · D-13 — 39칸 고정축 차트 · 세로 블록 사이 16px) → 8px 「10분 표 보기」 접힘 표.
 */
export function TeamflowDetail({ row, labelledBy }: { row: TeamflowRow; labelledBy: string }) {
  const lines = row.payload?.summary_lines ?? [];
  const fact = factLineOf(row);
  const hasSummary = lines.length > 0 || fact !== null;
  const name = row.name ?? row.short_code ?? row.isin;
  const flow = memberFlowOf(row.payload);

  return (
    <section
      id={`tf-${row.isin}`}
      aria-labelledby={labelledBy}
      data-slot="teamflow-detail"
      className="flex flex-col gap-4 px-2 pt-1 pb-6"
    >
      {hasSummary && (
        <div
          data-slot="teamflow-summary"
          className="rounded-[var(--r)] bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] px-3.5 py-3 break-keep"
        >
          {lines.length > 0 && (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {lines.map((line, i) => (
                <li key={i} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
                  <span
                    aria-hidden="true"
                    className="mono mt-0.5 grid size-5 place-items-center rounded-full bg-[var(--muted)] text-[11px] font-semibold text-[var(--fg-2)]"
                  >
                    {i + 1}
                  </span>
                  <p className="m-0 text-[length:var(--t-sm)] text-[var(--fg-2)]">
                    {summaryPartsOf(line).map((p, k) =>
                      p.strong ? (
                        <strong key={k} className="font-semibold text-[var(--fg)]">
                          {p.text}
                        </strong>
                      ) : (
                        <span key={k}>{p.text}</span>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {fact !== null && (
            <p
              data-slot="teamflow-fact"
              className={`mono m-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]${lines.length > 0 ? ' mt-1' : ''}`}
            >
              {fact}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div data-slot="teamflow-bands" className="min-w-0">
          <TeamflowBandChart
            name={row.name ?? row.short_code ?? row.isin}
            bands={row.payload?.bands ?? []}
            below20={row.below20_net_val}
            above20={row.above20_net_val}
          />
          <div className="mt-2">
            <TeamflowToggle label="구간표 보기" tone="accent">
              <TeamflowBandTable bands={row.payload?.bands ?? []} />
            </TeamflowToggle>
          </div>
        </div>
        <div className="min-w-0">
          <TeamflowMembers members={row.payload?.members ?? null} memberFlow={flow} />
        </div>
      </div>

      {flow !== null && (
        <div data-slot="teamflow-member-flow" className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <h3 className={SUBHEAD}>등락 구간별 팀 · 거래원 순매수</h3>
            <span className={CAPTION}>단위 억 · 하루 합계 = 상한가 가격 제외</span>
          </div>
          <p
            data-slot="teamflow-member-warn"
            className="m-0 rounded-[var(--r)] bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] px-3 py-2 text-[length:var(--t-caption)] text-[var(--fg-2)] break-keep"
          >
            <strong className="font-semibold text-[var(--fg)]">거래원 숫자 = 그 창구 전체</strong>(일반 고객 포함)의
            순매수다. 거래소가 1분마다 주는 거래원 상위 5 누적을 창구별로 빼서, 그 1분 체결량 비례로 구간 · 10분에 나눈
            추정이다. 팀 숫자(체결 모양으로 찾은 팀 주문)와는 출처가 달라{' '}
            <strong className="font-semibold text-[var(--fg)]">다섯 창구를 더해도 팀 순매수가 되지 않는다.</strong> 그 1분
            동안 상위 5 밖이면 「모름」.
          </p>
          <div className="mt-2">
            <TeamflowMemberMatrix
              kind="band"
              matrix={memberBandMatrixOf(row.payload?.bands ?? [], flow)}
              caption={`${name} 등락 구간별 팀 · 거래원 순매수(억)`}
            />
          </div>
          <p className="m-0 mt-1 text-[length:var(--t-caption)] text-[var(--muted-fg)] break-keep">
            색 진하기 = 다섯 창구 안에서 크기 · 팀 열은 색 없음(출처가 달라 한 눈금에 섞지 않는다) · 「—」 = 모름
          </p>
          <div className="mt-2">
            <TeamflowToggle label="10분 거래원 표 보기" tone="accent">
              <p className="m-0 mb-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {row.payload?.window ? '단위 억 · 왼쪽 띠 = 팀 최대 매집 창' : '단위 억'}
              </p>
              <TeamflowMemberMatrix
                kind="bucket"
                matrix={memberBucketMatrixOf(row.payload?.buckets ?? [], flow)}
                inWindow={windowKeyTestOf(row.payload?.window ?? null)}
                caption={`${name} 10분 팀 · 거래원 순매수(억)`}
              />
            </TeamflowToggle>
          </div>
        </div>
      )}

      <div data-slot="teamflow-buckets" className="min-w-0">
        <TeamflowBucketChart
          name={row.name ?? row.short_code ?? row.isin}
          buckets={row.payload?.buckets ?? []}
          window={row.payload?.window ?? null}
          firstLimitMs={row.first_limit_ms}
        />
        <div className="mt-2">
          <TeamflowToggle label="10분 표 보기" tone="accent">
            <TeamflowBucketTable buckets={row.payload?.buckets ?? []} window={row.payload?.window ?? null} />
          </TeamflowToggle>
        </div>
      </div>

      <div data-slot="teamflow-rules">
        <TeamflowToggle label="판정 기준" tone="muted">
          <ul className="m-0 list-disc space-y-1 pl-4 text-[length:var(--t-caption)] text-[var(--muted-fg)] break-keep">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            출처: gh-trade 팀 매집 분석 규칙
          </p>
        </TeamflowToggle>
      </div>
    </section>
  );
}
