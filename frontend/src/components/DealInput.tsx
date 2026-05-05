type Props = {
  value: string;
  onChange: (v: string) => void;
  onAnalyze: () => void;
  onSearch: () => void;
  loading: boolean;
};

export function DealInput({ value, onChange, onAnalyze, onSearch, loading }: Props) {
  const trimmed = value.trim();
  const disabled = loading || trimmed.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        dir="auto"
        placeholder="הכנס מודעה או מוצר..."
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
        disabled={loading}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !disabled) {
            e.preventDefault();
            onAnalyze();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Tip: paste a full listing for Analyze, or a short query for Search.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSearch}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Search
          </button>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}

export default DealInput;
