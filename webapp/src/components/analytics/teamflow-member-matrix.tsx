'use client';

import type { CSSProperties } from 'react';

import { TONE_TEXT, fmtEokCell, isNum, mixPctOf, toneOf, type MemberMatrix } from '@/lib/teamflow-report';
import { cn } from '@/lib/utils';

/**
 * 팀 · 거래원 순매수 행렬 표 (quick 261018-j17 · 목업 016 안 B · C-02 · C-04).
 *
 * - 열 = 구간/시각 · 팀 · 다섯 창구(members 순서 교보 · 한국 · 유진 · 신한 · NH) · 단위 억 소수 1자리 부호(`fmtEokCell`) · 모름 「—」.
 * - kind band = 등락 구간 행(상한가 가격 포함 · 마지막 「하루 합계」 = 위 구분선 · 600 · 배경 없음) ·
 *   kind bucket = 10분 행(buckets 전부 · `inWindow(key)` 참이면 첫 칸 보라 띠 — 「10분 표 보기」 와 같은 띠 문법).
 * - 배경 진하기 = **다섯 창구 칸만** 공통 눈금(`mixPctOf(v, matrix.mx)` 0~40 → `color-mix(--up|--down)`). 팀 열은 배경 없이
 *   부호 색 글자(지금 표들과 같은 문법) — 출처가 달라 한 눈금에 섞지 않는다. 다섯 창구 칸 글자는 중립 `--fg`
 *   (빨강 글자 on 빨강 틴트 대비 저하 회피 — 재량 4). `--team` 은 창 띠에만(팀 열 머리는 `--fg`).
 * - 폰 390(재량 2): 첫 열 `sticky left-0` + 래퍼 `overflow-x-auto` — 넘쳐도 페이지 가로 스크롤 0 · 라벨이 남는다.
 *   칸 패딩 `px-1.5 sm:px-2`.
 * - `@/components/ui/table` 을 쓰지 않는다(재량 3) — `.tbl-wrap` 전역 규칙이 좁은 패딩 · 칸 배경을 덮는다.
 */

const STRIPE = 'shadow-[inset_3px_0_0_var(--team)]';
const CELL = 'mono px-1.5 py-1.5 text-right whitespace-nowrap tabular-nums sm:px-2';
const STICKY = 'sticky left-0 z-[1] bg-[var(--card)]';
const MIX_BG = {
  up: 'bg-[color-mix(in_oklab,var(--up)_var(--tf-mix),transparent)]',
  down: 'bg-[color-mix(in_oklab,var(--down)_var(--tf-mix),transparent)]',
} as const;

export function TeamflowMemberMatrix({
  kind,
  matrix,
  caption,
  inWindow,
}: {
  kind: 'band' | 'bucket';
  matrix: MemberMatrix;
  caption: string;
  inWindow?: (key: number) => boolean;
}) {
  return (
    <div
      data-slot={kind === 'band' ? 'teamflow-member-band-matrix' : 'teamflow-member-bucket-matrix'}
      className="max-w-[720px] overflow-x-auto rounded-[var(--r)]"
    >
      <table className="w-full border-collapse text-[length:var(--t-caption)]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th
              scope="col"
              className={cn(STICKY, 'px-1.5 py-1.5 text-left font-semibold whitespace-nowrap text-[var(--muted-fg)] sm:px-2')}
            >
              {kind === 'band' ? '구간' : '시각'}
            </th>
            <th scope="col" className="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap text-[var(--fg)] sm:px-2">
              팀
            </th>
            {matrix.members.map((m) => (
              <th
                key={m.member}
                scope="col"
                className="px-1.5 py-1.5 text-right font-semibold whitespace-nowrap text-[var(--muted-fg)] sm:px-2"
              >
                {m.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const striped = row.key !== null && inWindow?.(row.key) === true;
            return (
              <tr
                key={row.id}
                data-row={row.id}
                className={cn(row.total && 'border-t-2 border-[var(--border-subtle)] font-semibold')}
              >
                <th
                  scope="row"
                  className={cn(
                    STICKY,
                    'px-1.5 py-1.5 text-left whitespace-nowrap sm:px-2',
                    row.key !== null && 'mono',
                    row.lim ? 'font-normal text-[var(--muted-fg)]' : row.total ? 'font-semibold' : 'font-normal',
                    !row.lim && 'text-[var(--fg)]',
                    striped && STRIPE,
                  )}
                >
                  {row.label}
                </th>
                <td
                  data-col="team"
                  className={cn(
                    CELL,
                    'font-semibold shadow-[inset_1px_0_0_var(--border-subtle),inset_-1px_0_0_var(--border-subtle)]',
                    isNum(row.team) ? TONE_TEXT[toneOf(row.team)] : 'text-[var(--faint)]',
                  )}
                >
                  {fmtEokCell(row.team)}
                </td>
                {matrix.members.map((m, i) => {
                  const v = row.cells[i] ?? null;
                  if (!isNum(v)) {
                    return (
                      <td key={m.member} data-col={m.member} className={cn(CELL, 'text-[var(--faint)]')}>
                        —
                      </td>
                    );
                  }
                  const tone = toneOf(v);
                  const p = !row.total && tone !== 'flat' ? mixPctOf(v, matrix.mx) : 0;
                  return (
                    <td
                      key={m.member}
                      data-col={m.member}
                      data-tone={tone}
                      data-mix={p > 0 ? p : undefined}
                      style={p > 0 ? ({ '--tf-mix': `${p}%` } as CSSProperties) : undefined}
                      className={cn(
                        CELL,
                        tone === 'flat' ? 'text-[var(--fg-2)]' : 'text-[var(--fg)]',
                        p > 0 && tone !== 'flat' && MIX_BG[tone],
                      )}
                    >
                      {fmtEokCell(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
