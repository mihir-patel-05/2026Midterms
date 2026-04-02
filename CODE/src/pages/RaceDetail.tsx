import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { CandidateCard } from "@/components/candidates";
import { getElectionById } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Calendar,
  Users,
  BarChart3,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Candidate } from "@/types/candidate";

const stateCodeToName: Record<string, string> = {
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

function getRaceTitle(officeType: string, state: string, district?: string | null): string {
  const stateName = stateCodeToName[state.toUpperCase()] || state;
  if (officeType === "SENATE") {
    return `${stateName} Senate`;
  }
  return `${stateName} District ${district || "At-Large"}`;
}

export default function RaceDetail() {
  const { state, electionId } = useParams<{ state: string; electionId: string }>();
  const stateCode = state?.toUpperCase() || "";

  const { data: election, isLoading, error } = useQuery({
    queryKey: ["election", electionId],
    queryFn: () => getElectionById(electionId!),
    enabled: !!electionId,
  });

  const candidates: Candidate[] =
    election?.candidateElections
      ?.map((ce) => ce.candidate)
      .filter((c): c is Candidate => !!c) ?? [];

  const incumbent = election?.candidateElections?.find((ce) => ce.isIncumbent)?.candidate;

  return (
    <Layout>
      {/* Header */}
      <section className="bg-muted/30 border-b border-border">
        <div className="container py-8">
          <Link
            to={`/elections/${state}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {stateCodeToName[stateCode] || stateCode} Elections
          </Link>

          {isLoading ? (
            <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          ) : election ? (
            <>
              <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
                {getRaceTitle(election.officeType, election.state, election.district)}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {election.electionType === "PRIMARY" ? "Primary" : "General"} Election
                {" \u2014 "}
                {new Date(election.electionDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">
                  {election.officeType === "SENATE" ? "U.S. Senate" : "U.S. House"}
                </Badge>
                <Badge variant="outline">
                  {election.electionType === "PRIMARY" ? "Primary" : "General"}
                </Badge>
                <Badge variant="outline">
                  {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className="py-8">
        <div className="container">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20" role="status" aria-live="polite">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground">Loading race details...</p>
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="rounded-full bg-destructive/10 p-4 mb-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
                Failed to Load Race Details
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md text-center">
                {error instanceof Error ? error.message : "An unexpected error occurred."}
              </p>
              <Button variant="outline" asChild>
                <Link to={`/elections/${state}`}>Back to Elections</Link>
              </Button>
            </div>
          )}

          {/* Content */}
          {!isLoading && !error && election && (
            <>
              {/* Race Info Card */}
              <div className="rounded-lg border border-border bg-card p-6 mb-8">
                <h2 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Race Overview
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Office</p>
                    <p className="font-medium text-foreground">
                      {election.officeType === "SENATE"
                        ? "U.S. Senate"
                        : `U.S. House - District ${election.district || "At-Large"}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Election Date</p>
                    <p className="font-medium text-foreground">
                      {new Date(election.electionDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Candidates</p>
                    <p className="font-medium text-foreground">
                      {candidates.length} running
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Incumbent</p>
                    <p className="font-medium text-foreground">
                      {incumbent
                        ? `${incumbent.name} (${incumbent.party?.substring(0, 1) || "?"})`
                        : "Open seat"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Candidates Section */}
              <div className="mb-8">
                <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Candidates ({candidates.length})
                </h2>

                {candidates.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                      No Candidates Found
                    </h3>
                    <p className="text-muted-foreground">
                      No candidates have been registered for this race yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {candidates.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        showIdeologyScore={true}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Polling Placeholder */}
              <div>
                <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Polling Data
                </h2>
                <div
                  className="rounded-lg border border-border bg-card p-8 text-center"
                  aria-label="Polling data is not yet available for this race"
                >
                  <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
                    Polling Data Coming Soon
                  </h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    We're working on integrating polling data for this race.
                    Check back soon for the latest survey results and trend analysis.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
