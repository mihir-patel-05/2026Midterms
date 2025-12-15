import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Users, ChevronRight, Filter, ArrowLeft, Search } from "lucide-react";
import { USMap } from "@/components/home/USMap";
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

const mockRaces = [
  {
    id: "1",
    type: "Senate",
    state: "Arizona",
    incumbent: "Mark Kelly",
    incumbentParty: "Democratic",
    candidates: 4,
    electionDate: "November 3, 2026",
    primaryDate: "August 4, 2026",
    competitiveness: "Toss-up",
  },
  {
    id: "2",
    type: "House",
    district: 1,
    state: "Arizona",
    incumbent: "David Schweikert",
    incumbentParty: "Republican",
    candidates: 3,
    electionDate: "November 3, 2026",
    primaryDate: "August 4, 2026",
    competitiveness: "Lean R",
  },
  {
    id: "3",
    type: "House",
    district: 2,
    state: "Arizona",
    incumbent: "Eli Crane",
    incumbentParty: "Republican",
    candidates: 2,
    electionDate: "November 3, 2026",
    primaryDate: "August 4, 2026",
    competitiveness: "Likely R",
  },
  {
    id: "4",
    type: "House",
    district: 3,
    state: "Arizona",
    incumbent: "Ruben Gallego",
    incumbentParty: "Democratic",
    candidates: 3,
    electionDate: "November 3, 2026",
    primaryDate: "August 4, 2026",
    competitiveness: "Safe D",
  },
];

function getCompetitivenessColor(rating: string): string {
  if (rating.includes("Toss")) return "bg-secondary/20 text-secondary border-secondary/30";
  if (rating.includes("Lean")) return "bg-amber-soft text-foreground border-border";
  if (rating.includes("Likely")) return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}

export default function Elections() {
  const { state } = useParams();
  const [electionType, setElectionType] = useState<"general" | "primary">("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const stateName = state ? state.toUpperCase() : null;

  const filteredStates = states.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <section className="bg-muted/30 border-b border-border">
        <div className="container py-8">
          {stateName ? (
            <>
              <Link
                to="/elections"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                All States
              </Link>
              <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
                {stateName} Federal Elections
              </h1>
              <p className="mt-2 text-muted-foreground">
                Explore Senate and House races for the 2026 midterm elections.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
                Federal Elections
              </h1>
              <p className="mt-2 text-muted-foreground">
                Select a state to explore upcoming federal races.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="py-8">
        <div className="container">
          {stateName ? (
            <>
              {/* Election Type Tabs */}
              <Tabs defaultValue="general" className="mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <TabsList>
                    <TabsTrigger value="general" onClick={() => setElectionType("general")}>
                      General Election
                    </TabsTrigger>
                    <TabsTrigger value="primary" onClick={() => setElectionType("primary")}>
                      Primary Elections
                    </TabsTrigger>
                  </TabsList>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter Races
                  </Button>
                </div>

                <TabsContent value="general" className="space-y-4">
                  {/* Key Dates */}
                  <div className="rounded-lg border border-border bg-card p-4 mb-6">
                    <h3 className="font-heading font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Key Dates
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Registration Deadline</p>
                        <p className="font-medium text-foreground">October 5, 2026</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Early Voting Begins</p>
                        <p className="font-medium text-foreground">October 12, 2026</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Election Day</p>
                        <p className="font-medium text-foreground">November 3, 2026</p>
                      </div>
                    </div>
                  </div>

                  {/* Race List */}
                  <div className="space-y-4">
                    {mockRaces.map((race) => (
                      <Link
                        key={race.id}
                        to={`/candidates?race=${race.id}`}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                            {race.type === "Senate" ? "S" : `H${race.district}`}
                          </div>
                          <div>
                            <h3 className="font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
                              {race.type === "Senate"
                                ? `${race.state} Senate`
                                : `${race.state} District ${race.district}`}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Incumbent: {race.incumbent} ({race.incumbentParty.substring(0, 1)})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <Badge variant="outline" className={getCompetitivenessColor(race.competitiveness)}>
                              {race.competitiveness}
                            </Badge>
                            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {race.candidates} candidates
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="primary">
                  <div className="text-center py-12">
                    <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                      Primary Elections Coming Soon
                    </h3>
                    <p className="text-muted-foreground">
                      Primary election information will be available as filing deadlines approach.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
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
                {filteredStates.map((s) => (
                  <Link
                    key={s.code}
                    to={`/elections/${s.code.toLowerCase()}`}
                    className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-all hover:border-primary hover:shadow-md"
                    onMouseEnter={() => setHoveredState(s.code)}
                    onMouseLeave={() => setHoveredState(null)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {s.code}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.races} races</p>
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
    </Layout>
  );
}
