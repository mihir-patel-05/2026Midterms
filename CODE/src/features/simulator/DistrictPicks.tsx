import { STATE_NAMES } from "./labels";
import type { DistrictOutcome, Outcome } from "./model";
import { districtState } from "./electoralVotes";

const OPTIONS: Array<{ value: Outcome; label: string }> = [
  { value: "D", label: "D" },
  { value: "T", label: "Tossup" },
  { value: "R", label: "R" },
];

/**
 * Maine's and Nebraska's one-vote districts. With no district returns in the data, each follows its
 * state (or the baseline year's split) until set here.
 */
export function DistrictPicks({ districts, picks, base, onChange }: {
  districts: DistrictOutcome[];
  picks: Record<string, Outcome>;
  base: number | null;
  /** null returns the district to "Auto". */
  onChange: (code: string, winner: Outcome | null) => void;
}) {
  return (
    <div className="sim-districts">
      {districts.map((district) => {
        const set = picks[district.code];
        const auto = district.source === "baseline" ? `as in ${base}` : `follows ${STATE_NAMES[districtState(district.code)]}`;
        return (
          <div className="sim-district" key={district.code}>
            <div>
              <strong><i className="sim-dot" data-party={district.winner} aria-hidden="true" />{district.code}</strong>
              <small>{set ? "your pick" : auto}</small>
            </div>
            <div className="sim-seg" role="group" aria-label={`${district.code} electoral vote`}>
              <button type="button" aria-pressed={!set} title={`Auto: ${auto}`} onClick={() => onChange(district.code, null)}>Auto</button>
              {OPTIONS.map((option) => (
                <button key={option.value} type="button" data-party={option.value} aria-pressed={set === option.value} onClick={() => onChange(district.code, option.value)}>{option.label}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
