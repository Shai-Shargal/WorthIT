import type { SearchResult } from '../types';
import { ResultCard } from './ResultCard';

type Props = {
  results: SearchResult[];
};

export function ResultsList({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-4 py-10 text-center text-sm text-slate-500">
        No listings found. Try a different query, or check that scrapers can reach the marketplaces.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {results.map((r) => (
        <ResultCard
          key={r.id}
          title={r.title}
          price={r.price}
          score={r.score}
          verdict={r.verdict}
          breakdown={r.breakdown}
          condition={r.condition}
          image={r.image}
          url={r.url}
          source={r.source}
          location={r.location}
        />
      ))}
    </div>
  );
}

export default ResultsList;
