import type { ConditionLabel, ScoreBreakdown, Verdict } from '../types';
import { ScoreDisplay } from './ScoreDisplay';
import { VerdictBadge } from './VerdictBadge';

const CONDITION_STYLES: Record<ConditionLabel, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  good: 'bg-sky-50 text-sky-700 ring-sky-200',
  fair: 'bg-amber-50 text-amber-700 ring-amber-200',
  poor: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export type ResultCardProps = {
  title: string;
  price: number;
  currency?: string;
  score: number;
  verdict: Verdict;
  condition?: { label: ConditionLabel; signals: string[] };
  breakdown?: ScoreBreakdown;
  image?: string;
  url?: string;
  source?: string;
  location?: string;
  explanation?: string;
};

function formatPrice(price: number, currency?: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪';
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(price);
  return `${symbol}${formatted}`;
}

export function ResultCard({
  title,
  price,
  currency,
  score,
  verdict,
  condition,
  breakdown,
  image,
  url,
  source,
  location,
  explanation,
}: ResultCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition animate-fade-in hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
      {image ? (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          {source ? (
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
              {source}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold text-slate-900" title={title}>
              {title}
            </h3>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-900">{formatPrice(price, currency)}</span>
              {location ? <span className="truncate text-xs text-slate-400">{location}</span> : null}
            </div>
          </div>
          <ScoreDisplay score={score} breakdown={breakdown} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={verdict} />
          {condition ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${CONDITION_STYLES[condition.label]}`}
            >
              {condition.label}
            </span>
          ) : null}
        </div>

        {condition && condition.signals.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {condition.signals.slice(0, 6).map((signal) => (
              <span
                key={signal}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {signal}
              </span>
            ))}
          </div>
        ) : null}

        {explanation ? (
          <p className="text-sm leading-relaxed text-slate-600">{explanation}</p>
        ) : null}

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            View listing
            <span aria-hidden>→</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default ResultCard;
