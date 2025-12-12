import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const states = [
  { code: "AL", name: "Alabama", races: 8 },
  { code: "AK", name: "Alaska", races: 2 },
  { code: "AZ", name: "Arizona", races: 10 },
  { code: "AR", name: "Arkansas", races: 5 },
  { code: "CA", name: "California", races: 54 },
  { code: "CO", name: "Colorado", races: 9 },
  { code: "CT", name: "Connecticut", races: 6 },
  { code: "DE", name: "Delaware", races: 2 },
  { code: "FL", name: "Florida", races: 29 },
  { code: "GA", name: "Georgia", races: 15 },
  { code: "HI", name: "Hawaii", races: 3 },
  { code: "ID", name: "Idaho", races: 3 },
  { code: "IL", name: "Illinois", races: 18 },
  { code: "IN", name: "Indiana", races: 10 },
  { code: "IA", name: "Iowa", races: 5 },
  { code: "KS", name: "Kansas", races: 5 },
  { code: "KY", name: "Kentucky", races: 7 },
  { code: "LA", name: "Louisiana", races: 7 },
  { code: "ME", name: "Maine", races: 3 },
  { code: "MD", name: "Maryland", races: 9 },
  { code: "MA", name: "Massachusetts", races: 10 },
  { code: "MI", name: "Michigan", races: 15 },
  { code: "MN", name: "Minnesota", races: 9 },
  { code: "MS", name: "Mississippi", races: 5 },
  { code: "MO", name: "Missouri", races: 9 },
  { code: "MT", name: "Montana", races: 2 },
  { code: "NE", name: "Nebraska", races: 4 },
  { code: "NV", name: "Nevada", races: 5 },
  { code: "NH", name: "New Hampshire", races: 3 },
  { code: "NJ", name: "New Jersey", races: 13 },
  { code: "NM", name: "New Mexico", races: 4 },
  { code: "NY", name: "New York", races: 27 },
  { code: "NC", name: "North Carolina", races: 15 },
  { code: "ND", name: "North Dakota", races: 2 },
  { code: "OH", name: "Ohio", races: 16 },
  { code: "OK", name: "Oklahoma", races: 6 },
  { code: "OR", name: "Oregon", races: 6 },
  { code: "PA", name: "Pennsylvania", races: 19 },
  { code: "RI", name: "Rhode Island", races: 3 },
  { code: "SC", name: "South Carolina", races: 8 },
  { code: "SD", name: "South Dakota", races: 2 },
  { code: "TN", name: "Tennessee", races: 10 },
  { code: "TX", name: "Texas", races: 38 },
  { code: "UT", name: "Utah", races: 5 },
  { code: "VT", name: "Vermont", races: 2 },
  { code: "VA", name: "Virginia", races: 12 },
  { code: "WA", name: "Washington", races: 11 },
  { code: "WV", name: "West Virginia", races: 3 },
  { code: "WI", name: "Wisconsin", races: 9 },
  { code: "WY", name: "Wyoming", races: 2 },
];

export function StateMapSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const filteredStates = states.filter((state) =>
    state.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    state.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="mb-4 font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Find Elections in Your State
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Select your state to explore upcoming federal elections, candidate profiles, and important voting dates.
          </p>
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
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No states found matching your search.</p>
          </div>
        )}
      </div>
    </section>
  );
}
