import type { StateMapItemViewModel } from "./types";

// Temporary tile positions only; no production geography or result coverage is implied.
export const stateMapItems: StateMapItemViewModel[] = [
  ["AK", "Alaska", 8, 1], ["ME", "Maine", 1, 12], ["VT", "Vermont", 2, 10], ["NH", "New Hampshire", 2, 11],
  ["WA", "Washington", 3, 1], ["ID", "Idaho", 3, 2], ["MT", "Montana", 3, 3], ["ND", "North Dakota", 3, 4],
  ["MN", "Minnesota", 3, 5], ["WI", "Wisconsin", 3, 6], ["MI", "Michigan", 3, 7], ["NY", "New York", 3, 9],
  ["MA", "Massachusetts", 3, 10], ["OR", "Oregon", 4, 1], ["NV", "Nevada", 4, 2], ["WY", "Wyoming", 4, 3],
  ["SD", "South Dakota", 4, 4], ["IA", "Iowa", 4, 5], ["IL", "Illinois", 4, 6], ["IN", "Indiana", 4, 7],
  ["OH", "Ohio", 4, 8], ["PA", "Pennsylvania", 4, 9], ["NJ", "New Jersey", 4, 10], ["CT", "Connecticut", 4, 11],
  ["RI", "Rhode Island", 4, 12], ["CA", "California", 5, 1], ["UT", "Utah", 5, 2], ["CO", "Colorado", 5, 3],
  ["NE", "Nebraska", 5, 4], ["MO", "Missouri", 5, 5], ["KY", "Kentucky", 5, 6], ["WV", "West Virginia", 5, 7],
  ["VA", "Virginia", 5, 8], ["MD", "Maryland", 5, 9], ["DE", "Delaware", 5, 10], ["AZ", "Arizona", 6, 2],
  ["NM", "New Mexico", 6, 3], ["KS", "Kansas", 6, 4], ["AR", "Arkansas", 6, 5], ["TN", "Tennessee", 6, 6],
  ["NC", "North Carolina", 6, 8], ["SC", "South Carolina", 6, 9], ["OK", "Oklahoma", 7, 4], ["LA", "Louisiana", 7, 5],
  ["MS", "Mississippi", 7, 6], ["AL", "Alabama", 7, 7], ["GA", "Georgia", 7, 8], ["HI", "Hawaii", 8, 2],
  ["TX", "Texas", 8, 5], ["FL", "Florida", 8, 9],
].map(([code, name, row, column]) => ({
  code: String(code), name: String(name), row: Number(row), column: Number(column), coverage: "NONE",
}));
