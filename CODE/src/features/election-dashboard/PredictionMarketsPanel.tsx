import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, TrendingUp } from 'lucide-react';
import { useKalshiMarkets, type KalshiMarket, type KalshiScope } from '@/features/election-monitor/useKalshiLive';
import type { OfficeFilter } from '@/features/election-monitor/types';
import { API_BASE_URL } from '@/lib/apiBase';

interface Quote {
  provider: 'KALSHI';
  scope: KalshiScope;
  eventTitle: string;
  outcome: string;
  pricePercent: number;
  priceType: 'MIDPOINT' | 'LAST_TRADE';
  url: string;
  fetchedAt: string;
}
interface MarketResponse {
  fetchedAt: string;
  quotes: Quote[];
  providerStatus: Record<'KALSHI', 'available' | 'unavailable'>;
}

/** One contract, from the live feed or the REST fallback. */
type Row = Pick<KalshiMarket, 'ticker' | 'race' | 'scope' | 'stateCode' | 'district' | 'eventTitle' | 'outcome' | 'party' | 'url' | 'pricePercent' | 'priceType' | 'updatedAt' | 'moved'>;
interface Race { race: string; rows: Row[] }

/** House races shown before "Show all" when a whole state is selected. */
const HOUSE_PREVIEW = 6;

function groupRaces(rows: Row[]): Race[] {
  const byRace = new Map<string, Row[]>();
  for (const row of rows) byRace.set(row.race, [...(byRace.get(row.race) ?? []), row]);
  return [...byRace.entries()].map(([race, list]) => ({
    race,
    rows: list.filter((row) => row.pricePercent !== null).sort((a, b) => b.pricePercent! - a.pricePercent!),
  }));
}

/** Closest races first: smallest gap between the top two prices. */
function competitiveness(race: Race) {
  const [first, second] = race.rows;
  return first && second ? first.pricePercent! - second.pricePercent! : 100;
}

function raceLabel(race: string) {
  if (race === 'US-HOUSE') return 'House control';
  if (race === 'US-SENATE') return 'Senate control';
  if (race.endsWith('-SEN')) return `${race.slice(0, 2)} Senate`;
  return race.endsWith('-00') ? `${race.slice(0, 2)} at-large` : race;
}

/** REST quotes carry no race key; rebuild it from the scope and the request. */
function fromQuote(quote: Quote, stateCode: string | null, district: string | null): Row {
  const race = quote.scope === 'NATIONAL_HOUSE' ? 'US-HOUSE'
    : quote.scope === 'NATIONAL_SENATE' ? 'US-SENATE'
      : quote.scope === 'STATE_SENATE' ? `${stateCode}-SEN` : `${stateCode}-${district}`;
  return {
    ticker: `${quote.url}:${quote.outcome}`,
    race,
    scope: quote.scope,
    stateCode: quote.scope.startsWith('NATIONAL') ? null : stateCode,
    district: quote.scope === 'HOUSE_DISTRICT' ? district : null,
    eventTitle: quote.eventTitle,
    outcome: quote.outcome,
    party: null,
    url: quote.url,
    pricePercent: quote.pricePercent,
    priceType: quote.priceType,
    updatedAt: quote.fetchedAt,
  };
}

function QuoteCards({ race }: { race: Race }) {
  return (
    <div className="ed-predictions-quotes">
      {race.rows.map((row) => (
        <a key={row.ticker} href={row.url} target="_blank" rel="noopener noreferrer" aria-label={`Kalshi ${row.eventTitle}, ${row.outcome}, ${row.pricePercent!.toFixed(1)}%`}>
          <span className="ed-predictions-source">Kalshi</span>
          <span className="ed-predictions-outcome">{row.outcome}{row.party ? ` (${row.party})` : ''}</span>
          <strong key={row.updatedAt} data-moved={row.moved}>{row.pricePercent!.toFixed(1)}%</strong>
          <small>{row.priceType === 'MIDPOINT' ? 'Bid/ask midpoint' : 'Last trade'}</small>
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

/** One line per race, for a state's full House slate. */
function RaceList({ races }: { races: Race[] }) {
  return (
    <ul className="ed-predictions-races">
      {races.map((race) => {
        const [lead, next] = race.rows;
        return (
          <li key={race.race}>
            <a href={lead.url} target="_blank" rel="noopener noreferrer"
              aria-label={`${raceLabel(race.race)}: ${race.rows.map((row) => `${row.outcome} ${row.pricePercent!.toFixed(1)}%`).join(', ')}`}>
              <span className="ed-predictions-race">{raceLabel(race.race)}</span>
              <span className="ed-predictions-outcome">{lead.outcome}{lead.party ? ` (${lead.party})` : ''}</span>
              <strong key={lead.updatedAt} data-moved={lead.moved}>{lead.pricePercent!.toFixed(1)}%</strong>
              {next && <small>{next.outcome} {next.pricePercent!.toFixed(1)}%</small>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function PredictionMarketsPanel({ stateCode, district, office = 'ALL' }: {
  stateCode: string | null;
  district: string | null;
  /** Hides Senate or House markets to match the office filter. */
  office?: OfficeFilter;
}) {
  const live = useKalshiMarkets();
  const [showAllHouse, setShowAllHouse] = useState(false);
  // The live feed carries every race Kalshi lists; REST is only the fallback when it is down.
  const useLive = live.markets.size > 0;
  // REST takes districts 01–53 only; at-large races come from the live feed.
  const restDistrict = district && district !== '00' ? district : null;
  const rest = useQuery({
    queryKey: ['prediction-markets', stateCode, restDistrict],
    queryFn: async ({ signal }): Promise<MarketResponse> => {
      const url = new URL(`${API_BASE_URL}/api/prediction-markets`);
      if (stateCode) url.searchParams.set('state', stateCode);
      if (restDistrict) url.searchParams.set('district', restDistrict);
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Prediction markets API returned ${response.status}`);
      return response.json() as Promise<MarketResponse>;
    },
    enabled: !useLive && live.status !== 'connecting',
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const rows: Row[] = useLive
    ? [...live.markets.values()]
    : (rest.data?.quotes ?? []).map((quote) => fromQuote(quote, stateCode, restDistrict));
  const races = groupRaces(rows).filter((race) => race.rows.length > 0);
  const showSenate = office !== 'US_HOUSE';
  const showHouse = office !== 'US_SENATE';

  const national = races.filter((race) => (showHouse && race.race === 'US-HOUSE') || (showSenate && race.race === 'US-SENATE'));
  const senate = stateCode && showSenate ? races.filter((race) => race.rows[0].scope === 'STATE_SENATE' && race.rows[0].stateCode === stateCode) : [];
  const house = stateCode && showHouse
    ? races
      .filter((race) => race.rows[0].scope === 'HOUSE_DISTRICT' && race.rows[0].stateCode === stateCode && (!district || race.rows[0].district === district))
      .sort((a, b) => competitiveness(a) - competitiveness(b) || a.race.localeCompare(b.race))
    : [];
  const visibleHouse = district || showAllHouse ? house : house.slice(0, HOUSE_PREVIEW);

  const loading = !useLive && (live.status === 'connecting' || rest.isLoading);
  const unavailable = !useLive && !loading && (rest.isError || !rest.data);
  const updatedAt = rows.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), '');
  const emptyNote = !useLive && rest.data?.providerStatus.KALSHI === 'unavailable'
    ? 'No quote available while Kalshi is unreachable.'
    : 'No open Kalshi market for this race.';

  return (
    <section className="ed-panel ed-predictions" aria-labelledby="prediction-markets-heading">
      <div className="ed-panel-heading">
        <div><span className="ed-eyebrow">Live market prices</span><h2 id="prediction-markets-heading"><TrendingUp aria-hidden="true" /> Prediction markets</h2></div>
        {live.status === 'live' && useLive
          ? <span className="ed-predictions-live">Kalshi live</span>
          : updatedAt && <time dateTime={updatedAt}>Updated {new Date(updatedAt).toLocaleTimeString()}</time>}
      </div>
      <p className="ed-predictions-note">Traded prices reflect market views, not election results or polling. Open each market to read its settlement rules.</p>
      {loading && <p className="ed-empty" role="status">Loading Kalshi prices…</p>}
      {unavailable && <p className="ed-empty" role="status">Prediction market prices are temporarily unavailable.</p>}
      {!loading && !unavailable && <>
        {!useLive && rest.data?.providerStatus.KALSHI === 'unavailable' &&
          <p className="ed-predictions-warning" role="status">Kalshi could not be reached. Some prices may be missing.</p>}
        <div className="ed-predictions-groups">
          {national.map((race) => (
            <div className="ed-predictions-group" key={race.race}>
              <h3>National · {raceLabel(race.race)}</h3>
              <QuoteCards race={race} />
            </div>
          ))}
          {stateCode && showSenate && (
            <div className="ed-predictions-group">
              <h3>{stateCode} · U.S. Senate winner</h3>
              {senate.length === 0 ? <p>{useLive ? `No Kalshi Senate market for ${stateCode}.` : emptyNote}</p> : senate.map((race) => <QuoteCards key={race.race} race={race} />)}
            </div>
          )}
          {stateCode && showHouse && (district || useLive) && (
            <div className="ed-predictions-group">
              <h3>
                {district ? `${raceLabel(`${stateCode}-${district}`)} · U.S. House winner` : `${stateCode} · U.S. House races`}
                {!district && house.length > 0 && <span className="ed-predictions-count"> · {house.length} with markets, closest first</span>}
              </h3>
              {house.length === 0
                ? <p>{district ? emptyNote : `No Kalshi House markets for ${stateCode}.`}</p>
                : district ? <QuoteCards race={house[0]} /> : <RaceList races={visibleHouse} />}
              {!district && house.length > HOUSE_PREVIEW && (
                <button type="button" className="ed-predictions-more" onClick={() => setShowAllHouse((value) => !value)}>
                  {showAllHouse ? 'Show fewer' : `Show all ${house.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      </>}
    </section>
  );
}
