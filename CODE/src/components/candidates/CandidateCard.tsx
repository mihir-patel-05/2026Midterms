/**
 * Reusable CandidateCard component
 * Displays candidate information in a card format with consistent styling
 */

import { Link } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Candidate } from "@/types/candidate";

/**
 * Props for CandidateCard component
 */
interface CandidateCardProps {
  candidate: Candidate;
  /** Optional className for custom styling */
  className?: string;
  /** Whether to show ideology score (if available) */
  showIdeologyScore?: boolean;
}

/**
 * Format currency amount to readable string
 * @param amount - Amount in dollars
 * @returns Formatted string like "$4.2M" or "$950K"
 */
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
}

/**
 * Get party color classes for badges
 * @param party - Party name (e.g., "DEM", "REP", "Democratic", "Republican")
 * @returns Tailwind CSS classes for badge styling
 */
function getPartyColor(party?: string): string {
  if (!party) return "bg-muted text-muted-foreground";

  // Normalize party name
  const normalizedParty = party.toUpperCase();

  // Using neutral colors per PRD requirement (non-partisan)
  if (normalizedParty.includes("DEM")) {
    return "bg-info/10 text-info border-info/20";
  }
  if (normalizedParty.includes("REP")) {
    return "bg-destructive/10 text-destructive border-destructive/20";
  }
  return "bg-muted text-muted-foreground";
}

/**
 * Get party abbreviation for display
 * @param party - Party name
 * @returns Single letter abbreviation
 */
function getPartyAbbreviation(party?: string): string {
  if (!party) return "I";

  const normalized = party.toUpperCase();
  if (normalized.includes("DEM")) return "D";
  if (normalized.includes("REP")) return "R";
  return party.charAt(0).toUpperCase();
}

/**
 * Get initials from candidate name
 * @param name - Full name
 * @returns Initials (e.g., "SM" for "Sarah Mitchell")
 */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

/**
 * Format office and location display
 * @param candidate - Candidate object
 * @returns Formatted location string
 */
function formatLocation(candidate: Candidate): string {
  const office = candidate.office?.toUpperCase();
  
  if (office === "HOUSE") {
    if (candidate.district) {
      return `${candidate.state} District ${candidate.district}`;
    }
    return `${candidate.state} House`;
  }
  
  if (office === "SENATE") {
    return `${candidate.state} Senate`;
  }
  
  // Fallback: show office type if available, otherwise just state
  if (candidate.office) {
    return `${candidate.state} ${candidate.office}`;
  }
  
  return candidate.state;
}

/**
 * CandidateCard Component
 *
 * Displays candidate information in a card format matching the design
 * from FeaturedCandidates.tsx
 *
 * @example
 * ```tsx
 * <CandidateCard candidate={candidate} />
 * ```
 */
export function CandidateCard({
  candidate,
  className = "",
  showIdeologyScore = false,
}: CandidateCardProps) {
  // Determine if candidate is incumbent
  const isIncumbent = candidate.incumbent || candidate.incumbentStatus === "I";

  // Get the latest ideology score if available
  const latestIdeologyScore = candidate.ideologyScores?.[0]?.ideologyScore;

  return (
    <Link
      to={`/candidates/${candidate.id}`}
      className={`group rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg hover:border-primary/50 transition-all ${className}`}
    >
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-start justify-between mb-3">
          {/* Avatar with initials */}
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
            {getInitials(candidate.name)}
          </div>

          {/* Party badge */}
          <Badge variant="outline" className={getPartyColor(candidate.party)}>
            {getPartyAbbreviation(candidate.party)}
          </Badge>
        </div>

        {/* Name */}
        <h3 className="font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
          {candidate.name}
        </h3>

        {/* Office and Location */}
        <p className="text-sm text-muted-foreground">
          {formatLocation(candidate)}
        </p>

        {/* Incumbent badge */}
        {isIncumbent && (
          <Badge variant="secondary" className="mt-2 text-xs">
            Incumbent
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="p-5 space-y-4">
        {/* Funds Raised */}
        {candidate.totalFundsRaised !== undefined && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>Funds Raised</span>
            </div>
            <span className="font-semibold text-foreground">
              {formatCurrency(candidate.totalFundsRaised)}
            </span>
          </div>
        )}

        {/* Ideology Score (optional) */}
        {showIdeologyScore && latestIdeologyScore !== undefined && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Ideology Score</span>
              <span className="text-sm font-medium text-foreground">
                {latestIdeologyScore}/100
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${latestIdeologyScore}%`,
                  background: `linear-gradient(90deg, hsl(200, 75%, 45%) 0%, hsl(280, 50%, 50%) 50%, hsl(0, 70%, 50%) 100%)`,
                  backgroundSize: "100vw",
                  backgroundPosition: `${latestIdeologyScore}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Progressive</span>
              <span>Conservative</span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

export default CandidateCard;
