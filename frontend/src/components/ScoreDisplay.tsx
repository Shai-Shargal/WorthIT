import type { ScoreBreakdown } from '../types';

type Props = {
  score: number;
  breakdown?: ScoreBreakdown;
  className?: string;
};

export function ScoreDisplay({ score, breakdown, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-end ${className}`}>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{score}</span>
        <span className="text-sm font-medium text-slate-400">/100</span>
      </div>
      {breakdown ? (
        <div className="mt-0.5 text-[11px] font-medium text-slate-400 tabular-nums">
          price {breakdown.priceScore} × condition {breakdown.conditionScore.toFixed(2)}
        </div>
      ) : null}
    </div>
  );
}

export default ScoreDisplay;
