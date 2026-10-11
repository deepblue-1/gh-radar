// 공통 렌더링 헬퍼 — 목업 간 Table/Card 마크업 일관 유지
window.Scanner = (function () {
  const fmtPrice = (n) => n.toLocaleString('ko-KR');
  const fmtVol = (n) => {
    if (n >= 1e8) return (n / 1e8).toFixed(1) + '억';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '만';
    return n.toLocaleString('ko-KR');
  };
  const fmtRate = (r) => {
    const s = (r >= 0 ? '+' : '') + r.toFixed(2) + '%';
    return s;
  };
  const cls = (r) => (r > 0 ? 'up' : r < 0 ? 'down' : 'flat');
  const arrow = (r) => (r > 0 ? '▲' : r < 0 ? '▼' : '·');

  function filter(rows, minRate, market) {
    return rows.filter(
      (r) => r.rate >= minRate && (market === 'ALL' || r.market === market)
    );
  }

  function renderTable(container, rows) {
    container.innerHTML = `
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 26%">종목</th>
              <th style="width: 10%">코드</th>
              <th style="width: 10%">마켓</th>
              <th class="num" style="width: 14%">현재가</th>
              <th class="num" style="width: 16%">등락률</th>
              <th class="num" style="width: 24%">거래량</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr tabindex="0" aria-label="${r.name} 상세 보기">
                <td style="font-weight:500">${r.name}</td>
                <td class="mono text-muted text-caption">${r.code}</td>
                <td><span class="badge ${r.market === 'KOSPI' ? '' : 'badge-outline'}">${r.market}</span></td>
                <td class="num mono">${fmtPrice(r.price)}</td>
                <td class="num mono text-${cls(r.rate)}" style="font-weight:600">
                  ${arrow(r.rate)} ${fmtRate(r.rate)}
                </td>
                <td class="num mono text-muted text-sm">${fmtVol(r.volume)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCards(container, rows) {
    container.innerHTML = rows
      .map(
        (r) => `
        <article class="card" style="display:flex; align-items:center; justify-content:space-between; gap:var(--s-3); padding:var(--s-3) var(--s-4);" tabindex="0">
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:var(--s-2);">
              <span style="font-weight:600;">${r.name}</span>
              <span class="badge ${r.market === 'KOSPI' ? '' : 'badge-outline'}">${r.market}</span>
            </div>
            <div class="text-caption text-muted mono">${r.code}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div class="mono" style="font-weight:600;">${fmtPrice(r.price)}</div>
            <div class="mono text-${cls(r.rate)}" style="font-weight:600; font-size:var(--t-sm);">
              ${arrow(r.rate)} ${fmtRate(r.rate)}
            </div>
            <div class="mono text-caption text-muted">${fmtVol(r.volume)}</div>
          </div>
        </article>`
      )
      .join('');
  }

  function wireFilters({ sliderEl, valueEl, marketEls, onChange }) {
    let min = parseFloat(sliderEl.value);
    let market = 'ALL';
    const emit = () => onChange({ min, market });
    sliderEl.addEventListener('input', () => {
      min = parseFloat(sliderEl.value);
      if (valueEl) valueEl.textContent = min.toFixed(0) + '%';
      emit();
    });
    marketEls.forEach((btn) => {
      btn.addEventListener('click', () => {
        marketEls.forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        market = btn.dataset.market;
        emit();
      });
    });
    if (valueEl) valueEl.textContent = min.toFixed(0) + '%';
    emit();
  }

  return { filter, renderTable, renderCards, wireFilters, fmtPrice, fmtVol, fmtRate, cls, arrow };
})();
