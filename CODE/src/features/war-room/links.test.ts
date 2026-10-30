import { describe, expect, it } from "vitest";
import { targetSearch } from "./links";

describe("targetSearch", () => {
  it("targets a Senate race on the states layer", () => {
    expect(targetSearch("", "NC", "NC-SEN")).toBe("?state=NC&mode=odds");
  });

  it("targets a House seat on the districts layer, as the monitor's House odds map", () => {
    expect(targetSearch("", "PA", "PA-07")).toBe("?state=PA&mode=odds&district=07&layer=districts&ooffice=house");
  });

  it("clears the previous state's selection and camera but keeps other parameters", () => {
    const from = "?state=PA&district=07&districts=07,08&counties=42101&lat=40&lon=-75&zoom=7&layer=districts&ooffice=house&lens=flip";
    expect(targetSearch(from, "GA", "GA-SEN")).toBe("?state=GA&lens=flip&mode=odds");
  });

  it("targets a state with no Senate race", () => {
    expect(targetSearch("?mode=odds", "PA", null)).toBe("?mode=odds&state=PA");
  });
});
