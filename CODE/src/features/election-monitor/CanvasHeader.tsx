import { useEffect, useState } from "react";
import { formatEtTime } from "./constants";

export function CanvasHeader({
  stateName,
  districtName,
  subtitle,
  onReset,
  onStateCrumb,
}: {
  stateName: string | null;
  districtName: string | null;
  subtitle: string;
  onReset: () => void;
  onStateCrumb: () => void;
}) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="em-canvas-head">
      <div>
        <nav className="em-breadcrumb" aria-label="Breadcrumb">
          {stateName ? <button type="button" onClick={onReset}>United States</button> : <span>United States</span>}
          {stateName && <span aria-hidden="true">›</span>}
          {stateName && (districtName ? <button type="button" onClick={onStateCrumb}>{stateName}</button> : <span>{stateName}</span>)}
          {districtName && <span aria-hidden="true">›</span>}
          {districtName && <span>{districtName}</span>}
        </nav>
        <h1>Federal election monitor</h1>
        <p className="em-subtitle">{subtitle}</p>
      </div>
      <div className="em-clock">
        <strong>{formatEtTime(now, true)} ET</strong>
        <span>Eastern time</span>
      </div>
    </div>
  );
}
