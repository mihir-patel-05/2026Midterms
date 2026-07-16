import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateCard } from "@/components/candidates";
import { getCandidates } from "@/lib/api";

export function FeaturedCandidates() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["featuredCandidates", 2026],
    queryFn: () =>
      getCandidates({
        cycle: 2026,
        includeFunds: true,
        hasFinancialData: true,
        perPage: 4,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const candidates = data?.data ?? [];

  return (
    <section className="py-20 bg-background">
      <div className="container">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="font-heading text-3xl font-bold text-foreground mb-2">
              Candidate Profiles
            </h2>
            <p className="text-muted-foreground">
              Recently filed 2026 candidates with available campaign-finance data.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/candidates">
              View All Candidates
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading candidates…
          </div>
        ) : error ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            Candidate profiles are temporarily unavailable.
          </p>
        ) : candidates.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
            No 2026 candidates with financial filings are available yet.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {candidates.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} showIdeologyScore />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
