import { Link } from "react-router-dom";
import { ArrowRight, DollarSign, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const featuredCandidates = [
  {
    id: "1",
    name: "Sarah Mitchell",
    party: "Democratic",
    office: "Senate",
    state: "Arizona",
    incumbent: false,
    fundsRaised: 4250000,
    ideologyScore: 35,
    image: null,
  },
  {
    id: "2",
    name: "Robert Chen",
    party: "Republican",
    office: "House",
    state: "California",
    district: 12,
    incumbent: true,
    fundsRaised: 2800000,
    ideologyScore: 72,
    image: null,
  },
  {
    id: "3",
    name: "Maria Rodriguez",
    party: "Democratic",
    office: "Senate",
    state: "Texas",
    incumbent: false,
    fundsRaised: 5100000,
    ideologyScore: 28,
    image: null,
  },
  {
    id: "4",
    name: "James Walker",
    party: "Republican",
    office: "House",
    state: "Florida",
    district: 7,
    incumbent: true,
    fundsRaised: 1950000,
    ideologyScore: 68,
    image: null,
  },
];

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

function getPartyColor(party: string): string {
  // Using neutral colors per PRD requirement (non-partisan)
  switch (party) {
    case "Democratic":
      return "bg-info/10 text-info border-info/20";
    case "Republican":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function FeaturedCandidates() {
  return (
    <section className="py-20 bg-background">
      <div className="container">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="font-heading text-3xl font-bold text-foreground mb-2">
              Featured Candidates
            </h2>
            <p className="text-muted-foreground">
              Explore candidate profiles with funding data and ideology scores.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/candidates">
              View All Candidates
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredCandidates.map((candidate) => (
            <Link
              key={candidate.id}
              to={`/candidates/${candidate.id}`}
              className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:border-primary/50 transition-all"
            >
              {/* Header */}
              <div className="p-5 border-b border-border">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
                    {candidate.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <Badge variant="outline" className={getPartyColor(candidate.party)}>
                    {candidate.party.substring(0, 1)}
                  </Badge>
                </div>
                <h3 className="font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
                  {candidate.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {candidate.office === "House" 
                    ? `${candidate.state} District ${candidate.district}`
                    : `${candidate.state} Senate`
                  }
                </p>
                {candidate.incumbent && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    Incumbent
                  </Badge>
                )}
              </div>

              {/* Stats */}
              <div className="p-5 space-y-4">
                {/* Funds Raised */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>Funds Raised</span>
                  </div>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(candidate.fundsRaised)}
                  </span>
                </div>

                {/* Ideology Score */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>Ideology Score</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {candidate.ideologyScore}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${candidate.ideologyScore}%`,
                        background: `linear-gradient(90deg, hsl(200, 75%, 45%) 0%, hsl(280, 50%, 50%) 50%, hsl(0, 70%, 50%) 100%)`,
                        backgroundSize: "100vw",
                        backgroundPosition: `${candidate.ideologyScore}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>Progressive</span>
                    <span>Conservative</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
