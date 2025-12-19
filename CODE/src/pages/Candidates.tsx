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
} from "lucide-react";
import { getCandidateById, getCandidateFinances } from "@/lib/api";
import type { Candidate, CandidateFinanceResponse } from "@/types/candidate";

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

export default function Candidates() {
  const { id } = useParams<{ id: string }>();
  
  // State for candidate data
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [finances, setFinances] = useState<CandidateFinanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
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

        // Fetch candidate details and finances in parallel
        const [candidateData, financeData] = await Promise.all([
          getCandidateById(id),
          getCandidateFinances(id, 2026).catch(() => null), // Gracefully handle missing finance data
        ]);

        setCandidate(candidateData);
        setFinances(financeData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load candidate";
        setError(errorMessage);
        console.error("[Candidates] Error fetching candidate:", errorMessage);
      } finally {
        setLoading(false);
      }
    }

    fetchCandidateData();
  }, [id]);

  // Calculate total finances from all committees
  const totalReceipts = finances?.finances.reduce(
    (sum, f) => sum + (f.summary?.totalReceipts || 0),
    0
  ) || candidate?.totalFundsRaised || 0;

  const totalDisbursements = finances?.finances.reduce(
    (sum, f) => sum + (f.summary?.totalDisbursements || 0),
    0
  ) || 0;

  const cashOnHand = finances?.finances.reduce(
    (sum, f) => sum + (f.summary?.cashOnHand || 0),
    0
  ) || 0;

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
                  </h3>
                  <dl className="space-y-3">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Raised</dt>
                      <dd className="font-semibold text-foreground">
                        {totalReceipts > 0 ? formatCurrency(totalReceipts) : "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Spent</dt>
                      <dd className="font-semibold text-foreground">
                        {totalDisbursements > 0 ? formatCurrency(totalDisbursements) : "N/A"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Cash on Hand</dt>
                      <dd className="font-semibold text-success">
                        {cashOnHand > 0 ? formatCurrency(cashOnHand) : "N/A"}
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
              {finances && finances.finances.length > 0 ? (
                <>
                  {finances.finances.map((committeeFin, index) => (
                    <div key={index} className="rounded-lg border border-border bg-card p-6">
                      <h2 className="font-heading text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
                        <PieChart className="h-5 w-5 text-primary" />
                        {committeeFin.committee.name}
                      </h2>
                      <p className="text-sm text-muted-foreground mb-6">
                        Committee ID: {committeeFin.committee.committeeId}
                      </p>

                      {committeeFin.summary ? (
                        <div className="space-y-4">
                          {/* Finance bars */}
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">
                                Total Receipts
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(committeeFin.summary.totalReceipts)}
                              </span>
                            </div>
                            <Progress
                              value={100}
                              className="h-2"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">
                                Total Disbursements
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(committeeFin.summary.totalDisbursements)}
                              </span>
                            </div>
                            <Progress
                              value={
                                committeeFin.summary.totalReceipts > 0
                                  ? (committeeFin.summary.totalDisbursements / committeeFin.summary.totalReceipts) * 100
                                  : 0
                              }
                              className="h-2"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">
                                Cash on Hand
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(committeeFin.summary.cashOnHand)}
                              </span>
                            </div>
                            <Progress
                              value={
                                committeeFin.summary.totalReceipts > 0
                                  ? (committeeFin.summary.cashOnHand / committeeFin.summary.totalReceipts) * 100
                                  : 0
                              }
                              className="h-2"
                            />
                          </div>

                          {committeeFin.summary.debtOwed > 0 && (
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="text-sm font-medium text-foreground">
                                  Debt Owed
                                </span>
                                <span className="text-sm text-destructive">
                                  {formatCurrency(committeeFin.summary.debtOwed)}
                                </span>
                              </div>
                            </div>
                          )}

                          <p className="mt-4 text-xs text-muted-foreground">
                            Cycle: {committeeFin.summary.cycle} | Last updated:{" "}
                            {new Date(committeeFin.summary.lastUpdated).toLocaleDateString()}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">
                          No financial data available for this committee.
                        </p>
                      )}
                    </div>
                  ))}

                  <p className="text-xs text-muted-foreground">
                    Data sourced from FEC filings. Financial figures are subject to reporting schedules.
                  </p>
                </>
              ) : (
                <div className="rounded-lg border border-border bg-card p-6 text-center">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-heading font-semibold text-foreground mb-2">
                    No Financial Data Available
                  </h3>
                  <p className="text-muted-foreground">
                    Campaign finance data for this candidate has not yet been reported or synced.
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
