import type { Verdict } from '../types';

const STYLES: Record<Verdict, string> = {
  Good: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30',
  Fair: 'bg-amber-500/10 text-amber-700 ring-amber-500/30',
  Bad: 'bg-rose-500/10 text-rose-700 ring-rose-500/30',
};

const DOT: Record<Verdict, string> = {
  Good: 'bg-emerald-500',
  Fair: 'bg-amber-500',
  Bad: 'bg-rose-500',
};

type Props = {
  verdict: Verdict;
  className?: string;
};

export function VerdictBadge({ verdict, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLES[verdict]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[verdict]}`} />
      {verdict}
    </span>
  );
}

export default VerdictBadge;
