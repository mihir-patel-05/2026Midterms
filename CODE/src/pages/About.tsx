import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Shield,
  Database,
  BookOpen,
  Scale,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

export default function About() {
  return (
    <Layout>
      {/* Hero */}
      <section className="gradient-hero py-16">
        <div className="container text-center">
          <h1 className="font-heading text-3xl font-bold text-primary-foreground sm:text-4xl mb-4">
            About VoteInformed
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto">
            Empowering informed civic participation through transparent,
            non-partisan election data and voter education.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <Target className="h-8 w-8 text-primary" />
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Our Mission
              </h2>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              VoteInformed exists to democratize access to election data, campaign finance
              information, and candidate ideological metrics. We believe every voter deserves
              transparent, accessible information to make informed decisions at the ballot box.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-3xl font-bold text-primary mb-1">50</p>
                <p className="text-sm text-muted-foreground">States Covered</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-3xl font-bold text-primary mb-1">435+</p>
                <p className="text-sm text-muted-foreground">Races Tracked</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-3xl font-bold text-primary mb-1">100%</p>
                <p className="text-sm text-muted-foreground">Non-Partisan</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Principles */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-8 text-center">
            Our Principles
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <PrincipleCard
              icon={Scale}
              title="Non-Partisan"
              description="We treat all candidates equally regardless of party affiliation. Our platform does not endorse or oppose any candidate."
            />
            <PrincipleCard
              icon={Shield}
              title="Transparent"
              description="We clearly disclose our data sources, methodology, and any limitations. You can verify everything we present."
            />
            <PrincipleCard
              icon={Database}
              title="Data-Driven"
              description="Our information comes from official sources like the FEC, state election offices, and verified voting records."
            />
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section className="py-16 bg-background" id="methodology">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <BookOpen className="h-8 w-8 text-primary" />
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Our Methodology
              </h2>
            </div>

            <div className="space-y-8">
              {/* Ideology Scoring */}
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Badge variant="secondary">Ideology Scores</Badge>
                </h3>
                <p className="text-muted-foreground mb-4">
                  Our ideology scores use a GovTrack-style methodology that analyzes:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Legislative voting patterns on recorded votes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Co-sponsorship networks and bill partnerships</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Historical voting record for incumbents</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Committee leadership and membership alignment</span>
                  </li>
                </ul>
                <p className="mt-4 text-sm text-muted-foreground">
                  Scores range from 0 (most progressive) to 100 (most conservative).
                  New candidates without voting records may not have scores available.
                </p>
              </div>

              {/* Campaign Finance */}
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Badge variant="secondary">Campaign Finance Data</Badge>
                </h3>
                <p className="text-muted-foreground mb-4">
                  All campaign finance information is sourced directly from the Federal Election
                  Commission (FEC). Data includes:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Total funds raised and spent per election cycle</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Breakdown by funding source (individual, PAC, self-funded)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <span>Cash on hand and expenditure categories</span>
                  </li>
                </ul>
                <p className="mt-4 text-sm text-muted-foreground">
                  Data is updated weekly during election season. All figures link to official FEC filings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-heading text-2xl font-bold text-foreground mb-8 text-center">
              Data Sources
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DataSourceCard
                name="Federal Election Commission"
                description="Official campaign finance data and filings"
                url="https://www.fec.gov"
              />
              <DataSourceCard
                name="GovTrack"
                description="Congressional voting records and bill tracking"
                url="https://www.govtrack.us"
              />
              <DataSourceCard
                name="State Election Offices"
                description="Official candidate lists and election dates"
                url="https://www.usa.gov/election-office"
              />
              <DataSourceCard
                name="Vote.gov"
                description="Voter registration resources and information"
                url="https://vote.gov"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="max-w-3xl mx-auto rounded-lg border border-border bg-card p-8">
            <h3 className="font-heading font-semibold text-foreground mb-4">
              Important Disclaimer
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              VoteInformed is an educational platform and does not endorse any candidate,
              party, or political position. While we strive for accuracy, information may
              change and we recommend verifying details through official sources. This site
              is not affiliated with any government agency, political party, or campaign.
              Campaign finance data is subject to FEC filing schedules and may not reflect
              the most recent activity.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function PrincipleCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-heading font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function DataSourceCard({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-border bg-card p-4 hover:border-primary hover:shadow-md transition-all flex items-start gap-4"
    >
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <ExternalLink className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <h4 className="font-heading font-semibold text-foreground">{name}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </a>
  );
}
