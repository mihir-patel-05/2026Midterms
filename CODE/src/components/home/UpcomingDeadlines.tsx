import { Calendar, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const upcomingDeadlines = [
  {
    date: "January 15, 2026",
    event: "Primary Registration Deadline",
    states: ["Iowa", "New Hampshire"],
    type: "registration",
    urgent: false,
  },
  {
    date: "February 3, 2026",
    event: "Iowa Caucuses",
    states: ["Iowa"],
    type: "election",
    urgent: false,
  },
  {
    date: "March 3, 2026",
    event: "Super Tuesday Primaries",
    states: ["California", "Texas", "14 other states"],
    type: "election",
    urgent: false,
  },
  {
    date: "October 5, 2026",
    event: "General Election Registration Deadline",
    states: ["Most states"],
    type: "registration",
    urgent: true,
  },
  {
    date: "November 3, 2026",
    event: "Election Day",
    states: ["All 50 States"],
    type: "election",
    urgent: true,
  },
];

export function UpcomingDeadlines() {
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

        <div className="space-y-4">
          {upcomingDeadlines.map((deadline, index) => (
            <div
              key={index}
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
                      {deadline.event}
                    </h3>
                    {deadline.urgent && (
                      <Badge variant="secondary" className="bg-secondary/10 text-secondary border-secondary/20">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Key Date
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {deadline.states.join(", ")}
                  </p>
                </div>
              </div>
              <div className="text-right sm:text-left">
                <p className="font-heading font-semibold text-foreground">{deadline.date}</p>
                <Badge variant="outline" className="mt-1">
                  {deadline.type === "election" ? "Election Day" : "Deadline"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
