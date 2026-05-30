import { LANGS, MESSAGES, loadLang, saveLang } from "./i18n.js";

const $ = (id) => document.getElementById(id);
let lang = "zh";
const t = () => MESSAGES[lang];
let inventory = null; // { counts, semesters, categories, courses, files }
let filesLite = []; // [{courseKey, category, examRelated, isNew}]

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = t()[el.getAttribute("data-i18n")];
    if (typeof v === "string") el.textContent = v;
  });
}
function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text || "";
  el.className = `status ${kind}`.trim();
}

function renderInventory() {
  if (!inventory) return;
  $("summary").classList.remove("hidden");
  $("filters").classList.remove("hidden");
  $("dlrow").classList.remove("hidden");
  $("advBox").classList.remove("hidden");
  $("scan").textContent = t().rescan;

  const c = inventory.counts;
  $("summary").textContent = `${c.courses} ${t().cCourses} · ${c.files} ${t().cFiles} · ${c.new} ${t().cNew}`;

  // per-category counts (so each chip shows how many files it covers)
  const catCount = {}; let examCount = 0;
  for (const f of filesLite) { catCount[f.category] = (catCount[f.category] || 0) + 1; if (f.examRelated) examCount++; }

  const types = $("types");
  types.innerHTML = "";
  for (const cat of inventory.categories) {
    const n = catCount[cat] || 0;
    const lbl = document.createElement("label");
    lbl.className = "chip" + (n ? "" : " empty");
    lbl.innerHTML = `<input type="checkbox" id="cat_${cat}" ${n ? "checked" : ""} ${n ? "" : "disabled"}/> ${cat} <span class="cc">${n}</span>`;
    types.appendChild(lbl);
  }
  // show exam-related count on the "exam only" toggle
  const examLbl = document.querySelector('.exam [data-i18n="examOnly"]');
  if (examLbl) examLbl.textContent = `${t().examOnly} (${examCount})`;

  // course tree grouped by semester
  const tree = $("tree");
  tree.innerHTML = "";
  const bySem = new Map();
  for (const co of inventory.courses) {
    const s = co.semester || "Unknown_Semester";
    if (!bySem.has(s)) bySem.set(s, []);
    bySem.get(s).push(co);
  }
  for (const sem of inventory.semesters) {
    const list = bySem.get(sem) || [];
    if (!list.length) continue;
    const wrap = document.createElement("div");
    wrap.className = "sem";
    const head = document.createElement("label");
    head.className = "sem-head";
    head.innerHTML = `<input type="checkbox" class="semchk" checked /> <b>${sem}</b>`;
    wrap.appendChild(head);
    for (const co of list) {
      const row = document.createElement("label");
      row.className = "crow";
      const badge = co.newCount ? `<span class="newb">${co.newCount} ${t().newBadge}</span>` : "";
      const comp = co.components && co.components.length ? `<span class="comp">+${co.components.join("/")}</span>` : "";
      row.innerHTML = `<input type="checkbox" class="cchk" data-key="${encodeURIComponent(co.courseKey)}" ${co.fileCount ? "checked" : ""} ${co.fileCount ? "" : "disabled"}/>
        <span class="cn">${co.parent}</span> ${comp}
        <span class="fc">${co.fileCount}</span>${badge}`;
      wrap.appendChild(row);
    }
    // semester checkbox toggles its courses
    head.querySelector(".semchk").addEventListener("change", (e) => {
      wrap.querySelectorAll(".cchk:not([disabled])").forEach((cb) => { cb.checked = e.target.checked; });
      recount();
    });
    tree.appendChild(wrap);
  }
  recount();
}

// Live feedback: how many files the current filter selection will download.
function recount() {
  if (!filesLite.length) { $("selcount").textContent = ""; return; }
  const courseSel = new Set([...document.querySelectorAll(".cchk")].filter((cb) => cb.checked).map((cb) => decodeURIComponent(cb.dataset.key)));
  const catSel = new Set([...document.querySelectorAll('#types input[type="checkbox"]')].filter((cb) => cb.checked).map((cb) => cb.id.replace(/^cat_/, "")));
  const examOnly = $("examOnly").checked;
  let n = 0, nw = 0;
  for (const f of filesLite) {
    if (!courseSel.has(f.courseKey)) continue;
    const hit = examOnly ? f.examRelated : catSel.has(f.category);
    if (hit) { n++; if (f.isNew) nw++; }
  }
  $("selcount").textContent = t().selCount(n, nw);
  $("download").disabled = n === 0;
  // when "exam only" is on, the type chips don't apply — dim them
  document.querySelectorAll("#types .chip").forEach((ch) => ch.classList.toggle("dim", examOnly));
  document.querySelectorAll('#types input[type="checkbox"]').forEach((cb) => { cb.disabled = examOnly || cb.parentElement.classList.contains("empty"); });
}

function gatherSelection() {
  const courses = [...document.querySelectorAll(".cchk")].filter((cb) => cb.checked).map((cb) => decodeURIComponent(cb.dataset.key));
  const categories = [...document.querySelectorAll('#types input[type="checkbox"]')].filter((cb) => cb.checked).map((cb) => cb.id.replace(/^cat_/, ""));
  return { courses, categories, examOnly: $("examOnly").checked, redownload: $("redownload").checked };
}

function render(state) {
  if (!state) return;
  const total = state.totalFiles || 0;
  switch (state.phase) {
    case "scanning": {
      $("scan").disabled = true;
      $("scanprog").classList.remove("hidden");
      $("progress").classList.add("hidden");
      if (state.scanPhase === "files" && state.scanTotal) {
        const d = state.scanDone || 0, n = state.scanTotal;
        $("scanfill").style.width = `${Math.round((d / n) * 100)}%`;
        $("scancounts").textContent = `${d}/${n}`;
        setStatus(t().scanProgress(d, n));
      } else { $("scanfill").style.width = "8%"; $("scancounts").textContent = ""; setStatus(t().scanningCourses); }
      break;
    }
    case "login_required": setStatus(t().loginRequired, "err"); $("scan").disabled = false; $("scanprog").classList.add("hidden"); $("progress").classList.add("hidden"); break;
    case "error": setStatus(t().errorPfx + state.error, "err"); $("scan").disabled = false; $("download").disabled = false; $("scanprog").classList.add("hidden"); $("progress").classList.add("hidden"); break;
    case "scanned": setStatus(""); $("scan").disabled = false; $("download").disabled = false; $("scanprog").classList.add("hidden"); $("progress").classList.add("hidden"); break;
    case "downloading": {
      $("scanprog").classList.add("hidden");
      $("progress").classList.remove("hidden");
      const done = (state.downloaded || 0) + (state.skipped || 0) + (state.failed || 0);
      $("fill").style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
      $("counts").textContent = `${state.downloaded || 0} ${t().lblDownloaded} · ${state.skipped || 0} ${t().lblSkipped} · ${state.failed || 0} ${t().lblFailed} / ${total}`;
      setStatus(t().downloading); $("download").disabled = true;
      break;
    }
    case "done": {
      $("progress").classList.remove("hidden");
      $("fill").style.width = "100%";
      $("counts").textContent = `${t().done}: ${state.downloaded || 0} ${t().lblDownloaded} · ${state.skipped || 0} ${t().lblSkipped} · ${state.failed || 0} ${t().lblFailed}`;
      setStatus(""); $("download").disabled = false; $("scan").disabled = false;
      if (state.failures && state.failures.length) {
        const f = $("failures"); f.classList.remove("hidden");
        f.innerHTML = `<div class="ftitle">${t().failuresTitle} (${state.failures.length})</div>` +
          state.failures.slice(0, 20).map((x) => `<div class="frow">• ${x.name} — ${x.error}</div>`).join("");
      }
      break;
    }
  }
}

function resetUI() {
  inventory = null; filesLite = [];
  ["summary", "filters", "dlrow", "progress", "scanprog", "failures", "advBox"].forEach((id) => $(id).classList.add("hidden"));
  $("tree").innerHTML = ""; $("types").innerHTML = ""; $("selcount").textContent = "";
  $("scan").textContent = t().scan; $("scan").disabled = false;
  setStatus(t().noScan);
}

$("scan").addEventListener("click", () => { $("failures").classList.add("hidden"); chrome.runtime.sendMessage({ type: "SCAN", opts: {} }); });
$("download").addEventListener("click", () => { $("failures").classList.add("hidden"); chrome.runtime.sendMessage({ type: "DOWNLOAD", selection: gatherSelection() }); });
$("cancel").addEventListener("click", () => { chrome.runtime.sendMessage({ type: "CANCEL" }); setStatus(t().cancelled); });
$("cancelScan").addEventListener("click", () => { chrome.runtime.sendMessage({ type: "CANCEL" }); $("scanprog").classList.add("hidden"); setStatus(t().cancelled); });
$("reset").addEventListener("click", () => { chrome.runtime.sendMessage({ type: "RESET" }).then(() => resetUI()); });
$("selAll").addEventListener("click", () => { document.querySelectorAll(".cchk:not([disabled]), .semchk").forEach((cb) => (cb.checked = true)); recount(); });
$("selNone").addEventListener("click", () => { document.querySelectorAll(".cchk, .semchk").forEach((cb) => (cb.checked = false)); recount(); });
$("filters").addEventListener("change", recount);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE") render(msg.state);
  else if (msg.type === "SCANNED") { inventory = msg; filesLite = msg.files || []; renderInventory(); $("scanprog").classList.add("hidden"); $("progress").classList.add("hidden"); }
  else if (msg.type === "CANCELLED") { setStatus(t().cancelled); $("scanprog").classList.add("hidden"); $("progress").classList.add("hidden"); $("download").disabled = false; }
});

function buildLang() {
  const sel = $("lang"); sel.innerHTML = "";
  for (const [code, label] of Object.entries(LANGS)) {
    const o = document.createElement("option"); o.value = code; o.textContent = label; sel.appendChild(o);
  }
  sel.value = lang;
  sel.addEventListener("change", async () => { lang = sel.value; await saveLang(lang); applyI18n(); if (inventory) renderInventory(); });
}

(async function init() {
  lang = await loadLang();
  applyI18n(); buildLang();
  const st = await chrome.runtime.sendMessage({ type: "GET_STATE" }).catch(() => null);
  if (st && st.state) render(st.state);
  const inv = await chrome.runtime.sendMessage({ type: "GET_INVENTORY" }).catch(() => null);
  if (inv && inv.inventory) { inventory = inv.inventory; filesLite = inv.inventory.files || []; renderInventory(); }
  else setStatus(t().noScan);
})();
