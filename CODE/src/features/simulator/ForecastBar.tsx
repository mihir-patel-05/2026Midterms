import { FolderOpen, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { savedAtLabel, useSavedForecast, writeSavedForecast, type ForecastKind } from "./savedForecast";

/**
 * "Your forecast": save the scenario on screen in this browser, and see it again on the next visit. A plain visit
 * opens the saved forecast; a shared link with its own scenario shows that, with the saved one a click away.
 */
export function ForecastBar({ kind }: { kind: ForecastKind }) {
  const forecast = useSavedForecast(kind);
  const { saved, status, restored, empty } = forecast;

  const onSave = () => {
    const next = forecast.save();
    if (next) toast.success("Forecast saved", { description: "It opens here next time you visit, in this browser." });
    else toast.error("Could not save the forecast", { description: "This browser isn't keeping site data (a private window, or storage is blocked). Copy the link instead." });
  };

  const onDelete = () => {
    const removed = saved;
    forecast.clear();
    toast("Saved forecast deleted", removed ? {
      description: "The map on screen is unchanged.",
      action: { label: "Undo", onClick: () => { writeSavedForecast(kind, removed.scenario, new Date(removed.savedAt)); window.dispatchEvent(new StorageEvent("storage", { key: null })); } },
    } : undefined);
  };

  const message = status === "none"
    ? empty ? "Make your calls on the map, then save them to see them here next time." : "Not saved yet. Save it to see it here next time, in this browser."
    : status === "saved"
      ? restored ? `Showing your forecast saved ${savedAtLabel(saved!.savedAt)}.` : `Saved ${savedAtLabel(saved!.savedAt)}. It opens here next time.`
      : `The map differs from your forecast saved ${savedAtLabel(saved!.savedAt)}.`;

  return (
    <section className="sim-forecast" aria-label="Your forecast" data-status={status}>
      <p className="sim-forecast-text" role="status">
        <strong>Your forecast</strong>
        <span>{message}</span>
      </p>
      <div className="sim-actions">
        {status !== "saved" && (
          <button type="button" className="sim-button" data-primary onClick={onSave} disabled={empty && status === "none"}>
            <Save aria-hidden="true" />{status === "changed" ? "Save over it" : "Save forecast"}
          </button>
        )}
        {status === "changed" && <button type="button" className="sim-button" onClick={forecast.open}><FolderOpen aria-hidden="true" />Open saved</button>}
        {saved && <button type="button" className="sim-button" onClick={onDelete}><Trash2 aria-hidden="true" />Delete saved</button>}
      </div>
    </section>
  );
}
