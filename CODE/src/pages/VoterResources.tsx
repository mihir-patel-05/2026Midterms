import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ClipboardCheck,
  MapPin,
  FileText,
  Calendar,
  ExternalLink,
  HelpCircle,
  Shield,
  Globe,
} from "lucide-react";

const faqs = [
  {
    question: "Am I eligible to vote in federal elections?",
    answer:
      "You must be a U.S. citizen, meet your state's residency requirements, and be 18 years old on or before Election Day. Some states allow 17-year-olds to vote in primaries if they'll be 18 by the general election.",
  },
  {
    question: "How do I check my voter registration status?",
    answer:
      "Visit your state's Secretary of State website or use Vote.gov to check your registration status. You'll typically need your name, date of birth, and address to verify.",
  },
  {
    question: "What do I need to bring to vote?",
    answer:
      "Requirements vary by state. Some states require photo ID, others accept non-photo ID, and some don't require ID at all. Check your state's specific requirements before Election Day.",
  },
  {
    question: "Can I vote if I'm away from home on Election Day?",
    answer:
      "Yes! You can request an absentee ballot or vote early in person if your state allows it. Some states offer no-excuse absentee voting, while others require a valid reason.",
  },
  {
    question: "What if I make a mistake on my ballot?",
    answer:
      "If you make a mistake before submitting your ballot, ask a poll worker for a new one. If voting by mail, check your state's rules for correcting errors.",
  },
  {
    question: "How do I find my polling place?",
    answer:
      "Your polling place is typically listed on your voter registration card. You can also look it up on your state's election website or through Vote.gov.",
  },
];

export default function VoterResources() {
  return (
    <Layout>
      {/* Hero */}
      <section className="gradient-hero py-16">
        <div className="container text-center">
          <h1 className="font-heading text-3xl font-bold text-primary-foreground sm:text-4xl mb-4">
            Voter Resources
          </h1>
          <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto">
            Everything you need to participate in upcoming elections. Register to vote,
            find your polling place, and learn about absentee voting options.
          </p>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16 bg-background" id="register">
        <div className="container">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-8 text-center">
            Get Started
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <ResourceCard
              icon={ClipboardCheck}
              title="Register to Vote"
              description="Check your registration status or register for the first time."
              link="https://vote.gov/register"
              linkText="Register Now"
            />
            <ResourceCard
              icon={MapPin}
              title="Find Your Polling Place"
              description="Locate your designated polling place for Election Day."
              link="https://www.vote.org/polling-place-locator/"
              linkText="Find Location"
              id="polling"
            />
            <ResourceCard
              icon={FileText}
              title="Request Absentee Ballot"
              description="Vote by mail if you can't make it to the polls."
              link="https://www.vote.org/absentee-ballot/"
              linkText="Request Ballot"
              id="absentee"
            />
            <ResourceCard
              icon={Calendar}
              title="Election Calendar"
              description="View upcoming election dates and registration deadlines."
              link="/elections"
              linkText="View Calendar"
              internal
            />
          </div>
        </div>
      </section>

      {/* State Requirements */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-4 text-center">
            Voting Requirements by State
          </h2>
          <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
            Each state has different rules for voter ID, registration deadlines, and voting methods.
            Select your state to see specific requirements.
          </p>
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Globe className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-heading font-semibold text-foreground mb-2">
              Select Your State
            </h3>
            <p className="text-muted-foreground mb-4">
              Visit our Elections page to choose your state and view specific voting requirements.
            </p>
            <Button asChild>
              <a href="/">
                Choose Your State
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ID Requirements */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="h-8 w-8 text-primary" />
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Voter ID Requirements
              </h2>
            </div>
            <p className="text-muted-foreground mb-8">
              Voter ID laws vary significantly by state. Here's a general overview of the types of
              requirements you might encounter.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-heading font-semibold text-foreground mb-2">Strict Photo ID</h3>
                <p className="text-sm text-muted-foreground">
                  Voters must present a government-issued photo ID. If you don't have one,
                  you may cast a provisional ballot.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-heading font-semibold text-foreground mb-2">Non-Strict Photo ID</h3>
                <p className="text-sm text-muted-foreground">
                  Photo ID is requested but alternatives like signing an affidavit may be available.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-heading font-semibold text-foreground mb-2">Non-Photo ID</h3>
                <p className="text-sm text-muted-foreground">
                  Some states accept non-photo identification like utility bills or bank statements.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-heading font-semibold text-foreground mb-2">No ID Required</h3>
                <p className="text-sm text-muted-foreground">
                  Some states don't require any ID to vote, though you may need to sign the poll book.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-muted/30" id="faq">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <HelpCircle className="h-8 w-8 text-primary" />
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Frequently Asked Questions
              </h2>
            </div>
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="rounded-lg border border-border bg-card px-6"
                >
                  <AccordionTrigger className="text-left font-heading font-semibold text-foreground hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function ResourceCard({
  icon: Icon,
  title,
  description,
  link,
  linkText,
  internal = false,
  id,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  link: string;
  linkText: string;
  internal?: boolean;
  id?: string;
}) {
  const content = (
    <div
      id={id}
      className="rounded-xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition-all h-full flex flex-col"
    >
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-heading font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 flex-1">{description}</p>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        {linkText}
        {!internal && <ExternalLink className="h-3 w-3" />}
      </span>
    </div>
  );

  if (internal) {
    return <a href={link}>{content}</a>;
  }

  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  );
}
