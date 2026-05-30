// Classification for the MVP. Categories are deliberately limited to the seven the
// spec asks for. Classification uses the filename + Moodle section/activity context
// (PDF text is not available before download). Unknown -> "Others".

import { fileExt } from "./util.js";

export const CATEGORIES = [
  "Lectures",
  "Exercises",
  "Solutions",
  "Exams",
  "Formula_Sheets",
  "Scripts",
  "Others",
];

// Exam-related keywords (MVP TUM feature: one-click "exam materials" filter).
// examRelated is true for these; a plain exercise "Lösung" is NOT exam-related.
const EXAM_KW = /(altklausur|probeklausur|\bklausur|pr[üu]fung|\bexam\b|endterm|midterm|musterklausur)/i;
const FORMULA_KW = /(formelsammlung|formel|formula|cheat\s*sheet|cheatsheet|\bfs\b)/i;
const SOLUTION_KW = /(l[öo]sung|loesung|solution|musterl[öo]sung|musterloesung|\blsg\b|\banswer\b)/i;
const EXERCISE_KW = /([üu]bung|uebung|aufgabe|exercise|\bsheet\b|blatt|tutorial|problem|hausaufgabe)/i;
const SCRIPT_KW = /(skript|script|lecture[\s_-]*notes|vorlesungsskript)/i;
const LECTURE_KW = /(vorlesung|lecture|slides|folien|kapitel|chapter|pr[äa]sentation|presentation|\bvl[\s_-]?\d|\bvl\b)/i;

// Returns { category, examRelated }.
export function classifyFile(name, context = "") {
  const blob = `${name || ""} ${context || ""}`;
  const ext = fileExt(name);

  const examRelated = EXAM_KW.test(blob) || (SOLUTION_KW.test(blob) && EXAM_KW.test(blob));

  // Precedence: exam > formula > solution > exercise > script > lecture > others.
  if (EXAM_KW.test(blob)) return { category: "Exams", examRelated: true };
  if (FORMULA_KW.test(blob)) return { category: "Formula_Sheets", examRelated };
  if (SOLUTION_KW.test(blob)) return { category: "Solutions", examRelated };
  if (EXERCISE_KW.test(blob)) return { category: "Exercises", examRelated };
  if (SCRIPT_KW.test(blob)) return { category: "Scripts", examRelated };
  if (LECTURE_KW.test(blob)) return { category: "Lectures", examRelated };

  // Slides/notes by extension as a weak lecture hint; everything else -> Others.
  if (ext === "pptx" || ext === "ppt") return { category: "Lectures", examRelated };
  return { category: "Others", examRelated };
}
