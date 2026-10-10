/**
 * A fake Census Data API for tests: a small Texas and DC with two counties
 * split across three Texas districts. Every variable's estimate is the area's
 * population divided by a fixed factor, so totals are easy to check by hand.
 */

interface FakeArea {
  name: string;
  geo: Record<string, string>;
  population: number;
}

export const FAKE_AREAS: Record<string, FakeArea[]> = {
  us: [{ name: 'United States', geo: { us: '1' }, population: 330_000_000 }],
  state: [
    { name: 'District of Columbia', geo: { state: '11' }, population: 680_000 },
    { name: 'Texas', geo: { state: '48' }, population: 30_000_000 },
  ],
  county: [
    { name: 'District of Columbia, District of Columbia', geo: { state: '11', county: '001' }, population: 680_000 },
    { name: 'Fort Bend County, Texas', geo: { state: '48', county: '157' }, population: 900_000 },
    { name: 'Harris County, Texas', geo: { state: '48', county: '201' }, population: 4_800_000 },
  ],
  'congressional district': [
    { name: 'Delegate District (at Large) (119th Congress), District of Columbia', geo: { state: '11', 'congressional district': '98' }, population: 680_000 },
    { name: 'Congressional District 7 (119th Congress), Texas', geo: { state: '48', 'congressional district': '07' }, population: 770_000 },
    { name: 'Congressional District 9 (119th Congress), Texas', geo: { state: '48', 'congressional district': '09' }, population: 770_000 },
    { name: 'Congressional District 22 (119th Congress), Texas', geo: { state: '48', 'congressional district': '22' }, population: 770_000 },
    { name: 'Congressional Districts not defined (119th Congress), Texas', geo: { state: '48', 'congressional district': 'ZZ' }, population: 0 },
  ],
  'county (or part)': [
    { name: 'District of Columbia (part), Delegate District (at Large) (119th Congress), District of Columbia', geo: { state: '11', 'congressional district': '98', 'county (or part)': '001' }, population: 680_000 },
    { name: 'Harris County (part), Congressional District 7 (119th Congress), Texas', geo: { state: '48', 'congressional district': '07', 'county (or part)': '201' }, population: 770_000 },
    { name: 'Fort Bend County (part), Congressional District 9 (119th Congress), Texas', geo: { state: '48', 'congressional district': '09', 'county (or part)': '157' }, population: 200_000 },
    { name: 'Harris County (part), Congressional District 9 (119th Congress), Texas', geo: { state: '48', 'congressional district': '09', 'county (or part)': '201' }, population: 570_000 },
    { name: 'Fort Bend County (part), Congressional District 22 (119th Congress), Texas', geo: { state: '48', 'congressional district': '22', 'county (or part)': '157' }, population: 700_000 },
  ],
};

/** Each variable's estimate is population / 10, except total population, which is exact. */
export function fakeEstimate(variable: string, population: number): number {
  return variable === 'B01003_001' ? population : Math.round(population / 10);
}

export function fakeCensusFetch(onRequest?: (url: URL) => void): typeof fetch {
  return (async (input: string | URL) => {
    const url = new URL(String(input));
    onRequest?.(url);
    const forParam = url.searchParams.get('for') ?? '';
    const level = forParam.slice(0, forParam.lastIndexOf(':'));
    const inParam = url.searchParams.get('in') ?? '';
    const stateFilter = /state:(\d{2})/.exec(inParam)?.[1];
    const areas = (FAKE_AREAS[level] ?? []).filter((area) => !stateFilter || area.geo.state === stateFilter);
    if (areas.length === 0) return new Response(null, { status: 204 });

    const columns = (url.searchParams.get('get') ?? '').split(',');
    const geoColumns = Object.keys(areas[0].geo);
    const rows = areas.map((area) => [
      ...columns.map((column) => {
        if (column === 'NAME') return area.name;
        const variable = column.slice(0, -1);
        return column.endsWith('M') ? '-555555555' : String(fakeEstimate(variable, area.population));
      }),
      ...geoColumns.map((column) => area.geo[column]),
    ]);
    return new Response(JSON.stringify([[...columns, ...geoColumns], ...rows]), { status: 200 });
  }) as typeof fetch;
}
