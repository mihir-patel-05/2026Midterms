import { useEffect, useRef, type ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { DetailTab } from "./types";

export function DetailPanel({
  monogram,
  title,
  meta,
  badge,
  tab,
  onTabChange,
  overview,
  counties,
  finance,
  demographics,
  economy,
  news,
  history,
  footer,
  collapsed = false,
  onCollapsedChange,
}: {
  monogram: string;
  title: string;
  meta: string;
  badge: ReactNode;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  overview: ReactNode;
  counties: ReactNode;
  finance: ReactNode;
  /** Omitted when the demographics feature flag is off. */
  demographics?: ReactNode;
  /** State and national economy plus Census household economics. */
  economy?: ReactNode;
  /** Race, state, and national headlines; omitted when the news flag is off. */
  news?: ReactNode;
  /** Past results; omitted outside Past results mode. */
  history?: ReactNode;
  footer: ReactNode;
  /** Shrinks the panel to a narrow rail; only offered on the expanded map. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const collapseRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const wasCollapsed = useRef(collapsed);
  // The button that was pressed disappears, so hand focus to the one that replaces it.
  useEffect(() => {
    if (wasCollapsed.current === collapsed) return;
    wasCollapsed.current = collapsed;
    (collapsed ? railRef : collapseRef).current?.focus();
  }, [collapsed]);

  return (
    <aside className="em-detail" aria-label="Selected state and race details" data-collapsed={collapsed || undefined}>
      {onCollapsedChange && (
        <button ref={railRef} type="button" className="em-detail-rail" aria-expanded={false} onClick={() => onCollapsedChange(false)}>
          <PanelRightOpen aria-hidden="true" />
          <span className="em-monogram" aria-hidden="true">{monogram}</span>
          <span className="em-detail-rail-label">Show details<span className="sr-only">: {title}</span></span>
        </button>
      )}
      <TabsPrimitive.Root value={tab} onValueChange={(value) => onTabChange(value as DetailTab)} className="em-detail-inner">
        <div>
          <div className="em-detail-head">
            <div className="em-identity">
              <div className="em-monogram" aria-hidden="true">{monogram}</div>
              <div>
                <h2>{title}</h2>
                <p>{meta}</p>
              </div>
            </div>
            <div className="em-detail-actions">
              {badge}
              {onCollapsedChange && (
                <button ref={collapseRef} type="button" className="em-detail-collapse" aria-expanded={true} aria-label="Hide details panel" title="Hide details panel" onClick={() => onCollapsedChange(true)}>
                  <PanelRightClose aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <TabsPrimitive.List className="em-tabs" aria-label="Details">
            <TabsPrimitive.Trigger className="em-tab" value="overview">Overview</TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger className="em-tab" value="counties">Counties</TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger className="em-tab" value="finance">Finance</TabsPrimitive.Trigger>
            {news && <TabsPrimitive.Trigger className="em-tab" value="news">News</TabsPrimitive.Trigger>}
            {demographics && <TabsPrimitive.Trigger className="em-tab" value="demographics">Demographics</TabsPrimitive.Trigger>}
            {economy && <TabsPrimitive.Trigger className="em-tab" value="economy">Economy</TabsPrimitive.Trigger>}
            {history && <TabsPrimitive.Trigger className="em-tab" value="history">Past</TabsPrimitive.Trigger>}
          </TabsPrimitive.List>
        </div>
        <div>
          <TabsPrimitive.Content value="overview">{overview}</TabsPrimitive.Content>
          <TabsPrimitive.Content value="counties">{counties}</TabsPrimitive.Content>
          <TabsPrimitive.Content value="finance">{finance}</TabsPrimitive.Content>
          {news && <TabsPrimitive.Content value="news">{news}</TabsPrimitive.Content>}
          {demographics && <TabsPrimitive.Content value="demographics">{demographics}</TabsPrimitive.Content>}
          {economy && <TabsPrimitive.Content value="economy">{economy}</TabsPrimitive.Content>}
          {history && <TabsPrimitive.Content value="history">{history}</TabsPrimitive.Content>}
          <div className="em-detail-footer">{footer}</div>
        </div>
      </TabsPrimitive.Root>
    </aside>
  );
}
