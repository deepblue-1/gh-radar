'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useCmdKShortcut } from '@/hooks/use-cmdk-shortcut';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { SearchTrigger } from './search-trigger';

/**
 * GlobalSearch — ⌘K CommandDialog (Phase 6 SRCH-01/02).
 *
 * - SearchTrigger(헤더 readonly input) + CommandDialog 통합 컴포넌트
 * - `shouldFilter={false}` 는 CommandDialog 가 직접 받지 못하므로 내부 `<Command>` 로 래핑
 *   하여 cmdk 가 서버 결과를 그대로 표시하도록 강제 (Pitfall 2)
 * - CommandItem `value={stock.code}` — 서버 name.ilike OR code.ilike 결과의 키 충돌 방지
 * - 선택 시 router.push + setOpen(false) + setQuery('')
 * - 로딩/빈/에러/초기 카피는 06-UI-SPEC §"Copywriting Contract" 정확 문자열
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { results, loading, error } = useDebouncedSearch(query, 300);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  useCmdKShortcut(toggle);

  const handleSelect = useCallback(
    (code: string) => {
      setOpen(false);
      setQuery('');
      router.push(`/stocks/${code}`);
    },
    [router],
  );

  const trimmed = query.trim();
  const showInitial = trimmed.length === 0;
  const showEmpty = !loading && !error && trimmed.length > 0 && results.length === 0;

  return (
    <>
      <SearchTrigger onClick={toggle} />
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="종목명 또는 종목코드를 입력하세요"
          />
          <CommandList>
            {showInitial && (
              <CommandEmpty>검색어를 입력하면 결과가 표시됩니다</CommandEmpty>
            )}
            {loading && (
              <div className="px-3 py-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                검색 중…
              </div>
            )}
            {error && (
              <div className="px-3 py-2 text-[length:var(--t-sm)] text-[var(--destructive)]">
                검색에 실패했습니다. 잠시 후 다시 시도해 주세요.
              </div>
            )}
            {showEmpty && (
              <CommandEmpty>&quot;{query}&quot; 에 해당하는 종목이 없습니다</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((s) => (
                  <CommandItem
                    key={s.code}
                    value={s.code}
                    onSelect={() => handleSelect(s.code)}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <span className="flex-1 text-[length:var(--t-sm)]">{s.name}</span>
                    <span className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                      {s.code}
                    </span>
                    <Badge variant="outline">{s.market}</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
