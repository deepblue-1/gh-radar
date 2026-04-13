'use client';

/**
 * Components Section — UI-SPEC §3, §8.5.1 (DensityProvider Before/After)
 *
 * 9(+1) 컴포넌트 × variant × state. Slider/Sheet/Tooltip/DensityProvider 인터랙티브
 * 때문에 전체 섹션을 client boundary 로 둔다.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Number } from '@/components/ui/number';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DensityProvider, type Density } from '@/components/providers/density-provider';
import { useState } from 'react';

const SAMPLE_ROWS = [
  { code: '005930', name: '삼성전자', price: 72400, rate: 0.0325, vol: 12483000 },
  { code: '000660', name: 'SK하이닉스', price: 198500, rate: 0.0412, vol: 3504200 },
  { code: '035420', name: '네이버', price: 212500, rate: -0.012, vol: 874000 },
  { code: '035720', name: '카카오', price: 47850, rate: 0.0098, vol: 2150300 },
  { code: '005380', name: '현대차', price: 254000, rate: 0, vol: 412000 },
  { code: '051910', name: 'LG화학', price: 378500, rate: -0.0234, vol: 215000 },
  { code: '006400', name: '삼성SDI', price: 412000, rate: 0.0187, vol: 310000 },
  { code: '207940', name: '삼성바이오', price: 892000, rate: 0.0056, vol: 98000 },
  { code: '068270', name: '셀트리온', price: 178500, rate: -0.0082, vol: 540000 },
  { code: '105560', name: 'KB금융', price: 78200, rate: 0.014, vol: 1240000 },
];

function DensityTablePreview({ density }: { density: Density }) {
  return (
    <DensityProvider value={density}>
      <div className="rounded-[var(--r-md)] border border-[var(--border)] p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>종목</TableHead>
              <TableHead className="text-right">가격</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_ROWS.slice(0, 4).map((r) => (
              <TableRow key={r.code}>
                <TableCell>
                  <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                    {r.code}
                  </span>{' '}
                  {r.name}
                </TableCell>
                <TableCell className="num">
                  <Number value={r.price} format="price" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DensityProvider>
  );
}

export function ComponentsSection() {
  const [sliderValue, setSliderValue] = useState<number[]>([25]);

  return (
    <TooltipProvider>
      <section className="space-y-8">
        <div>
          <h2 id="components" className="scroll-mt-20 text-[length:var(--t-h2)] font-bold">
            4. Components
          </h2>
          <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            Button / Card / Table / Badge / Input / Skeleton / Slider / Separator / Tooltip / Sheet
            (+ DensityProvider Before/After).
          </p>
        </div>

        {/* Button */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Button · 5 variant × 3 size</h3>
          <div className="space-y-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            {(['sm', 'default', 'lg'] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-2">
                <div className="mono w-20 shrink-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  {size}
                </div>
                <Button size={size} variant="default">Primary</Button>
                <Button size={size} variant="secondary">Secondary</Button>
                <Button size={size} variant="outline">Outline</Button>
                <Button size={size} variant="ghost">Ghost</Button>
                <Button size={size} variant="destructive">Delete</Button>
                <Button size={size} disabled>Disabled</Button>
              </div>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Card · default / plain</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card variant="default">
              <CardHeader>
                <CardTitle>default · 3층 shadow</CardTitle>
                <CardDescription>Inner highlight + near + far (UI-SPEC §8.5.4)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-[length:var(--t-sm)]">
                  상단 inner highlight 로 3D 감각, 매우 연한 ambient shadow.
                </p>
              </CardContent>
            </Card>
            <Card variant="plain">
              <CardHeader>
                <CardTitle>plain · shadow 없음</CardTitle>
                <CardDescription>밀집 레이아웃에서 겹침 많을 때</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-[length:var(--t-sm)]">Border 만 유지. 테이블 옆 사이드 패널 등.</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Table (10행 샘플) */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Table · 10 rows (실데이터 mock)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>종목코드</TableHead>
                <TableHead>종목명</TableHead>
                <TableHead className="text-right">가격</TableHead>
                <TableHead className="text-right">등락률</TableHead>
                <TableHead className="text-right">거래량</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SAMPLE_ROWS.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="num">
                    <Number value={r.price} format="price" />
                  </TableCell>
                  <TableCell className="num">
                    <Number value={r.rate} format="percent" showSign withColor />
                  </TableCell>
                  <TableCell className="num">
                    <Number value={r.vol} format="plain" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Badge */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Badge · 6 variant</h3>
          <div className="flex flex-wrap gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <Badge variant="default">default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="up">+3.25%</Badge>
            <Badge variant="down">-1.20%</Badge>
            <Badge variant="flat">0.00%</Badge>
            <Badge variant="outline">KOSPI</Badge>
            <Badge variant="secondary">KOSDAQ</Badge>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Input · 정상 / error / disabled</h3>
          <div className="grid grid-cols-1 gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">정상</label>
              <Input placeholder="종목명 검색" />
            </div>
            <div className="space-y-1">
              <label className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">error (aria-invalid)</label>
              <Input aria-invalid="true" defaultValue="잘못된 값" />
            </div>
            <div className="space-y-1">
              <label className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">disabled</label>
              <Input disabled defaultValue="비활성" />
            </div>
          </div>
        </div>

        {/* Skeleton */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Skeleton · stagger 3행 (.skeleton-list)</h3>
          <div className="skeleton-list space-y-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>

        {/* Slider */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">
            Slider · Phase 5 SCAN-02 (min=10, max=29, step=1, default=25)
          </h3>
          <div className="flex items-center gap-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <Slider
              value={sliderValue}
              onValueChange={setSliderValue}
              min={10}
              max={29}
              step={1}
              className="max-w-sm"
            />
            <span className="slider-val">{sliderValue[0]}%</span>
          </div>
        </div>

        {/* Separator */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Separator · horizontal / vertical</h3>
          <div className="space-y-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <div>위</div>
            <Separator />
            <div>아래</div>
            <div className="flex items-center gap-3 pt-2">
              <span>왼쪽</span>
              <Separator orientation="vertical" className="h-6" />
              <span>가운데</span>
              <Separator orientation="vertical" className="h-6" />
              <span>오른쪽</span>
            </div>
          </div>
        </div>

        {/* Tooltip */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Tooltip · 호버 지연 700ms</h3>
          <div className="flex gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>시세는 약 15초 지연될 수 있습니다</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">Info</Button>
              </TooltipTrigger>
              <TooltipContent>종목코드 005930 · 삼성전자</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Sheet */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">Sheet · Drawer 트리거</h3>
          <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">Drawer 열기</Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(280px,85vw)]">
                <SheetHeader>
                  <SheetTitle>네비게이션</SheetTitle>
                  <SheetDescription>Mobile AppShell 사이드바 샘플</SheetDescription>
                </SheetHeader>
                <div className="p-[var(--s-4)] text-[length:var(--t-sm)]">
                  <ul className="space-y-2">
                    <li>· 스캐너</li>
                    <li>· 관심 종목</li>
                    <li>· 설정</li>
                  </ul>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* DensityProvider Before/After */}
        <div className="space-y-3">
          <h3 className="text-[length:var(--t-h4)] font-semibold">
            DensityProvider · compact / default / comfortable (§8.5.1)
          </h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="space-y-2">
              <div className="mono text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                compact · row-h 32px
              </div>
              <DensityTablePreview density="compact" />
            </div>
            <div className="space-y-2">
              <div className="mono text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                default · row-h 36px
              </div>
              <DensityTablePreview density="default" />
            </div>
            <div className="space-y-2">
              <div className="mono text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                comfortable · row-h 44px
              </div>
              <DensityTablePreview density="comfortable" />
            </div>
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
