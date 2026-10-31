/**
 * EIA weekly retail fuel prices (PLAN.md §4.8): regular gasoline and No. 2 diesel, in dollars per
 * gallon, for the U.S., the states EIA publishes, and the PADD regions. A state EIA does not publish
 * takes its region's price, labelled as a regional average and never as the state's own.
 */

export const EIA_SOURCE_KEY = 'eia';
export const FUEL_CATALOG_VERSION = 'eia-fuel-v1';

export type Fuel = 'gasoline' | 'diesel';
export type AreaKind = 'nation' | 'state' | 'region';

export interface FuelArea {
  /** EIA's duoarea code: NUS, SCA, R10, R1X, R5XCA… */
  code: string;
  name: string;
  kind: AreaKind;
}

export const AREAS: Record<string, FuelArea> = {
  NUS: { code: 'NUS', name: 'U.S.', kind: 'nation' },
  R1X: { code: 'R1X', name: 'New England (PADD 1A)', kind: 'region' },
  R1Y: { code: 'R1Y', name: 'Central Atlantic (PADD 1B)', kind: 'region' },
  R1Z: { code: 'R1Z', name: 'Lower Atlantic (PADD 1C)', kind: 'region' },
  R20: { code: 'R20', name: 'Midwest (PADD 2)', kind: 'region' },
  R30: { code: 'R30', name: 'Gulf Coast (PADD 3)', kind: 'region' },
  R40: { code: 'R40', name: 'Rocky Mountain (PADD 4)', kind: 'region' },
  R50: { code: 'R50', name: 'West Coast (PADD 5)', kind: 'region' },
  R5XCA: { code: 'R5XCA', name: 'West Coast except California', kind: 'region' },
  SCA: { code: 'SCA', name: 'California', kind: 'state' },
  SCO: { code: 'SCO', name: 'Colorado', kind: 'state' },
  SFL: { code: 'SFL', name: 'Florida', kind: 'state' },
  SMA: { code: 'SMA', name: 'Massachusetts', kind: 'state' },
  SMN: { code: 'SMN', name: 'Minnesota', kind: 'state' },
  SNY: { code: 'SNY', name: 'New York', kind: 'state' },
  SOH: { code: 'SOH', name: 'Ohio', kind: 'state' },
  STX: { code: 'STX', name: 'Texas', kind: 'state' },
  SWA: { code: 'SWA', name: 'Washington', kind: 'state' },
};

/** States EIA prices on their own, by fuel. Diesel is published for California only. */
const OWN_STATE: Record<Fuel, readonly string[]> = {
  gasoline: ['CA', 'CO', 'FL', 'MA', 'MN', 'NY', 'OH', 'TX', 'WA'],
  diesel: ['CA'],
};

/** Each state's PADD (sub)region. PADD 1 is split into 1A, 1B and 1C; PADD 5 outside California has its own series. */
export const STATE_REGION: Record<string, string> = {
  CT: 'R1X', ME: 'R1X', MA: 'R1X', NH: 'R1X', RI: 'R1X', VT: 'R1X',
  DE: 'R1Y', DC: 'R1Y', MD: 'R1Y', NJ: 'R1Y', NY: 'R1Y', PA: 'R1Y',
  FL: 'R1Z', GA: 'R1Z', NC: 'R1Z', SC: 'R1Z', VA: 'R1Z', WV: 'R1Z',
  IL: 'R20', IN: 'R20', IA: 'R20', KS: 'R20', KY: 'R20', MI: 'R20', MN: 'R20', MO: 'R20', NE: 'R20',
  ND: 'R20', SD: 'R20', OH: 'R20', OK: 'R20', TN: 'R20', WI: 'R20',
  AL: 'R30', AR: 'R30', LA: 'R30', MS: 'R30', NM: 'R30', TX: 'R30',
  CO: 'R40', ID: 'R40', MT: 'R40', UT: 'R40', WY: 'R40',
  AK: 'R5XCA', AZ: 'R5XCA', HI: 'R5XCA', NV: 'R5XCA', OR: 'R5XCA', WA: 'R5XCA', CA: 'SCA',
};

/** EIA series ids: regular gasoline (all formulations) and No. 2 diesel, retail, dollars per gallon. */
export const seriesId = (fuel: Fuel, area: string) => (fuel === 'gasoline' ? `EMM_EPMR_PTE_${area}_DPG` : `EMD_EPD2D_PTE_${area}_DPG`);

/** `indicator_series.key` for a fuel series. */
export const seriesKey = (fuel: Fuel, area: string) => `eia.${seriesId(fuel, area)}`;

/** The area whose price stands for a state: its own when EIA publishes it, else its region. Null for an unknown state. */
export function areaForState(fuel: Fuel, state: string): FuelArea | null {
  const code = state.toUpperCase();
  if (OWN_STATE[fuel].includes(code)) return AREAS[`S${code}`];
  const region = STATE_REGION[code];
  return region ? AREAS[region] : null;
}

export interface FuelSeriesDef {
  fuel: Fuel;
  area: FuelArea;
  eiaId: string;
  key: string;
  name: string;
}

/** Every series the sync stores: the U.S. and every area some state maps to. */
export const FUEL_SERIES: readonly FuelSeriesDef[] = (['gasoline', 'diesel'] as const).flatMap((fuel) => {
  const areas = new Set(['NUS', ...Object.keys(STATE_REGION).map((state) => areaForState(fuel, state)!.code)]);
  return [...areas].sort().map((code) => ({
    fuel,
    area: AREAS[code],
    eiaId: seriesId(fuel, code),
    key: seriesKey(fuel, code),
    name: `${fuel === 'gasoline' ? 'Regular gasoline' : 'Diesel'}, ${AREAS[code].name}`,
  }));
});
