import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  DollarSign,
  TrendingUp,
  ExternalLink,
  ArrowLeft,
  Globe,
  Twitter,
  Building2,
  PieChart,
} from "lucide-react";

const mockCandidates = [
  {
    id: "1",
    name: "Sarah Mitchell",
    party: "Democratic",
    office: "Senate",
    state: "Arizona",
    incumbent: false,
    bio: "Former state representative with 8 years of legislative experience. Focused on healthcare reform and education funding.",
    fundsRaised: 4250000,
    fundsSpent: 2100000,
    cashOnHand: 2150000,
    topDonors: [
      { name: "Individual Contributions", amount: 2800000, percentage: 66 },
      { name: "PAC Contributions", amount: 850000, percentage: 20 },
      { name: "Self-Funded", amount: 600000, percentage: 14 },
    ],
    ideologyScore: 35,
    website: "https://mitchellforsenate.com",
    twitter: "@SarahMitchell",
  },
  {
    id: "2",
    name: "Robert Chen",
    party: "Republican",
    office: "House",
    state: "California",
    district: 12,
    incumbent: true,
    bio: "Serving his third term in Congress. Member of the Ways and Means Committee. Small business owner before entering politics.",
    fundsRaised: 2800000,
    fundsSpent: 1500000,
    cashOnHand: 1300000,
    topDonors: [
      { name: "Individual Contributions", amount: 1400000, percentage: 50 },
      { name: "PAC Contributions", amount: 1120000, percentage: 40 },
      { name: "Party Committee", amount: 280000, percentage: 10 },
    ],
    ideologyScore: 72,
    website: "https://chenforconress.com",
    twitter: "@RepRobertChen",
  },
];

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

function getPartyColor(party: string): string {
  switch (party) {
    case "Democratic":
      return "bg-info/10 text-info border-info/20";
    case "Republican":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function Candidates() {
  const { id } = useParams();
  const [searchQuery, setSearchQuery] = useState("");

  const candidate = id ? mockCandidates.find((c) => c.id === id) : null;

  if (candidate) {
    return (
      <Layout>
        {/* Hero */}
        <section className="bg-muted/30 border-b border-border">
          <div className="container py-8">
            <Link
              to="/candidates"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              All Candidates
            </Link>

            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="h-24 w-24 rounded-xl bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground shrink-0">
                {candidate.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h1 className="font-heading text-3xl font-bold text-foreground">
                    {candidate.name}
                  </h1>
                  <Badge variant="outline" className={getPartyColor(candidate.party)}>
                    {candidate.party}
                  </Badge>
                  {candidate.incumbent && (
                    <Badge variant="secondary">Incumbent</Badge>
                  )}
                </div>
                <p className="text-lg text-muted-foreground mb-4">
                  {candidate.office === "House"
                    ? `${candidate.state} District ${candidate.district}`
                    : `${candidate.state} Senate`}
                </p>
                <div className="flex flex-wrap gap-3">
                  {candidate.website && (
                    <a
                      href={candidate.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Globe className="h-4 w-4" />
                      Campaign Website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {candidate.twitter && (
                    <a
                      href={`https://twitter.com/${candidate.twitter.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Twitter className="h-4 w-4" />
                      {candidate.twitter}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-8">
          <div className="container">
            <Tabs defaultValue="overview">
              <TabsList className="mb-8">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="funding">Campaign Finance</TabsTrigger>
                <TabsTrigger value="ideology">Ideology</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="rounded-lg border border-border bg-card p-6">
                  <h2 className="font-heading text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Biography
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {candidate.bio}
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Quick Finance Stats */}
                  <div className="rounded-lg border border-border bg-card p-6">
                    <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-primary" />
                      Campaign Finance Summary
                    </h3>
                    <dl className="space-y-3">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Total Raised</dt>
                        <dd className="font-semibold text-foreground">
                          {formatCurrency(candidate.fundsRaised)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Total Spent</dt>
                        <dd className="font-semibold text-foreground">
                          {formatCurrency(candidate.fundsSpent)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Cash on Hand</dt>
                        <dd className="font-semibold text-success">
                          {formatCurrency(candidate.cashOnHand)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Quick Ideology Score */}
                  <div className="rounded-lg border border-border bg-card p-6">
                    <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Ideology Score
                    </h3>
                    <div className="space-y-4">
                      <div className="text-center">
                        <span className="text-4xl font-bold text-foreground">
                          {candidate.ideologyScore}
                        </span>
                        <span className="text-lg text-muted-foreground">/100</span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${candidate.ideologyScore}%`,
                            background: `linear-gradient(90deg, hsl(200, 75%, 45%) 0%, hsl(280, 50%, 50%) 50%, hsl(0, 70%, 50%) 100%)`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Progressive</span>
                        <span>Moderate</span>
                        <span>Conservative</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="funding" className="space-y-6">
                <div className="rounded-lg border border-border bg-card p-6">
                  <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                    <PieChart className="h-5 w-5 text-primary" />
                    Funding Sources
                  </h2>
                  <div className="space-y-4">
                    {candidate.topDonors.map((donor, index) => (
                      <div key={index}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-foreground">
                            {donor.name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(donor.amount)} ({donor.percentage}%)
                          </span>
                        </div>
                        <Progress value={donor.percentage} className="h-2" />
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-xs text-muted-foreground">
                    Data sourced from FEC filings. Last updated: December 2024.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="ideology" className="space-y-6">
                <div className="rounded-lg border border-border bg-card p-6">
                  <h2 className="font-heading text-xl font-semibold text-foreground mb-4">
                    Understanding the Ideology Score
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    The ideology score is calculated using GovTrack-style methodology, analyzing
                    legislative voting patterns and co-sponsorship networks. Scores range from
                    0 (most progressive) to 100 (most conservative).
                  </p>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <h3 className="font-semibold text-foreground mb-2">Score Components</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Legislative voting patterns</li>
                      <li>• Bill co-sponsorship analysis</li>
                      <li>• Committee membership alignment</li>
                      <li>• Historical voting record</li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </Layout>
    );
  }

  // Candidate list view
  const filteredCandidates = mockCandidates.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.state.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Layout>
      <section className="bg-muted/30 border-b border-border">
        <div className="container py-8">
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Candidate Profiles
          </h1>
          <p className="mt-2 text-muted-foreground">
            Explore candidate backgrounds, campaign funding, and ideology scores.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="container">
          {/* Search */}
          <div className="mb-8 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search candidates by name or state..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Candidate Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCandidates.map((candidate) => (
              <Link
                key={candidate.id}
                to={`/candidates/${candidate.id}`}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:border-primary/50 transition-all"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
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
                  <p className="text-sm text-muted-foreground mb-4">
                    {candidate.office === "House"
                      ? `${candidate.state} District ${candidate.district}`
                      : `${candidate.state} Senate`}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Funds Raised</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(candidate.fundsRaised)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
