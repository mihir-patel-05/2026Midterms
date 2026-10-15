/**
 * A fake FRED API for tests. Each series answers with the observations given
 * for it, filtered by `observation_start`; a series given as a number answers
 * with that HTTP status, and an unknown series gets FRED's 400.
 */

export type FakeSeries = Array<[date: string, value: string]> | number;

export function fakeFredFetch(series: Record<string, FakeSeries>, onRequest?: (url: URL) => void): typeof fetch {
  return (async (input: string | URL) => {
    const url = new URL(String(input));
    onRequest?.(url);
    const fredId = url.searchParams.get('series_id') ?? '';
    const start = url.searchParams.get('observation_start') ?? '0000-00-00';
    const data = series[fredId];
    if (data === undefined) {
      return Response.json({ error_code: 400, error_message: 'Bad Request.  The series does not exist.' }, { status: 400 });
    }
    if (typeof data === 'number') return new Response('unavailable', { status: data });
    const observations = data
      .filter(([date]) => date >= start)
      .map(([date, value]) => ({ realtime_start: '2026-10-15', realtime_end: '2026-10-15', date, value }));
    return Response.json({ observation_start: start, count: observations.length, observations });
  }) as typeof fetch;
}
