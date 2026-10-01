import { useQuery } from '@tanstack/react-query';
import { ExternalLink, TrendingUp } from 'lucide-react';

type Scope = 'NATIONAL_HOUSE' | 'NATIONAL_SENATE' | 'STATE_SENATE' | 'HOUSE_DISTRICT';
interface Quote {
  provider: 'KALSHI' | 'POLYMARKET';
  scope: Scope;
  eventTitle: string;
  outcome: string;
  pricePercent: number;
  priceType: 'MIDPOINT' | 'LAST_TRADE' | 'OUTCOME_PRICE';
  url: string;
  fetchedAt: string;
}
interface MarketResponse {
  fetchedAt: string;
  quotes: Quote[];
  providerStatus: Record<'KALSHI' | 'POLYMARKET', 'available' | 'unavailable'>;
}

const scopeTitles: Record<Scope, string> = {
  NATIONAL_HOUSE: 'National · House control',
  NATIONAL_SENATE: 'National · Senate control',
  STATE_SENATE: 'State · U.S. Senate winner',
  HOUSE_DISTRICT: 'District · U.S. House winner',
};

export function PredictionMarketsPanel({ stateCode, district }: { stateCode: string | null; district: string | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['prediction-markets', stateCode, district],
    queryFn: async ({ signal }): Promise<MarketResponse> => {
      const url = new URL(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/prediction-markets`);
      if (stateCode) url.searchParams.set('state', stateCode);
      if (district) url.searchParams.set('district', district);
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Prediction markets API returned ${response.status}`);
      return response.json() as Promise<MarketResponse>;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const scopes: Scope[] = ['NATIONAL_HOUSE', 'NATIONAL_SENATE'];
  if (stateCode) scopes.push('STATE_SENATE');
  if (stateCode && district) scopes.push('HOUSE_DISTRICT');

  return (
    <section className="ed-panel ed-predictions" aria-labelledby="prediction-markets-heading">
      <div className="ed-panel-heading">
        <div><span className="ed-eyebrow">Live market prices</span><h2 id="prediction-markets-heading"><TrendingUp aria-hidden="true" /> Prediction markets</h2></div>
        {data && <time dateTime={data.fetchedAt}>Checked {new Date(data.fetchedAt).toLocaleTimeString()}</time>}
      </div>
      <p className="ed-predictions-note">Traded prices reflect market views, not election results or polling. Providers use different settlement rules; open each market to read them.</p>
      {isLoading && <p className="ed-empty" role="status">Loading Kalshi and Polymarket prices…</p>}
      {isError && <p className="ed-empty" role="status">Prediction market prices are temporarily unavailable.</p>}
      {data && <>
        {Object.entries(data.providerStatus).filter(([, status]) => status === 'unavailable').map(([provider]) =>
          <p key={provider} className="ed-predictions-warning" role="status">{provider === 'KALSHI' ? 'Kalshi' : 'Polymarket'} could not be reached. Its prices may be missing.</p>
        )}
        <div className="ed-predictions-groups">
          {scopes.map((scope) => {
            const quotes = data.quotes.filter((quote) => quote.scope === scope);
            return <div className="ed-predictions-group" key={scope}>
              <h3>{scopeTitles[scope]}{scope === 'STATE_SENATE' ? ` · ${stateCode}` : scope === 'HOUSE_DISTRICT' ? ` · ${stateCode}-${district}` : ''}</h3>
              {quotes.length === 0 ? <p>{Object.values(data.providerStatus).includes('unavailable') ? 'No quote available from reachable providers.' : 'No matching open market found.'}</p> : <div className="ed-predictions-quotes">
                {quotes.map((quote) => <a key={`${quote.provider}:${scope}:${quote.outcome}`} href={quote.url} target="_blank" rel="noopener noreferrer" aria-label={`${quote.provider} ${quote.eventTitle}, ${quote.outcome}, ${quote.pricePercent}%`}>
                  <span className="ed-predictions-source">{quote.provider === 'KALSHI' ? 'Kalshi' : 'Polymarket'}</span>
                  <span className="ed-predictions-outcome">{quote.outcome}</span>
                  <strong>{quote.pricePercent.toFixed(1)}%</strong>
                  <small>{quote.priceType === 'MIDPOINT' ? 'Bid/ask midpoint' : quote.priceType === 'LAST_TRADE' ? 'Last trade' : 'Outcome price'}</small>
                  <ExternalLink aria-hidden="true" />
                </a>)}
              </div>}
            </div>;
          })}
        </div>
      </>}
    </section>
  );
}
