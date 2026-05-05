import { useCallback, useState } from 'react';
import { analyzeDeal } from './api/analyze';
import { searchDeals } from './api/search';
import type { AnalyzeResponse, SearchResponse } from './types';
import { DealInput } from './components/DealInput';
import { Loader } from './components/Loader';
import { ResultCard } from './components/ResultCard';
import { ResultsList } from './components/ResultsList';

type Mode =
  | { kind: 'idle' }
  | { kind: 'loading'; intent: 'analyze' | 'search' }
  | { kind: 'error'; message: string; intent: 'analyze' | 'search' }
  | { kind: 'analyze'; data: AnalyzeResponse }
  | { kind: 'search'; data: SearchResponse };

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function App() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });

  const isLoading = mode.kind === 'loading';

  const runAnalyze = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setMode({ kind: 'loading', intent: 'analyze' });
    try {
      const data = await analyzeDeal(text);
      setMode({ kind: 'analyze', data });
    } catch (e) {
      setMode({
        kind: 'error',
        intent: 'analyze',
        message: e instanceof Error ? e.message : 'Something went wrong',
      });
    }
  }, [input]);

  const runSearch = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setMode({ kind: 'loading', intent: 'search' });
    try {
      const data = await searchDeals(text);
      setMode({ kind: 'search', data });
    } catch (e) {
      setMode({
        kind: 'error',
        intent: 'search',
        message: e instanceof Error ? e.message : 'Something went wrong',
      });
    }
  }, [input]);

  const retry = useCallback(() => {
    if (mode.kind !== 'error') return;
    if (mode.intent === 'analyze') void runAnalyze();
    else void runSearch();
  }, [mode, runAnalyze, runSearch]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
              W
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">WorthIT</h1>
          </div>
          <p className="text-sm text-slate-500">
            AI-powered second-hand deal evaluator. Paste a listing or search a product to score it
            against the market.
          </p>
        </header>

        <DealInput
          value={input}
          onChange={setInput}
          onAnalyze={runAnalyze}
          onSearch={runSearch}
          loading={isLoading}
        />

        <section className="flex flex-col gap-4" aria-live="polite">
          {mode.kind === 'loading' && (
            <Loader label={mode.intent === 'analyze' ? 'Analyzing listing…' : 'Searching marketplaces…'} />
          )}

          {mode.kind === 'error' && (
            <div className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="font-semibold">Something went wrong</div>
              <div>{mode.message}</div>
              <div>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {mode.kind === 'analyze' && (
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Market median {mode.data.product.currency} {formatNumber(mode.data.market.median)} · sample{' '}
                {mode.data.market.sampleSize}
              </div>
              <div className="max-w-xl">
                <ResultCard
                  title={mode.data.product.name}
                  price={mode.data.product.price}
                  currency={mode.data.product.currency}
                  score={mode.data.score}
                  verdict={mode.data.verdict}
                  breakdown={mode.data.breakdown}
                  condition={mode.data.condition}
                  explanation={mode.data.explanation}
                />
              </div>
            </div>
          )}

          {mode.kind === 'search' && (
            <div className="flex flex-col gap-3">
              {mode.data.market ? (
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Median ₪{formatNumber(mode.data.market.median)} · avg ₪
                  {formatNumber(mode.data.market.average)} · {mode.data.market.sampleSize} listings
                </div>
              ) : (
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  No market stats yet
                </div>
              )}
              <ResultsList results={mode.data.results} />
            </div>
          )}
        </section>

        <footer className="pt-6 text-center text-xs text-slate-400">
          Built for second-hand decisions · Yad2 + Facebook Marketplace
        </footer>
      </div>
    </div>
  );
}
