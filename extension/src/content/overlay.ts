import type { AnalyzeProductResponse, Verdict } from '../../../shared/types/index.js';

const OVERLAY_ID = 'worthit-overlay';

const VERDICT_COLORS: Record<Verdict, string> = {
  worth_it: '#22c55e',
  maybe: '#f59e0b',
  avoid: '#ef4444',
};

const VERDICT_LABELS: Record<Verdict, string> = {
  worth_it: 'Worth it',
  maybe: 'Maybe',
  avoid: 'Avoid',
};

function styleEl(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (styles) styleEl(node, styles);
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildShell(): { root: HTMLDivElement; body: HTMLDivElement; subheader: HTMLDivElement } {
  const root = el('div');
  root.id = OVERLAY_ID;
  styleEl(root, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    width: '380px',
    maxHeight: '78vh',
    overflow: 'auto',
    background: '#ffffff',
    color: '#0f172a',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
    font: '14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
    zIndex: '2147483647',
    padding: '12px',
    boxSizing: 'border-box',
  });

  const header = el('div');
  styleEl(header, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  });
  const titleWrap = el('div');
  styleEl(titleWrap, { display: 'flex', alignItems: 'center', gap: '8px' });

  const dot = el('div');
  styleEl(dot, {
    width: '20px',
    height: '20px',
    borderRadius: '6px',
    background: '#0f172a',
    color: '#ffffff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '700',
  });
  dot.textContent = 'W';

  const title = el('div', { fontWeight: '700', fontSize: '14px' }, 'WorthIT');

  titleWrap.appendChild(dot);
  titleWrap.appendChild(title);

  const close = el('button', {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '18px',
    lineHeight: '1',
    padding: '4px 8px',
    color: '#64748b',
    borderRadius: '6px',
  });
  close.textContent = '×';
  close.title = 'Close';
  close.addEventListener('mouseenter', () => (close.style.background = '#f1f5f9'));
  close.addEventListener('mouseleave', () => (close.style.background = 'transparent'));
  close.addEventListener('click', () => removeOverlay());

  header.appendChild(titleWrap);
  header.appendChild(close);

  const subheader = el('div', {
    fontSize: '11px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: '600',
    marginBottom: '8px',
  });

  const body = el('div');
  styleEl(body, { display: 'flex', flexDirection: 'column', gap: '10px' });

  root.appendChild(header);
  root.appendChild(subheader);
  root.appendChild(body);

  return { root, body, subheader };
}

function removeOverlay(): void {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
}

function spinner(): HTMLDivElement {
  const wrap = el('div');
  styleEl(wrap, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '24px 0',
    color: '#64748b',
  });
  const ring = el('div');
  styleEl(ring, {
    width: '18px',
    height: '18px',
    border: '2px solid #cbd5e1',
    borderTopColor: '#0f172a',
    borderRadius: '50%',
    animation: 'worthitSpin 0.9s linear infinite',
  });
  ensureKeyframes();
  const label = el('div', { fontSize: '13px' }, 'Asking the AI…');
  wrap.appendChild(ring);
  wrap.appendChild(label);
  return wrap;
}

function ensureKeyframes(): void {
  if (document.getElementById('worthit-overlay-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'worthit-overlay-keyframes';
  style.textContent = '@keyframes worthitSpin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

function formatMoney(price: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${Math.round(price)}`;
  }
}

function buildBullets(items: string[], color: string): HTMLDivElement {
  const list = el('div');
  styleEl(list, {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  });
  for (const item of items.slice(0, 5)) {
    const row = el('div');
    styleEl(row, {
      fontSize: '11px',
      color,
      paddingLeft: '10px',
      position: 'relative',
    });
    row.textContent = `• ${item}`;
    list.appendChild(row);
  }
  return list;
}

function buildConfidenceBar(confidence: number): HTMLDivElement {
  const wrap = el('div');
  styleEl(wrap, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    color: '#64748b',
  });
  const label = el('span', undefined, `Confidence ${Math.round(confidence * 100)}%`);
  const track = el('div');
  styleEl(track, {
    flex: '1 1 auto',
    height: '4px',
    background: '#e2e8f0',
    borderRadius: '999px',
    overflow: 'hidden',
  });
  const fill = el('div');
  styleEl(fill, {
    width: `${Math.max(0, Math.min(100, Math.round(confidence * 100)))}%`,
    height: '100%',
    background: '#0f172a',
  });
  track.appendChild(fill);
  wrap.appendChild(label);
  wrap.appendChild(track);
  return wrap;
}

function buildResultCard(item: AnalyzeProductResponse): HTMLElement {
  const { listing, verdict, reasoning, localMarketContext } = item;

  const wrapper = listing.url ? el('a') : el('div');
  if (wrapper instanceof HTMLAnchorElement && listing.url) {
    wrapper.href = listing.url;
    wrapper.target = '_blank';
    wrapper.rel = 'noreferrer';
  }
  styleEl(wrapper as HTMLElement, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    background: '#ffffff',
    textDecoration: 'none',
    color: '#0f172a',
    transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
  });
  (wrapper as HTMLElement).addEventListener('mouseenter', () => {
    (wrapper as HTMLElement).style.borderColor = '#cbd5e1';
    (wrapper as HTMLElement).style.boxShadow = '0 4px 14px rgba(15,23,42,0.06)';
  });
  (wrapper as HTMLElement).addEventListener('mouseleave', () => {
    (wrapper as HTMLElement).style.borderColor = '#e2e8f0';
    (wrapper as HTMLElement).style.boxShadow = 'none';
  });

  // Top row: image + title/price + recommendation pill
  const top = el('div');
  styleEl(top, { display: 'flex', alignItems: 'center', gap: '10px' });

  if (listing.imageUrl) {
    const img = el('img');
    styleEl(img, {
      width: '40px',
      height: '40px',
      borderRadius: '8px',
      objectFit: 'cover',
      flex: '0 0 auto',
      background: '#f1f5f9',
    });
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = listing.imageUrl;
    top.appendChild(img);
  }

  const info = el('div');
  styleEl(info, { flex: '1 1 auto', minWidth: '0' });
  const titleEl = el(
    'div',
    {
      fontSize: '13px',
      fontWeight: '600',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    listing.title,
  );
  const priceLine = el(
    'div',
    {
      fontSize: '12px',
      color: '#475569',
      marginTop: '2px',
    },
    formatMoney(listing.price, listing.currency ?? 'USD'),
  );
  info.appendChild(titleEl);
  info.appendChild(priceLine);
  top.appendChild(info);

  const pill = el(
    'span',
    {
      display: 'inline-block',
      padding: '3px 9px',
      borderRadius: '999px',
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: '#ffffff',
      background: VERDICT_COLORS[verdict.verdict],
      flex: '0 0 auto',
    },
    VERDICT_LABELS[verdict.verdict],
  );
  top.appendChild(pill);

  wrapper.appendChild(top);

  wrapper.appendChild(
    el(
      'div',
      { fontSize: '11px', color: '#64748b', marginTop: '2px' },
      `Worth rating ${verdict.worthRating}/5 · ${verdict.confidenceLevel}`,
    ),
  );

  // Summary
  const summary = el(
    'div',
    {
      fontSize: '12px',
      color: '#334155',
      lineHeight: '1.45',
    },
    reasoning.summary,
  );
  wrapper.appendChild(summary);

  // Positives + concerns
  if (reasoning.positives.length > 0) {
    wrapper.appendChild(buildBullets(reasoning.positives, '#15803d'));
  }
  if (reasoning.concerns.length > 0) {
    wrapper.appendChild(buildBullets(reasoning.concerns, '#b91c1c'));
  }

  if (verdict.estimatedValue) {
    const ev = verdict.estimatedValue;
    const evLine = el(
      'div',
      {
        fontSize: '11px',
        color: '#475569',
      },
      `Estimated value: ${formatMoney(ev.min, ev.currency)} – ${formatMoney(ev.max, ev.currency)}`,
    );
    wrapper.appendChild(evLine);
  }

  // Local market footer
  if (localMarketContext.typicalPrice) {
    const t = localMarketContext.typicalPrice;
    const ctx = el(
      'div',
      {
        fontSize: '10px',
        color: '#94a3b8',
      },
      `Local p50 ${formatMoney(t.p50, localMarketContext.currency)} · ${localMarketContext.observationCount} observations`,
    );
    wrapper.appendChild(ctx);
  }

  wrapper.appendChild(buildConfidenceBar(verdict.confidence));

  return wrapper as HTMLElement;
}

function buildEmpty(message: string): HTMLDivElement {
  const wrap = el('div', {
    padding: '20px 12px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13px',
    border: '1px dashed #cbd5e1',
    borderRadius: '10px',
    background: '#f8fafc',
  }, message);
  return wrap;
}

function buildError(message: string, onRetry: () => void): HTMLElement {
  const wrap = el('div');
  styleEl(wrap, {
    padding: '12px',
    borderRadius: '10px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  });

  const title = el('div', { fontWeight: '700', fontSize: '13px' }, 'Something went wrong');
  const detail = el('div', { fontSize: '12px' }, message);

  const retry = el('button', {
    alignSelf: 'flex-start',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '600',
    background: '#ffffff',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    cursor: 'pointer',
  }, 'Retry');
  retry.addEventListener('click', onRetry);

  wrap.appendChild(title);
  wrap.appendChild(detail);
  wrap.appendChild(retry);

  return wrap;
}

export interface OverlayHandle {
  showLoading(title: string): void;
  showResult(response: AnalyzeProductResponse): void;
  showError(message: string, onRetry: () => void): void;
  remove(): void;
}

export function mountOverlay(): OverlayHandle {
  removeOverlay();
  const { root, body, subheader } = buildShell();
  document.documentElement.appendChild(root);

  function clearBody(): void {
    body.replaceChildren();
  }

  function setSubheader(text: string): void {
    subheader.textContent = text;
  }

  return {
    showLoading(title) {
      clearBody();
      setSubheader(`Analyzing "${title}"`);
      body.appendChild(spinner());
    },
    showResult(response) {
      clearBody();
      setSubheader('Analysis complete');
      body.appendChild(buildResultCard(response));
    },
    showError(message, onRetry) {
      clearBody();
      setSubheader('Error');
      body.appendChild(buildError(message, onRetry));
    },
    remove() {
      removeOverlay();
    },
  };
}
