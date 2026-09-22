import type { KeyboardEvent } from "react";
import type { StateMapItemViewModel } from "./types";

const coverageLabel = {
  COMPLETE: "Mock coverage",
  PARTIAL: "Partial mock coverage",
  NONE: "Not configured",
  UNKNOWN: "Coverage unknown",
} as const;

export function NationalMap({ states, selectedState, onSelect }: { states: StateMapItemViewModel[]; selectedState: string; onSelect: (code: string) => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? states.length - 1 : step ? Math.min(states.length - 1, Math.max(0, index + step)) : -1;
    if (targetIndex < 0) return;
    event.preventDefault();
    document.querySelector<HTMLButtonElement>(`[data-map-state="${states[targetIndex].code}"]`)?.focus();
  }

  return (
    <section className="ed-map-panel" aria-labelledby="national-map-heading">
      <div className="ed-panel-heading ed-map-heading">
        <div><span className="ed-eyebrow">National view</span><h2 id="national-map-heading">State selection cartogram</h2></div>
        <div className="ed-legend" aria-label="Mock coverage legend">
          <span data-coverage="COMPLETE">Mock coverage</span><span data-coverage="PARTIAL">Partial</span><span data-coverage="NONE">Unavailable</span>
        </div>
      </div>
      <div className="ed-tile-map" role="group" aria-label="Select a state. Use Tab or arrow keys to move between state buttons.">
        {states.map((state, index) => (
          <button
            key={state.code}
            type="button"
            data-map-state={state.code}
            data-coverage={state.coverage}
            aria-pressed={selectedState === state.code}
            aria-label={`${state.name}. ${coverageLabel[state.coverage]}. All displayed results are fictional.`}
            style={{ gridRow: state.row, gridColumn: state.column }}
            onClick={() => onSelect(state.code)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {state.code}
          </button>
        ))}
      </div>
      <p className="ed-map-caption">Dependency-free state cartogram placeholder. Production geography will require versioned, validated state, district, and county assets.</p>
    </section>
  );
}
