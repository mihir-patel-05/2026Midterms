import { Link } from "react-router-dom";
import { Vote, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-2 font-heading text-lg font-bold text-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Vote className="h-4 w-4" />
              </div>
              VoteInformed
            </Link>
            <p className="text-sm text-muted-foreground">
              Empowering informed civic participation through transparent, non-partisan election data.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-4 font-heading font-semibold text-foreground">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/elections" className="text-muted-foreground hover:text-primary transition-colors">
                  Elections by State
                </Link>
              </li>
              <li>
                <Link to="/candidates" className="text-muted-foreground hover:text-primary transition-colors">
                  Candidate Profiles
                </Link>
              </li>
              <li>
                <Link to="/voter-resources" className="text-muted-foreground hover:text-primary transition-colors">
                  Voter Registration
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="mb-4 font-heading font-semibold text-foreground">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/about#methodology" className="text-muted-foreground hover:text-primary transition-colors">
                  Our Methodology
                </Link>
              </li>
              <li>
                <Link to="/about#faq" className="text-muted-foreground hover:text-primary transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/research" className="text-muted-foreground hover:text-primary transition-colors">
                  Researcher Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* External Links */}
          <div>
            <h4 className="mb-4 font-heading font-semibold text-foreground">Official Sources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href="https://www.fec.gov" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  FEC.gov <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a 
                  href="https://vote.gov" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  Vote.gov <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>
                <a 
                  href="https://www.usa.gov/election-office" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  State Election Offices <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
            <p>© 2024 VoteInformed. A non-partisan civic project.</p>
            <p className="text-center text-xs">
              This site does not endorse any candidate or party. Data sourced from FEC and official state records.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
