import { ArrowRight, Calendar, Users, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function HeroSection() {
  // Example countdown - in real app this would be dynamic
  const daysUntilElection = 327;

  return (
    <section className="relative overflow-hidden gradient-hero">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="container relative py-20 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          {/* Election Countdown Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-2 text-sm font-medium text-primary-foreground backdrop-blur-sm animate-fade-in">
            <Calendar className="h-4 w-4" />
            <span>{daysUntilElection} days until Election Day 2026</span>
          </div>

          {/* Main Headline */}
          <h1 className="mb-6 font-heading text-4xl font-bold tracking-tight text-primary-foreground sm:text-5xl md:text-6xl animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            Know Your Candidates.
            <br />
            <span className="text-secondary">Vote Informed.</span>
          </h1>

          {/* Subheadline */}
          <p className="mb-10 text-lg text-primary-foreground/80 sm:text-xl max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            Transparent, non-partisan information on federal elections. 
            Explore candidates, track campaign funding, and find your polling place.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <Button variant="hero" size="xl" asChild>
              <Link to="/elections">
                Explore Elections
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="hero-outline" size="xl" asChild>
              <Link to="/voter-resources">
                Register to Vote
              </Link>
            </Button>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-16 grid gap-6 sm:grid-cols-3 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <FeatureCard
            icon={Users}
            title="Candidate Profiles"
            description="Comprehensive information on every federal candidate including biography and policy positions."
          />
          <FeatureCard
            icon={DollarSign}
            title="Campaign Finance"
            description="Follow the money. See who's funding campaigns and how candidates spend their funds."
          />
          <FeatureCard
            icon={Calendar}
            title="Election Calendar"
            description="Never miss a deadline. Track registration dates, primaries, and general elections."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="rounded-xl bg-primary-foreground/10 p-6 backdrop-blur-sm border border-primary-foreground/10 hover:bg-primary-foreground/15 transition-colors">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-2 font-heading text-lg font-semibold text-primary-foreground">{title}</h3>
      <p className="text-sm text-primary-foreground/70">{description}</p>
    </div>
  );
}
