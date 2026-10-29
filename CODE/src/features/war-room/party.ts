/** War Room party colours, as CSS variables: D blue, R red, anyone else purple, no party grey. */
export const partyColor = (party: string | null | undefined) =>
  party === "D" ? "var(--wr-dem)" : party === "R" ? "var(--wr-rep)" : party ? "var(--wr-ind)" : "var(--wr-text-3)";

/** "D", "R", or "I" for an independent or other outcome (Kalshi's party is null for them). */
export const partyLetter = (party: string | null | undefined) => (party === "D" || party === "R" ? party : "I");

/** "a D-held seat", "an R-held seat", "an I-held seat". */
export const heldBy = (party: string | null | undefined) => {
  const letter = partyLetter(party);
  return `${letter === "D" ? "a" : "an"} ${letter}-held`;
};
