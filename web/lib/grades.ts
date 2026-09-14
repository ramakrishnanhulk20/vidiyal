export type Letter = "A" | "B" | "C" | "D" | "E";

/**
 * The grade family. It is colder than the one accent on purpose: a letter is a status,
 * not decoration, and two warm colours next to each other read as a mistake.
 */
export const GRADE_COLOR: Record<Letter, string> = {
  A: "#7ED0A5",
  B: "#9CC4B8",
  C: "#C9B98A",
  D: "#D9967A",
  E: "#E06C75",
};

export const GRADE_MEANING: Record<Letter, string> = {
  A: "85 and above",
  B: "70 to 84",
  C: "55 to 69",
  D: "40 to 54",
  E: "under 40",
};

export const LETTERS: Letter[] = ["A", "B", "C", "D", "E"];
