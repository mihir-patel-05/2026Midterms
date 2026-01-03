import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Users, ChevronRight, Filter, ArrowLeft, Search, Loader2 } from "lucide-react";
import { USMap } from "@/components/home/USMap";
import { Input } from "@/components/ui/input";
import { getElectionsByState, getStateElectionCounts } from "@/lib/api";
import type { Election, StateElectionCount } from "@/types/candidate";

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

function getCompetitivenessColor(rating?: string): string {
  if (!rating) return "bg-muted text-muted-foreground";
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

  const stateCode = state ? state.toUpperCase() : null;

  // Fetch state election counts for the map
  const { data: stateCountsData, isLoading: isLoadingCounts } = useQuery({
    queryKey: ['stateElectionCounts', 2026],
    queryFn: () => getStateElectionCounts(2026),
    enabled: !stateCode, // Only fetch when not viewing a specific state
  });

  // Fetch elections for specific state
  const { data: stateElectionsData, isLoading: isLoadingElections, error: electionsError } = useQuery({
    queryKey: ['stateElections', stateCode, 2026],
    queryFn: () => getElectionsByState(stateCode!, 2026),
    enabled: !!stateCode, // Only fetch when viewing a specific state
  });

  // Merge API data with all states - ensure every state is included
  const states: StateElectionCount[] = ALL_STATES.map(state => {
    // Find matching state data from API
    const apiData = stateCountsData?.states.find(s => s.state === state.code);

    return {
      code: state.code,
      name: state.name,
      races: apiData?.races || 0, // Use API data if available, otherwise 0
    };
  });

  const filteredStates = states.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter elections by type
  const filteredElections = stateElectionsData?.elections.filter(
    (election: Election) => {
      if (electionType === "general") {
        return election.electionType === "GENERAL";
      } else {
        return election.electionType === "PRIMARY";
      }
    }
  ) || [];

  // Get incumbent from candidates
  const getIncumbent = (election: Election) => {
    const incumbent = election.candidateElections?.find(ce => ce.isIncumbent);
    return incumbent?.candidate;
  };

  return (
    <Layout>
      <section className="bg-muted/30 border-b border-border">
        <div className="container py-8">
          {stateCode ? (
            <>
              <Link
                to="/elections"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                All States
              </Link>
              <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
                {stateCodeToName[stateCode] || stateCode} Federal Elections
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
          {stateCode ? (
            <>
              {isLoadingElections ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : electionsError ? (
                <div className="text-center py-12">
                  <p className="text-destructive">Error loading elections. Please try again later.</p>
                </div>
              ) : (
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
                        {filteredElections.length === 0 ? (
                          <div className="text-center py-12">
                            <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                            <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                              No General Elections Found
                            </h3>
                            <p className="text-muted-foreground">
                              There are no general elections scheduled for this state yet.
                            </p>
                          </div>
                        ) : (
                          filteredElections.map((election: Election) => {
                            const incumbent = getIncumbent(election);
                            const candidateCount = election._count?.candidateElections || 0;

                            return (
                              <Link
                                key={election.id}
                                to={`/candidates?state=${election.state}&office=${election.officeType}${election.district ? `&district=${election.district}` : ''}`}
                                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                                    {election.officeType === "SENATE" ? "S" : `H${election.district || "?"}`}
                                  </div>
                                  <div>
                                    <h3 className="font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
                                      {election.officeType === "SENATE"
                                        ? `${stateCodeToName[election.state] || election.state} Senate`
                                        : `${stateCodeToName[election.state] || election.state} District ${election.district}`}
                                    </h3>
                                    {incumbent && (
                                      <p className="text-sm text-muted-foreground">
                                        Incumbent: {incumbent.name} ({incumbent.party?.substring(0, 1) || "?"})
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {candidateCount} candidate{candidateCount !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                              </Link>
                            );
                          })
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="primary">
                      {filteredElections.length === 0 ? (
                        <div className="text-center py-12">
                          <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                          <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                            Primary Elections Coming Soon
                          </h3>
                          <p className="text-muted-foreground">
                            Primary election information will be available as filing deadlines approach.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredElections.map((election: Election) => {
                            const incumbent = getIncumbent(election);
                            const candidateCount = election._count?.candidateElections || 0;

                            return (
                              <Link
                                key={election.id}
                                to={`/candidates?state=${election.state}&office=${election.officeType}${election.district ? `&district=${election.district}` : ''}`}
                                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 hover:border-primary hover:shadow-md transition-all"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                                    {election.officeType === "SENATE" ? "S" : `H${election.district || "?"}`}
                                  </div>
                                  <div>
                                    <h3 className="font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
                                      {election.officeType === "SENATE"
                                        ? `${stateCodeToName[election.state] || election.state} Senate Primary`
                                        : `${stateCodeToName[election.state] || election.state} District ${election.district} Primary`}
                                    </h3>
                                    {incumbent && (
                                      <p className="text-sm text-muted-foreground">
                                        Incumbent: {incumbent.name} ({incumbent.party?.substring(0, 1) || "?"})
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(election.electionDate).toLocaleDateString()}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {candidateCount} candidate{candidateCount !== 1 ? 's' : ''}
                                    </p>
                                  </div>
                                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </>
          ) : (
            <>
              {/* Interactive US Map */}
              {isLoadingCounts ? (
                <div className="flex items-center justify-center py-12 mb-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="mb-12">
                  <USMap
                    states={states}
                    hoveredState={hoveredState}
                    onStateHover={setHoveredState}
                  />
                </div>
              )}

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
