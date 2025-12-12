import { Link } from "react-router-dom";
import { ClipboardCheck, MapPin, FileText, HelpCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const resources = [
  {
    icon: ClipboardCheck,
    title: "Register to Vote",
    description: "Check your registration status or register for the first time.",
    link: "/voter-resources#register",
  },
  {
    icon: MapPin,
    title: "Find Your Polling Place",
    description: "Locate your designated polling place for Election Day.",
    link: "/voter-resources#polling",
  },
  {
    icon: FileText,
    title: "Absentee & Mail Voting",
    description: "Learn about absentee ballot options in your state.",
    link: "/voter-resources#absentee",
  },
  {
    icon: HelpCircle,
    title: "Voter FAQ",
    description: "Get answers to common questions about voting.",
    link: "/voter-resources#faq",
  },
];

export function VoterResourcesCTA() {
  return (
    <section className="py-20 bg-card border-t border-border">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl font-bold text-foreground mb-4 sm:text-4xl">
            Ready to Vote?
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
            Access everything you need to participate in upcoming elections.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {resources.map((resource) => (
            <Link
              key={resource.title}
              to={resource.link}
              className="group rounded-xl border border-border bg-background p-6 hover:border-primary hover:shadow-md transition-all"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <resource.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
                {resource.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {resource.description}
              </p>
              <span className="inline-flex items-center text-sm font-medium text-primary">
                Learn more
                <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Button variant="default" size="lg" asChild>
            <Link to="/voter-resources">
              Explore All Resources
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
