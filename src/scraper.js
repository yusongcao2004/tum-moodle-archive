// Injected into a moodle.tum.de tab via chrome.scripting.executeScript({ func }).
// Two self-contained functions so the service worker can show real progress:
//   listCoursesInPage()         -> login check + sesskey + all enrolled courses (fast)
//   resolveCourseInPage(course) -> resolve one course's files (called per course)
// Both run in page context: real DOM (DOMParser) + same-origin credentialed fetch.

export async function listCoursesInPage() {
  const BASE = "https://www.moodle.tum.de";
  const log = [];

  // Login check + sesskey from any Moodle page's inline M.cfg.
  const home = await fetch(BASE + "/my/", { credentials: "include", redirect: "follow" });
  if (/\/login\//.test(home.url || "")) return { loggedIn: false, courses: [], log };
  const html = await home.text();
  const mk = /"sesskey":"([^"]+)"/.exec(html) || /sesskey=([A-Za-z0-9]+)/.exec(html);
  const sesskey = mk ? mk[1] : "";
  log.push("sesskey " + (sesskey ? "found" : "MISSING"));

  let courses = [];
  if (sesskey) {
    const url = `${BASE}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=core_course_get_enrolled_courses_by_timeline_classification`;
    let offset = 0;
    try {
      for (let p = 0; p < 60; p++) {
        const body = JSON.stringify([{ index: 0, methodname: "core_course_get_enrolled_courses_by_timeline_classification", args: { offset, limit: 50, classification: "all", sort: "fullname", customfieldname: "", customfieldvalue: "" } }]);
        const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body });
        const json = await res.json();
        const d = json && json[0];
        if (!d || d.error) { log.push("ajax error"); break; }
        const list = (d.data && d.data.courses) || [];
        for (const c of list) courses.push({ id: String(c.id), name: (c.fullname || c.shortname || ("course_" + c.id)).replace(/\s+/g, " ").trim(), url: c.viewurl || `${BASE}/course/view.php?id=${c.id}`, category: c.coursecategory || "", startdate: c.startdate || 0 });
        if (list.length < 50) break;
        offset += list.length;
      }
    } catch (e) { log.push("ajax failed: " + e); }
  }
  log.push("ajax courses: " + courses.length);

  // Fallback: DOM scrape if the API yielded nothing.
  if (!courses.length) {
    const res = await fetch(BASE + "/my/courses.php", { credentials: "include", redirect: "follow" });
    if (/\/login\//.test(res.url || "")) return { loggedIn: false, courses: [], log };
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const seen = new Set();
    doc.querySelectorAll('a[href*="course/view.php?id="]').forEach((a) => {
      const m = /course\/view\.php\?id=(\d+)/.exec(a.href || "");
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      courses.push({ id: m[1], name: (a.textContent || "").trim().replace(/\s+/g, " ") || ("course_" + m[1]), url: `${BASE}/course/view.php?id=${m[1]}`, category: "", startdate: 0 });
    });
    log.push("dom fallback courses: " + courses.length);
  }
  return { loggedIn: true, courses, log };
}

export async function resolveCourseInPage(course) {
  const BASE = "https://www.moodle.tum.de";
  const abs = (raw) => { try { return new URL(raw, BASE).href; } catch { return null; } };

  function semFromStart(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000), y = d.getFullYear(), m = d.getMonth();
    if (m >= 3 && m <= 8) return `SoSe ${y}`;
    if (m >= 9) return `WiSe ${y}/${y + 1}`;
    return `WiSe ${y - 1}/${y}`;
  }
  function semFromText(text) {
    const m = /(SoSe|WiSe|SS|WS)\s*\.?\s*(\d{4})(?:\s*[\/\-]\s*(\d{2,4}))?/i.exec(text || "");
    if (!m) return "";
    const term = m[1].toLowerCase()[0] === "s" ? "SoSe" : "WiSe";
    const y1 = m[2];
    if (term === "WiSe") { let y2 = m[3]; if (y2 && y2.length === 2) y2 = y1.slice(0, 2) + y2; return `WiSe ${y1}/${y2 || (parseInt(y1, 10) + 1)}`; }
    return `SoSe ${y1}`;
  }
  function pluginfilesFrom(doc) {
    const out = [];
    doc.querySelectorAll('a[href*="pluginfile.php/"]').forEach((a) => { const u = abs(a.getAttribute("href")); if (u) out.push(u); });
    return [...new Set(out)];
  }
  async function resolveResource(href) {
    const res = await fetch(href, { credentials: "include", redirect: "follow" });
    const finalUrl = res.url || href, ct = res.headers.get("content-type") || "";
    if (/pluginfile\.php\//.test(finalUrl) || !/text\/html/i.test(ct)) { try { res.body && res.body.cancel(); } catch {} return /\/login\//.test(finalUrl) ? [] : [finalUrl]; }
    return pluginfilesFrom(new DOMParser().parseFromString(await res.text(), "text/html"));
  }
  async function resolveFolder(href) {
    const res = await fetch(href, { credentials: "include", redirect: "follow" });
    if (/\/login\//.test(res.url || href)) return [];
    return pluginfilesFrom(new DOMParser().parseFromString(await res.text(), "text/html"));
  }
  async function mapPool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    async function w() { while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx]); } catch { out[idx] = []; } } }
    await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, w));
    return out;
  }

  const courseId = (/[?&]id=(\d+)/.exec(course.url) || [])[1] || "";
  async function getDoc(url) {
    const r = await fetch(url, { credentials: "include", redirect: "follow" });
    if (/\/login\//.test(r.url || "")) return { login: true };
    return { doc: new DOMParser().parseFromString(await r.text(), "text/html") };
  }

  const main = await getDoc(course.url);
  if (main.login) return { login: true };
  const doc = main.doc;

  // Tabbed / onetopic course formats put each tab on its own section page; the landing
  // page only shows the active tab. Collect every section page of THIS course.
  const pageUrls = new Set([course.url]);
  doc.querySelectorAll('a[href*="course/view.php"]').forEach((a) => {
    const href = abs(a.getAttribute("href"));
    if (!href) return;
    const m = /course\/view\.php\?id=(\d+).*?[?&](?:section|sectionid)=\d+/.exec(href);
    if (m && m[1] === courseId) pageUrls.add(href);
  });

  const activities = []; const seenHref = new Set();
  function collectFrom(d) {
    d.querySelectorAll('li.activity a[href], .activityinstance a[href], a[href*="pluginfile.php/"]').forEach((a) => {
      const href = abs(a.getAttribute("href"));
      if (!href || seenHref.has(href)) return;
      seenHref.add(href);
      let kind = null;
      if (/\/mod\/resource\/view\.php/.test(href)) kind = "resource";
      else if (/\/mod\/folder\/view\.php/.test(href)) kind = "folder";
      else if (/pluginfile\.php\//.test(href)) kind = "pluginfile";
      else return;
      const activity = (a.textContent || "").trim().replace(/\s+/g, " ").replace(/\s*(Datei|File|Verzeichnis|Folder|URL|Link\/URL)$/i, "");
      const sectionEl = a.closest("li.section, .section, [role='region']");
      const secHead = sectionEl && sectionEl.querySelector("h3, h4, .sectionname");
      const section = secHead ? (secHead.textContent || "").trim().replace(/\s+/g, " ") : "";
      activities.push({ href, kind, activity, section });
    });
  }
  collectFrom(doc);
  const others = [...pageUrls].filter((u) => u !== course.url);
  const otherDocs = await mapPool(others, 5, async (u) => { const r = await getDoc(u); return r.doc || null; });
  for (const d of otherDocs) if (d) collectFrom(d);

  const resolved = await mapPool(activities, 6, async (act) => act.kind === "pluginfile" ? [act.href] : act.kind === "resource" ? resolveResource(act.href) : resolveFolder(act.href));
  const files = []; const seenUrl = new Set();
  activities.forEach((act, idx) => { for (const u of (Array.isArray(resolved[idx]) ? resolved[idx] : [])) { if (!u || seenUrl.has(u)) continue; seenUrl.add(u); files.push({ url: u, activity: act.activity, section: act.section }); } });

  const hp = [];
  doc.querySelectorAll(".page-header-headings, #page-header, .breadcrumb, header h1, h1").forEach((el) => hp.push(el.textContent || ""));
  hp.push(doc.title || "");
  const headerSample = hp.join(" ").replace(/\s+/g, " ").slice(0, 200);
  const semester = semFromStart(course.startdate) || semFromText(headerSample) || semFromText(course.name) || semFromText(course.category);
  return { files, semester, pageTitle: doc.title || "", headerSample, sectionPages: pageUrls.size };
}
