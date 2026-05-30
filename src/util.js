// Pure helpers shared by the service worker. No DOM; safe in a module worker.

export function safeName(value, maxLen = 140) {
  let v = (value || "").trim();
  try { v = decodeURIComponent(v); } catch { /* keep as-is */ }
  v = v.replace(/[/\\]/g, "-");
  v = v.replace(/[:*?"<>|#%{}$!`]/g, "");
  v = v.replace(/\s+/g, "_");
  v = v.replace(/_+/g, "_").replace(/^[._\-\s]+|[._\-\s]+$/g, "");
  v = (v || "Untitled").slice(0, maxLen);
  return v.replace(/[._\-\s]+$/g, "") || "Untitled";
}

export function fileExt(name) {
  const m = /\.([^.\/?#]{1,6})(?:[?#].*)?$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

// Derive a filename from a pluginfile URL when the activity name is not usable.
export function filenameFromUrl(url, fallback) {
  try {
    const u = new URL(url);
    const leaf = decodeURIComponent(u.pathname.split("/").pop() || "");
    if (leaf && leaf.includes(".")) return leaf;
  } catch { /* ignore */ }
  return fallback || "download";
}

// "SoSe 2025" -> "SoSe_2025", "WiSe 2024/2025" -> "WiSe_2024-2025"
export function semesterFolder(semester) {
  const s = (semester || "").trim();
  if (!s) return "Unknown_Semester";
  return safeName(s.replace(/\//g, "-"), 40);
}

// Best-effort: split a course title into a main course ("parent") and an optional
// component (Praktikum / Tutorübung / Zentralübung / Prüfung) so related Moodle
// courses fold under one folder. Falls back to standalone (component = null).
export function groupCourse(name) {
  const n = (name || "").trim();
  let m;
  if ((m = /^Zentral[üu]bung\s+zu\s+(.+)$/i.exec(n))) return { parent: m[1].trim(), component: "Zentraluebung" };
  if ((m = /^Tutorium\s+(.+)$/i.exec(n))) return { parent: m[1].trim(), component: "Tutorium" };
  if ((m = /^Pr[üu]fung\s*\([^)]*\)\s*:?\s*(.+)$/i.exec(n))) return { parent: m[1].trim(), component: "Pruefung" };
  if ((m = /^(.+?)\s*\(\s*Tutor[üu]bung\s*\)\s*$/i.exec(n))) return { parent: m[1].trim(), component: "Tutoruebung" };
  if ((m = /^(.+?)\s*\(\s*Praktikum\s*\)\s*$/i.exec(n))) return { parent: m[1].trim(), component: "Praktikum" };
  if ((m = /^Praktikum\s+(.+)$/i.exec(n))) return { parent: m[1].trim(), component: "Praktikum" };
  // Strip a trailing "(VL + UE)" / "EI (VL/UE)" marker; treat as the main course.
  if ((m = /^(.+?)\s*(?:EI\s*)?\(\s*(?:VL|VL\s*\+\s*UE|VL\/UE|Vorlesung)[^)]*\)\s*$/i.exec(n))) return { parent: m[1].trim(), component: null };
  return { parent: n, component: null };
}

// Non-course entries that appear every semester (student assemblies / representation).
// Excluded from scanning by default — they are not courses.
export function isNonCourse(course) {
  const name = (course && course.name || "").toLowerCase();
  const cat = (course && course.category || "").toLowerCase();
  if (/vollversammlung/.test(name)) return true;
  if (/studentische vertretung/.test(cat)) return true;
  return false;
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
