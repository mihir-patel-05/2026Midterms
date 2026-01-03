import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ChevronRight, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { USMap } from "./USMap";
import { getStateElectionCounts } from "@/lib/api";

// State name mapping for display
const stateCodeToName: { [key: string]: string } = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// All 50 US states with their codes
const ALL_STATES = Object.entries(stateCodeToName).map(([code, name]) => ({
  code,
  name,
  races: 0, // Default to 0 races
}));

export function StateMapSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  // Fetch real state election counts from the API
  const { data: stateCountsData, isLoading, error } = useQuery({
    queryKey: ['stateElectionCounts', 2026],
    queryFn: () => getStateElectionCounts(2026),
  });

  // Merge API data with all states - ensure every state is included
  const states = ALL_STATES.map(state => {
    // Find matching state data from API
    const apiData = stateCountsData?.states.find(s => s.state === state.code);

    return {
      code: state.code,
      name: state.name,
      races: apiData?.races || 0, // Use API data if available, otherwise 0
    };
  });

  const filteredStates = states.filter((state) =>
    state.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    state.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <MapPin className="h-4 w-4" />
            Find Your District
          </div>
          <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl mb-4">
            Explore Elections by State
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Click on your state to discover the candidates running in your area for the 2026 midterm elections
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">Error loading election data. Please try again later.</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        )}

        {/* Map and State List */}
        {!isLoading && !error && (
          <>
            {/* Interactive US Map */}
            <div className="mb-12">
              <USMap
                states={states}
                hoveredState={hoveredState}
                onStateHover={setHoveredState}
              />
            </div>

            {/* Search */}
            <div className="mx-auto mb-8 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search for your state..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* State Grid */}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredStates.map((state) => (
                <Link
                  key={state.code}
                  to={`/elections/${state.code.toLowerCase()}`}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all hover:border-primary hover:shadow-md"
                  onMouseEnter={() => setHoveredState(state.code)}
                  onMouseLeave={() => setHoveredState(null)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {state.code}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{state.name}</p>
                      <p className="text-xs text-muted-foreground">{state.races} races</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              ))}
            </div>

            {filteredStates.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No states found matching your search.</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
