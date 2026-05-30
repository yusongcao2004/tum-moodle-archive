// Service worker: two-phase SCAN -> DOWNLOAD, with progress, cancel and reset.
// SCAN lists courses (Moodle AJAX) then resolves each course in the page context,
// reporting per-course progress. DOWNLOAD uses chrome.downloads (native, reuses the
// login). No AppleScript / cua-driver, no passwords, no cookies, nothing uploaded.

import { listCoursesInPage, resolveCourseInPage } from "./scraper.js";
import { classifyFile, CATEGORIES } from "./classify.js";
import { safeName, filenameFromUrl, semesterFolder, groupCourse, isNonCourse } from "./util.js";

const MOODLE_GLOB = "https://www.moodle.tum.de/*";
const ROOT = "TUM_Archive";
const DL_CONCURRENCY = 5;

let running = false;
let cancelRequested = false;
const activeDownloads = new Set();

function emit(msg) { chrome.runtime.sendMessage(msg).catch(() => {}); }

async function setState(patch) {
  const cur = (await chrome.storage.local.get("state")).state || {};
  const state = { ...cur, ...patch, ts: Date.now() };
  await chrome.storage.local.set({ state });
  emit({ type: "STATE", state });
  return state;
}

async function findOrCreateMoodleTab() {
  const tabs = await chrome.tabs.query({ url: MOODLE_GLOB });
  if (tabs.length) return tabs[0];
  const tab = await chrome.tabs.create({ url: "https://www.moodle.tum.de/my/", active: false });
  await new Promise((resolve) => {
    const listener = (tabId, info) => { if (tabId === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 25000);
  });
  return await chrome.tabs.get(tab.id);
}

function jsonDataUrl(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj, null, 2));
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return "data:application/json;base64," + btoa(bin);
}
async function saveJson(obj, relPath) {
  try { await new Promise((r) => chrome.downloads.download({ url: jsonDataUrl(obj), filename: `${ROOT}/${relPath}`, conflictAction: "overwrite" }, () => r())); } catch {}
}

async function runPool(items, n, fn) {
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, worker));
}

function buildPath(f) {
  const parts = [ROOT, semesterFolder(f.semester), safeName(f.parent, 150)];
  if (f.component) parts.push(safeName(f.component, 60));
  parts.push(f.category, safeName(f.name, 160));
  return parts.join("/");
}

function downloadOne(url, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download({ url, filename, conflictAction: "uniquify" }, (id) => {
      if (chrome.runtime.lastError || id === undefined) { resolve({ ok: false, error: chrome.runtime.lastError?.message || "download() failed" }); return; }
      activeDownloads.add(id);
      const onChanged = async (delta) => {
        if (delta.id !== id) return;
        if (delta.state && delta.state.current === "complete") {
          chrome.downloads.onChanged.removeListener(onChanged); activeDownloads.delete(id);
          let item; try { [item] = await chrome.downloads.search({ id }); } catch {}
          const size = (item && (item.fileSize || item.totalBytes)) || 0;
          const mime = ((item && item.mime) || "").toLowerCase();
          const finalUrl = (item && item.finalUrl) || url;
          if (!size) { try { await chrome.downloads.removeFile(id); } catch {} resolve({ ok: false, error: "zero-byte file" }); return; }
          if (mime.includes("text/html") || /\/login\//.test(finalUrl)) { try { await chrome.downloads.removeFile(id); } catch {} resolve({ ok: false, error: "looks like a login/HTML page" }); return; }
          resolve({ ok: true, id, size });
        } else if (delta.state && delta.state.current === "interrupted") {
          chrome.downloads.onChanged.removeListener(onChanged); activeDownloads.delete(id);
          const err = (delta.error && delta.error.current) || "interrupted";
          resolve({ ok: false, error: err, cancelled: /USER_CANCELED/i.test(err) });
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
    });
  });
}

// ---- SCAN (with per-course progress) ----
async function scan(opts = {}) {
  if (running) return;
  running = true; cancelRequested = false;
  try {
    await setState({ phase: "scanning", scanPhase: "courses", scanDone: 0, scanTotal: 0, error: "" });
    const tab = await findOrCreateMoodleTab();
    const [{ result: listed } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: listCoursesInPage });
    if (!listed) throw new Error("scan returned nothing — open a moodle.tum.de tab and log in");
    if (!listed.loggedIn) { await setState({ phase: "login_required" }); emit({ type: "LOGIN_REQUIRED" }); return; }

    let courses = (listed.courses || []).filter((c) => !isNonCourse(c)); // drop student assemblies
    if (opts.limitCourses) courses = courses.slice(0, opts.limitCourses);
    await setState({ phase: "scanning", scanPhase: "files", scanDone: 0, scanTotal: courses.length });

    const resolved = new Array(courses.length);
    let done = 0;
    await runPool(courses, 3, async (c, idx) => {
      if (cancelRequested) return;
      let r;
      try { const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: resolveCourseInPage, args: [c] }); r = result; }
      catch (e) { r = { error: String(e) }; }
      if (r && r.login) r = { error: "login required" };
      resolved[idx] = { ...c, files: (r && r.files) || [], semester: (r && r.semester) || "", pageTitle: (r && r.pageTitle) || "", headerSample: (r && r.headerSample) || "", error: r && r.error };
      done++;
      await setState({ scanDone: done, scanTotal: courses.length });
    });
    if (cancelRequested) { await setState({ phase: "scanned" }); return; }

    const index = (await chrome.storage.local.get("index")).index || {};
    const files = []; const courseMap = new Map(); const semSet = new Set();
    for (const c of resolved) {
      if (!c) continue;
      const { parent, component } = groupCourse(c.name);
      const semester = c.semester || "";
      semSet.add(semester || "Unknown_Semester");
      const courseKey = `${semester}|||${parent}`;
      for (const f of (c.files || [])) {
        const name = filenameFromUrl(f.url, f.activity);
        const { category, examRelated } = classifyFile(name, `${f.section || ""} ${f.activity || ""}`);
        files.push({ url: f.url, name, semester, parent, component, courseKey, courseName: c.name, category, examRelated, isNew: !index[f.url] });
      }
      const cur = courseMap.get(courseKey) || { courseKey, semester: semester || "Unknown_Semester", parent, name: parent, fileCount: 0, newCount: 0, components: new Set() };
      cur.fileCount += (c.files || []).length;
      if (component) cur.components.add(component);
      courseMap.set(courseKey, cur);
    }
    for (const f of files) if (f.isNew) courseMap.get(f.courseKey).newCount++;
    const invCourses = [...courseMap.values()].map((c) => ({ ...c, components: [...c.components] }));

    const inventory = {
      scannedAt: new Date().toISOString(),
      counts: { courses: invCourses.length, files: files.length, new: files.filter((f) => f.isNew).length },
      semesters: [...semSet].sort().reverse(),
      categories: CATEGORIES, courses: invCourses, files,
      scanLog: listed.log || [],
      courseDebug: resolved.filter(Boolean).map((c) => ({ name: c.name, semester: c.semester, pageTitle: c.pageTitle, headerSample: c.headerSample, fileCount: (c.files || []).length, error: c.error })),
    };
    await chrome.storage.local.set({ inventory });
    const filesLite = files.map((f) => ({ courseKey: f.courseKey, category: f.category, examRelated: f.examRelated, isNew: f.isNew }));
    await setState({ phase: "scanned", scanned: invCourses.length, totalFiles: files.length, newFiles: inventory.counts.new });
    emit({ type: "SCANNED", counts: inventory.counts, semesters: inventory.semesters, categories: CATEGORIES, courses: invCourses, files: filesLite });
    await saveJson({ ...inventory, files: inventory.files.slice(0, 6000) }, "_scan_log.json");
  } catch (e) {
    await setState({ phase: "error", error: String(e) });
    emit({ type: "ERROR", error: String(e) });
  } finally { running = false; }
}

// ---- DOWNLOAD (filtered, cancellable) ----
async function download(selection = {}) {
  if (running) return;
  running = true; cancelRequested = false;
  try {
    const inventory = (await chrome.storage.local.get("inventory")).inventory;
    if (!inventory) throw new Error("no scan inventory — run Scan first");
    const semSel = selection.semesters?.length ? new Set(selection.semesters) : null;
    const courseSel = selection.courses?.length ? new Set(selection.courses) : null;
    const catSel = selection.categories?.length ? new Set(selection.categories) : null;
    const examOnly = !!selection.examOnly;
    const index = (await chrome.storage.local.get("index")).index || {};

    const matched = inventory.files.filter((f) => {
      if (semSel && !semSel.has(f.semester || "Unknown_Semester")) return false;
      if (courseSel && !courseSel.has(f.courseKey)) return false;
      if (examOnly) return f.examRelated;
      if (catSel && !catSel.has(f.category)) return false;
      return true;
    });
    const fresh = selection.redownload ? matched : matched.filter((f) => !index[f.url]);
    const skipped = matched.length - fresh.length;
    await setState({ phase: "downloading", totalFiles: matched.length, skipped, downloaded: 0, failed: 0, error: "" });

    let downloaded = 0, failed = 0;
    const failures = []; const retry = [];
    async function attempt(f) {
      if (cancelRequested) return null;
      const res = await downloadOne(f.url, buildPath(f));
      if (res.ok) { downloaded++; index[f.url] = { filename: buildPath(f), size: res.size, ts: Date.now() }; if (downloaded % 5 === 0) await chrome.storage.local.set({ index }); return null; }
      if (res.cancelled) return null;
      return res;
    }
    await runPool(fresh, DL_CONCURRENCY, async (f) => { if (cancelRequested) return; const fail = await attempt(f); if (fail) retry.push([f, fail]); await setState({ downloaded, failed }); });
    for (const [f] of retry) { if (cancelRequested) break; const fail = await attempt(f); if (fail) { failed++; failures.push({ name: f.name, course: f.parent, semester: f.semester, url: f.url, error: fail.error }); } await setState({ downloaded, failed }); }
    await chrome.storage.local.set({ index });

    if (cancelRequested) { await setState({ phase: "scanned", downloaded, failed, skipped }); emit({ type: "CANCELLED", downloaded }); return; }
    await setState({ phase: "done", downloaded, failed, skipped, failures: failures.slice(0, 100) });
    if (failures.length) await saveJson({ generatedAt: new Date().toISOString(), failed: failures.length, failures }, "_download_failures.json");
    emit({ type: "DOWNLOAD_DONE", downloaded, failed, skipped, total: matched.length });
  } catch (e) {
    await setState({ phase: "error", error: String(e) });
    emit({ type: "ERROR", error: String(e) });
  } finally { running = false; }
}

function cancelAll() {
  cancelRequested = true;
  for (const id of [...activeDownloads]) { try { chrome.downloads.cancel(id); } catch {} }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg && msg.type) {
    case "SCAN": scan(msg.opts || {}); sendResponse({ started: true }); break;
    case "DOWNLOAD": download(msg.selection || {}); sendResponse({ started: true }); break;
    case "CANCEL": cancelAll(); sendResponse({ ok: true }); break;
    case "RESET":
      cancelAll();
      chrome.storage.local.remove(["inventory", "state"]).then(() => sendResponse({ ok: true }));
      return true;
    case "GET_STATE": chrome.storage.local.get("state").then(({ state }) => sendResponse({ state: state || null })); return true;
    case "GET_INVENTORY":
      chrome.storage.local.get("inventory").then(({ inventory }) => sendResponse({ inventory: inventory ? { counts: inventory.counts, semesters: inventory.semesters, categories: inventory.categories, courses: inventory.courses, scannedAt: inventory.scannedAt, files: (inventory.files || []).map((f) => ({ courseKey: f.courseKey, category: f.category, examRelated: f.examRelated, isNew: f.isNew })) } : null }));
      return true;
    case "RESET_INDEX": chrome.storage.local.set({ index: {} }).then(() => sendResponse({ ok: true })); return true;
    default: sendResponse({ ok: false, error: "unknown message" });
  }
});
