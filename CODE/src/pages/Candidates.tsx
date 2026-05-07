/**
 * Candidate Profile Page - Displays detailed candidate information
 * Fetches real data from the API using the candidate ID
 */

import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  TrendingUp,
  ExternalLink,
  ArrowLeft,
  Globe,
  Twitter,
  Building2,
  PieChart,
  Loader2,
  AlertCircle,
  Users,
  Wallet,
  Receipt,
  MapPin,
  Briefcase,
} from "lucide-react";
import { getCandidateById, getCandidateDetailedFinances } from "@/lib/api";
import type { Candidate, DetailedFinanceResponse } from "@/types/candidate";
import { LobbyBreakdown } from "@/components/candidates/LobbyBreakdown";

/**
 * Format currency amount to readable string
 */
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toFixed(0)}`;
}

/**
 * Get party color classes for badges
 */
function getPartyColor(party?: string): string {
  if (!party) return "bg-muted text-muted-foreground";
  
  const normalizedParty = party.toUpperCase();
  if (normalizedParty.includes("DEM")) {
    return "bg-info/10 text-info border-info/20";
  }
  if (normalizedParty.includes("REP")) {
    return "bg-destructive/10 text-destructive border-destructive/20";
  }
  return "bg-muted text-muted-foreground";
}

/**
 * Get full party name
 */
function getPartyName(party?: string): string {
  if (!party) return "Independent";
  
  const normalized = party.toUpperCase();
  if (normalized.includes("DEM")) return "Democratic";
  if (normalized.includes("REP")) return "Republican";
  return party;
}

/**
 * Get initials from candidate name
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/**
 * Format office location string
 */
function formatOfficeLocation(candidate: Candidate): string {
  const office = candidate.office?.toUpperCase();
  
  if (office === "H" || office === "HOUSE") {
    if (candidate.district) {
      return `${candidate.state} District ${candidate.district}`;
    }
    return `${candidate.state} House of Representatives`;
  }
  
  if (office === "S" || office === "SENATE") {
    return `${candidate.state} Senate`;
  }
  
  return candidate.state;
}

/**
 * Get color for funding source type
 */
function getFundingSourceColor(type: string): string {
  switch (type) {
    case "Individual":
      return "bg-emerald-500";
    case "PAC":
      return "bg-amber-500";
    case "Party":
      return "bg-blue-500";
    case "Self-funded":
      return "bg-purple-500";
    default:
      return "bg-gray-500";
  }
}

/**
 * Get color for spending category
 */
function getSpendingCategoryColor(category: string): string {
  switch (category) {
    case "Media/Advertising":
      return "bg-rose-500";
    case "Fundraising":
      return "bg-amber-500";
    case "Operations":
      return "bg-sky-500";
    case "Payroll":
      return "bg-emerald-500";
    case "Travel":
      return "bg-violet-500";
    case "Consulting":
      return "bg-indigo-500";
    case "Events":
      return "bg-pink-500";
    default:
      return "bg-gray-500";
  }
}

export default function Candidates() {
  const { id } = useParams<{ id: string }>();
  
  // State for candidate data
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [detailedFinances, setDetailedFinances] = useState<DetailedFinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [financesLoading, setFinancesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch candidate data when ID changes
  useEffect(() => {
    async function fetchCandidateData() {
      if (!id) {
        setError("No candidate ID provided");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // First fetch candidate details
        const candidateData = await getCandidateById(id);
        setCandidate(candidateData);
        setLoading(false);

        // Then fetch detailed finances (may take longer as it syncs from FEC)
        setFinancesLoading(true);
        try {
          const financeData = await getCandidateDetailedFinances(id, 2026);
          setDetailedFinances(financeData);
        } catch (finErr) {
          console.error("[Candidates] Error fetching finances:", finErr);
          // Don't set error - finances are optional
        } finally {
          setFinancesLoading(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load candidate";
        setError(errorMessage);
        console.error("[Candidates] Error fetching candidate:", errorMessage);
        setLoading(false);
      }
    }

    fetchCandidateData();
  }, [id]);

  // Get ideology score
  const ideologyScore = candidate?.ideologyScores?.[0]?.ideologyScore;

  // Loading state
  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium text-foreground">Loading candidate profile...</p>
        </div>
      </Layout>
    );
  }

  // Error state
  if (error || !candidate) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
            {error || "Candidate Not Found"}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md text-center">
            We couldn't find the candidate you're looking for. They may have been removed or the link is incorrect.
          </p>
          <Button asChild variant="outline">
            <Link to="/candidates">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Candidates
            </Link>
          </Button>
        </div>
      </Layout>
    );
  }

  // Determine if candidate is incumbent
  const isIncumbent = candidate.incumbent || candidate.incumbentStatus === "I";

  // Use detailed finances if available
  const summary = detailedFinances?.summary;
  const fundingSources = detailedFinances?.fundingSources || [];
  const topDonors = detailedFinances?.topDonors || [];
  const spendingCategories = detailedFinances?.spendingCategories || [];

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
            {/* Avatar */}
            <div className="h-24 w-24 rounded-xl bg-muted flex items-center justify-center text-3xl font-bold text-muted-foreground shrink-0">
              {getInitials(candidate.name)}
            </div>

            <div className="flex-1">
              {/* Name and badges */}
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="font-heading text-3xl font-bold text-foreground">
                  {candidate.name}
                </h1>
                <Badge variant="outline" className={getPartyColor(candidate.party)}>
                  {getPartyName(candidate.party)}
                </Badge>
                {isIncumbent && (
                  <Badge variant="secondary">Incumbent</Badge>
                )}
              </div>

              {/* Office and location */}
              <p className="text-lg text-muted-foreground mb-4">
                {formatOfficeLocation(candidate)}
              </p>

              {/* Links */}
              <div className="flex flex-wrap gap-3">
                {candidate.campaignWebsite && (
                  <a
                    href={candidate.campaignWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Globe className="h-4 w-4" />
                    Campaign Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {candidate.socialMedia?.twitter && (
                  <a
                    href={`https://twitter.com/${candidate.socialMedia.twitter.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Twitter className="h-4 w-4" />
                    {candidate.socialMedia.twitter.startsWith("@") 
                      ? candidate.socialMedia.twitter 
                      : `@${candidate.socialMedia.twitter}`}
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
              {ideologyScore !== undefined && (
                <TabsTrigger value="ideology">Ideology</TabsTrigger>
              )}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Biography */}
              {candidate.biography && (
                <div className="rounded-lg border border-border bg-card p-6">
                  <h2 className="font-heading text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Biography
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {candidate.biography}
                  </p>
                </div>
              )}

              {/* Quick stats grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Campaign Finance Summary */}
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Campaign Finance Summary
                    {financesLoading && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
                    )}
                  </h3>
                  <dl className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Raised</dt>
                      <dd className="font-semibold text-foreground">
                        {summary && summary.totalReceipts > 0 ? formatCurrency(summary.totalReceipts) : "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Spent</dt>
                      <dd className="font-semibold text-foreground">
                        {summary && summary.totalDisbursements > 0 ? formatCurrency(summary.totalDisbursements) : "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Cash on Hand</dt>
                      <dd className="font-semibold text-success">
                        {summary && summary.cashOnHand > 0 ? formatCurrency(summary.cashOnHand) : "N/A"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Ideology Score */}
                {ideologyScore !== undefined && (
                  <div className="rounded-lg border border-border bg-card p-6">
                    <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Ideology Score
                    </h3>
                    <div className="space-y-4">
                      <div className="text-center">
                        <span className="text-4xl font-bold text-foreground">
                          {ideologyScore}
                        </span>
                        <span className="text-lg text-muted-foreground">/100</span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${ideologyScore}%`,
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
                )}

                {/* Candidate Info Card (when no ideology score) */}
                {ideologyScore === undefined && (
                  <div className="rounded-lg border border-border bg-card p-6">
                    <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Candidate Info
                    </h3>
                    <dl className="space-y-3">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Party</dt>
                        <dd className="font-semibold text-foreground">
                          {getPartyName(candidate.party)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">State</dt>
                        <dd className="font-semibold text-foreground">
                          {candidate.state}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="font-semibold text-foreground">
                          {isIncumbent ? "Incumbent" : "Challenger"}
                        </dd>
                      </div>
                      {candidate.district && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">District</dt>
                          <dd className="font-semibold text-foreground">
                            {candidate.district}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>

              {/* Committees */}
              {candidate.committees && candidate.committees.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Campaign Committees
                  </h3>
                  <ul className="space-y-2">
                    {candidate.committees.map((committee) => (
                      <li
                        key={committee.id}
                        className="flex items-center justify-between py-2 border-b border-border last:border-b-0"
                      >
                        <span className="text-foreground">{committee.name}</span>
                        <span className="text-sm text-muted-foreground font-mono">
                          {committee.committeeId}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            {/* Campaign Finance Tab */}
            <TabsContent value="funding" className="space-y-6">
              {/* Industry / Lobby Breakdown — fetches independently so it
                  renders even when detailed-finances data is missing. */}
              {id && <LobbyBreakdown candidateId={id} cycle={2026} />}

              {financesLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Loading financial data from FEC...</p>
                  <p className="text-sm text-muted-foreground mt-2">This may take a moment</p>
                </div>
              ) : detailedFinances && (summary?.totalReceipts > 0 || fundingSources.length > 0) ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Receipt className="h-4 w-4" />
                        <span className="text-sm">Total Raised</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(summary?.totalReceipts || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Wallet className="h-4 w-4" />
                        <span className="text-sm">Total Spent</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {formatCurrency(summary?.totalDisbursements || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-sm">Cash on Hand</span>
                      </div>
                      <p className="text-2xl font-bold text-success">
                        {formatCurrency(summary?.cashOnHand || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">Debt Owed</span>
                      </div>
                      <p className={`text-2xl font-bold ${(summary?.debtOwed || 0) > 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {formatCurrency(summary?.debtOwed || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Funding Sources */}
                  {fundingSources.length > 0 && (
                    <div className="rounded-lg border border-border bg-card p-6">
                      <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                        <PieChart className="h-5 w-5 text-primary" />
                        Funding Sources
                      </h2>
                      <div className="space-y-4">
                        {fundingSources.map((source, index) => (
                          <div key={index}>
                            <div className="flex justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`h-3 w-3 rounded-full ${getFundingSourceColor(source.type)}`} />
                                <span className="text-sm font-medium text-foreground">
                                  {source.type}
                                </span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(source.amount)} ({source.percentage}%)
                              </span>
                            </div>
                            <Progress value={source.percentage} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Donors */}
                  {topDonors.length > 0 && (
                    <div className="rounded-lg border border-border bg-card p-6">
                      <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        Top Contributors
                      </h2>
                      <div className="space-y-3">
                        {topDonors.map((donor, index) => (
                          <div
                            key={index}
                            className="flex items-start justify-between py-3 border-b border-border last:border-b-0"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{donor.name}</p>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                                {donor.employer && (
                                  <span className="flex items-center gap-1">
                                    <Briefcase className="h-3 w-3" />
                                    {donor.employer}
                                  </span>
                                )}
                                {donor.state && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {donor.state}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="font-semibold text-foreground ml-4">
                              {formatCurrency(donor.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spending Categories */}
                  {spendingCategories.length > 0 && (
                    <div className="rounded-lg border border-border bg-card p-6">
                      <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-primary" />
                        Spending Breakdown
                      </h2>
                      <div className="space-y-4">
                        {spendingCategories.map((category, index) => (
                          <div key={index}>
                            <div className="flex justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`h-3 w-3 rounded-full ${getSpendingCategoryColor(category.category)}`} />
                                <span className="text-sm font-medium text-foreground">
                                  {category.category}
                                </span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(category.amount)} ({category.percentage}%)
                              </span>
                            </div>
                            <Progress value={category.percentage} className="h-2" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Data sourced from FEC filings. Last synced: {new Date(detailedFinances.lastSynced).toLocaleDateString()}.
                    Financial figures are subject to reporting schedules.
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-border bg-card p-6 text-center">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-heading font-semibold text-foreground mb-2">
                    No Financial Data Available
                  </h3>
                  <p className="text-muted-foreground">
                    Campaign finance data for this candidate has not yet been reported to the FEC or is being synced.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Ideology Tab */}
            {ideologyScore !== undefined && (
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
                  
                  {/* Score visualization */}
                  <div className="mb-8">
                    <div className="text-center mb-4">
                      <span className="text-5xl font-bold text-foreground">
                        {ideologyScore}
                      </span>
                      <span className="text-xl text-muted-foreground">/100</span>
                    </div>
                    <div className="h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${ideologyScore}%`,
                          background: `linear-gradient(90deg, hsl(200, 75%, 45%) 0%, hsl(280, 50%, 50%) 50%, hsl(0, 70%, 50%) 100%)`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                      <span>Progressive</span>
                      <span>Moderate</span>
                      <span>Conservative</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h3 className="font-semibold text-foreground mb-2">Score Components</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Legislative voting patterns</li>
                      <li>• Bill co-sponsorship analysis</li>
                      <li>• Committee membership alignment</li>
                      <li>• Historical voting record</li>
                    </ul>
                  </div>

                  {/* Additional ideology data */}
                  {candidate.ideologyScores && candidate.ideologyScores[0] && (
                    <div className="mt-6 pt-6 border-t border-border">
                      <h3 className="font-semibold text-foreground mb-4">Legislative Activity</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Bills Sponsored</p>
                          <p className="text-2xl font-bold text-foreground">
                            {candidate.ideologyScores[0].billsSponsored}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Bills Co-sponsored</p>
                          <p className="text-2xl font-bold text-foreground">
                            {candidate.ideologyScores[0].billsCosponsored}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </section>
    </Layout>
  );
}
