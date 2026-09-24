# 2026 prediction markets on the election dashboard

## What is implemented

The public `GET /api/prediction-markets` endpoint reads open, binary 2026 general-election markets from Kalshi and Polymarket. It accepts optional `state=MI` and `district=06` parameters. The response has four scopes: national House control, national Senate control, the selected state's U.S. Senate winner, and the selected U.S. House district winner. A scope with no matching market returns no quotes. The dashboard shows each provider separately with a source link, price type, and fetch time. Prediction prices are separate from official or mock election results.

The dashboard route requires `VITE_FEATURE_ELECTION_DASHBOARD=true`. With `VITE_RESULTS_PROVIDER_MOCK_ENABLED=true`, the market panel appears in the existing fictional results shell. With only the dashboard flag on, the route opens a live prediction-market view without mock results. The normal site navigation shows a Markets link while the dashboard flag is on.

## Provider lookup

| Scope | Kalshi event ticker | Polymarket event |
| --- | --- | --- |
| National House | `CONTROLH-2026` | `which-party-will-win-the-house-in-2026` |
| National Senate | `CONTROLS-2026` | `which-party-will-win-the-senate-in-2026` |
| State Senate | `SENATE{STATE}-26` | `{state-name}-senate-election-winner`, with exact-title search fallback |
| House district | `KXHOUSERACE-{STATE}{DD}-26` | `{state}-{dd}-house-election-winner`, with exact-title search fallback |

Kalshi's public event endpoint returns each event's markets with `with_nested_markets=true`. The service uses the midpoint of a valid Yes bid and ask, falling back to the last trade price. Polymarket's Gamma event endpoint returns JSON-encoded `outcomes` and `outcomePrices`; the service reads the Yes outcome price for each market in the event. It displays the price as a percentage, without combining or normalizing provider prices. The displayed value is a market price, not an election forecast produced by this application.

Requests have a six-second upstream timeout and a one-minute shared in-process cache per location. Provider errors produce a partial response with `providerStatus` marked `unavailable`; missing events produce an empty scope. No API credentials or database migration are required for these public read endpoints.

## Follow-up operations

Kalshi and Polymarket can add or rename events. Review market identity and settlement rules as events are listed, especially when a state has no U.S. Senate race or a district market is absent. If an event uses a different ticker or title, add an explicit mapping before displaying it. A future catalog or scheduled discovery job can replace the current ticker and slug rules if coverage grows beyond these 2026 federal races. Keep the provider URL and price type visible when adding new markets.

## API references

- [Kalshi Get Event](https://docs.kalshi.com/api-reference/events/get-event)
- [Kalshi Get Markets](https://docs.kalshi.com/api-reference/market/get-markets)
- [Polymarket Discover Markets](https://docs.polymarket.com/market-data/discover-markets)
- [Polymarket Market Details](https://docs.polymarket.com/market-data/market-details)
