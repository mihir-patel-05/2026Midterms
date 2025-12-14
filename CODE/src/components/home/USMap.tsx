import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography, Annotation } from "react-simple-maps";
import { geoCentroid } from "d3-geo";

const geoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

interface State {
  code: string;
  name: string;
  races: number;
}

interface USMapProps {
  states: State[];
  hoveredState: string | null;
  onStateHover: (stateCode: string | null) => void;
}

// Mapping of state names to their codes
const stateNameToCode: { [key: string]: string } = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

export function USMap({ states, hoveredState, onStateHover }: USMapProps) {
  const navigate = useNavigate();
  const [tooltipContent, setTooltipContent] = useState<{
    name: string;
    races: number;
    x: number;
    y: number;
  } | null>(null);

  const getStateData = (geoName: string) => {
    const stateCode = stateNameToCode[geoName];
    return states.find((s) => s.code === stateCode);
  };

  const handleStateClick = (geoName: string) => {
    const stateCode = stateNameToCode[geoName];
    if (stateCode) {
      navigate(`/elections/${stateCode.toLowerCase()}`);
    }
  };

  const handleMouseEnter = (geo: any, event: React.MouseEvent) => {
    const stateData = getStateData(geo.properties.name);
    const stateCode = stateNameToCode[geo.properties.name];

    if (stateData && stateCode) {
      onStateHover(stateCode);
      setTooltipContent({
        name: stateData.name,
        races: stateData.races,
        x: event.clientX,
        y: event.clientY,
      });
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (tooltipContent) {
      setTooltipContent({
        ...tooltipContent,
        x: event.clientX,
        y: event.clientY,
      });
    }
  };

  const handleMouseLeave = () => {
    onStateHover(null);
    setTooltipContent(null);
  };

  return (
    <div className="relative w-full">
      <div className="mx-auto max-w-5xl">
        <ComposableMap
          projection="geoAlbersUsa"
          className="w-full h-auto"
          projectionConfig={{
            scale: 1000,
          }}
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const stateCode = stateNameToCode[geo.properties.name];
                const isHovered = hoveredState === stateCode;
                const stateData = getStateData(geo.properties.name);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => handleStateClick(geo.properties.name)}
                    onMouseEnter={(event) => handleMouseEnter(geo, event)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      default: {
                        fill: stateData ? "hsl(var(--primary) / 0.2)" : "hsl(var(--muted))",
                        stroke: "#000000",
                        strokeWidth: 0.75,
                        outline: "none",
                      },
                      hover: {
                        fill: "hsl(var(--primary) / 0.6)",
                        stroke: "#000000",
                        strokeWidth: 1.5,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: "hsl(var(--primary) / 0.8)",
                        stroke: "#000000",
                        strokeWidth: 1.5,
                        outline: "none",
                      },
                    }}
                    className={`transition-all duration-200 ${
                      isHovered ? "drop-shadow-lg" : ""
                    }`}
                  />
                );
              })
            }
          </Geographies>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const centroid = geoCentroid(geo);
                const stateCode = stateNameToCode[geo.properties.name];

                return (
                  <g key={geo.rsmKey + "-name"}>
                    {stateCode && (
                      <>
                        {/* White background for better visibility */}
                        <text
                          x={centroid[0]}
                          y={centroid[1]}
                          fontSize={14}
                          fontWeight="700"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          stroke="#FFFFFF"
                          strokeWidth={4}
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          {stateCode}
                        </text>
                        {/* Actual text */}
                        <text
                          x={centroid[0]}
                          y={centroid[1]}
                          fontSize={14}
                          fontWeight="700"
                          textAnchor="middle"
                          fill="#000000"
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          {stateCode}
                        </text>
                      </>
                    )}
                  </g>
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>

      {/* Tooltip */}
      {tooltipContent && (
        <div
          className="fixed z-50 rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg pointer-events-none"
          style={{
            left: `${tooltipContent.x + 10}px`,
            top: `${tooltipContent.y - 40}px`,
          }}
        >
          <div className="font-semibold text-popover-foreground">
            {tooltipContent.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {tooltipContent.races} races
          </div>
        </div>
      )}
    </div>
  );
}
