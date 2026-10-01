import type { ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
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
  footer,
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
  footer: ReactNode;
}) {
  return (
    <aside className="em-detail" aria-label="Selected state and race details">
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
            {badge}
          </div>
          <TabsPrimitive.List className="em-tabs" aria-label="Details">
            <TabsPrimitive.Trigger className="em-tab" value="overview">Overview</TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger className="em-tab" value="counties">Counties</TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger className="em-tab" value="finance">Finance</TabsPrimitive.Trigger>
          </TabsPrimitive.List>
        </div>
        <div>
          <TabsPrimitive.Content value="overview">{overview}</TabsPrimitive.Content>
          <TabsPrimitive.Content value="counties">{counties}</TabsPrimitive.Content>
          <TabsPrimitive.Content value="finance">{finance}</TabsPrimitive.Content>
          <div className="em-detail-footer">{footer}</div>
        </div>
      </TabsPrimitive.Root>
    </aside>
  );
}
