import { useState, useEffect } from "react";
import { Calendar, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDeadlines, Deadline } from "@/lib/api";

// Fallback static data in case API fails
const fallbackDeadlines = [
  {
    id: "fallback-1",
    date: "2026-01-15T00:00:00.000Z",
    title: "Primary Registration Deadline",
    states: ["IA", "NH"],
    type: "registration" as const,
    urgent: false,
    description: null,
  },
  {
    id: "fallback-2",
    date: "2026-02-03T00:00:00.000Z",
    title: "Iowa Caucuses",
    states: ["IA"],
    type: "election" as const,
    urgent: false,
    description: null,
  },
  {
    id: "fallback-3",
    date: "2026-03-03T00:00:00.000Z",
    title: "Super Tuesday Primaries",
    states: ["CA", "TX", "14 other states"],
    type: "election" as const,
    urgent: false,
    description: null,
  },
  {
    id: "fallback-4",
    date: "2026-10-05T00:00:00.000Z",
    title: "General Election Registration Deadline",
    states: ["Most states"],
    type: "registration" as const,
    urgent: true,
    description: null,
  },
  {
    id: "fallback-5",
    date: "2026-11-03T00:00:00.000Z",
    title: "Election Day",
    states: ["ALL"],
    type: "election" as const,
    urgent: true,
    description: null,
  },
];

// State code to full name mapping
const stateNames: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  ALL: "All 50 States",
};

function formatStates(states: string[]): string {
  if (states.length === 0) return "";
  if (states.includes("ALL")) return "All 50 States";
  if (states.length > 3) {
    const firstThree = states.slice(0, 3).map(s => stateNames[s] || s);
    return `${firstThree.join(", ")} +${states.length - 3} more`;
  }
  return states.map(s => stateNames[s] || s).join(", ");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function UpcomingDeadlines() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeadlines() {
      try {
        const response = await getDeadlines();
        if (response.deadlines.length > 0) {
          setDeadlines(response.deadlines);
        } else {
          // Use fallback if no deadlines from API
          setDeadlines(fallbackDeadlines);
        }
        setError(null);
      } catch (err) {
        console.error("Failed to fetch deadlines:", err);
        setError("Failed to load deadlines");
        // Use fallback data on error
        setDeadlines(fallbackDeadlines);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDeadlines();
  }, []);

  return (
    <section className="py-20 bg-muted/50">
      <div className="container">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-heading text-3xl font-bold text-foreground mb-2">
              Upcoming Deadlines
            </h2>
            <p className="text-muted-foreground">
              Don't miss important registration dates and election days.
            </p>
          </div>
          <Calendar className="h-8 w-8 text-primary hidden sm:block" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <p className="text-sm text-muted-foreground mb-4">
                Showing cached deadline information.
              </p>
            )}
            {deadlines.map((deadline) => (
              <div
                key={deadline.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border bg-card p-5 transition-all hover:shadow-md ${
                  deadline.urgent ? "border-secondary" : "border-border"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                    deadline.type === "election" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                  }`}>
                    {deadline.type === "election" ? (
                      <Calendar className="h-6 w-6" />
                    ) : (
                      <Clock className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-heading font-semibold text-foreground">
                        {deadline.title}
                      </h3>
                      {deadline.urgent && (
                        <Badge variant="secondary" className="bg-secondary/10 text-secondary border-secondary/20">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Key Date
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatStates(deadline.states)}
                    </p>
                    {deadline.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {deadline.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right sm:text-left">
                  <p className="font-heading font-semibold text-foreground">
                    {formatDate(deadline.date)}
                  </p>
                  <Badge variant="outline" className="mt-1">
                    {deadline.type === "election" ? "Election Day" : deadline.type === "registration" ? "Deadline" : "Event"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
