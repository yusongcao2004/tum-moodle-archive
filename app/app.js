// FRONT-END PROTOTYPE ONLY. Mock data + fake interactions. No real Moodle access.

const I18N = {
  zh: {
    title: "Moodle Archive",
    tagline: "把你在 TUM Moodle 里已有访问权限的课程文件，整理归档到本地。",
    scanH: "扫描课程",
    scan: "扫描我的课程",
    scanHint: "先列出你能访问的课程与文件，此步不下载任何内容。",
    scanDone: (c, f) => `${c} 门课 · ${f} 个文件`,
    fSemester: "学期",
    all: "全部",
    fType: "文件类型",
    tLectures: "讲义", tExercises: "习题", tSolutions: "解答",
    tFormula: "公式表", tScripts: "脚本", tOther: "其他",
    fQuick: "快捷",
    qExams: "仅往年卷", qSlides: "仅讲义与脚本",
    courses: "课程",
    selectHint: "扫描后在此勾选",
    emptyState: "尚未扫描。",
    featuresTitle: "开发计划",
    fVideo: "录播视频归档", fVideoD: "TUM-Live / Panopto 课程录播",
    fCal: "截止日期导出日历", fCalD: "汇总作业与考试日期为 .ics",
    fKeep: "保持登录", fKeepD: "保活 Shibboleth 会话，防止自动登出",
    fSync: "增量同步", fSyncD: "仅下载新文件并提示更新",
    soon: "计划中",
    download: "下载选中",
    dlMeta: (n, mb) => `约 ${n} 个文件 · ${mb} MB`,
    footNote: "仅在你已登录的浏览器内运行 · 不上传任何文件",
    moreInfo: "其他信息",
    aboutNote: "非官方工具 · 仅供 TUM 师生个人使用 · 作者 Yusong Cao（曹雨松）",
    help: "工作原理与安全",
  },
  en: {
    title: "Moodle Archive",
    tagline: "Archive the TUM Moodle course files you already have access to, onto your own machine.",
    scanH: "Scan courses",
    scan: "Scan my courses",
    scanHint: "List the courses and files you can access. Nothing is downloaded in this step.",
    scanDone: (c, f) => `${c} courses · ${f} files`,
    fSemester: "Semester",
    all: "All",
    fType: "File type",
    tLectures: "Lectures", tExercises: "Exercises", tSolutions: "Solutions",
    tFormula: "Formula", tScripts: "Scripts", tOther: "Other",
    fQuick: "Quick",
    qExams: "Past exams only", qSlides: "Slides & scripts only",
    courses: "Courses",
    selectHint: "Tick after scanning",
    emptyState: "Not scanned yet.",
    featuresTitle: "Roadmap",
    fVideo: "Lecture-recording archive", fVideoD: "TUM-Live / Panopto recordings",
    fCal: "Deadlines to calendar", fCalD: "Assignment & exam dates as .ics",
    fKeep: "Keep logged in", fKeepD: "Keeps the Shibboleth session alive",
    fSync: "Incremental sync", fSyncD: "Fetch only new files, flag updates",
    soon: "Planned",
    download: "Download selected",
    dlMeta: (n, mb) => `~${n} files · ${mb} MB`,
    footNote: "Runs in your logged-in browser · nothing is uploaded",
    moreInfo: "More info",
    aboutNote: "Unofficial · for TUM staff & students only · by Yusong Cao (曹雨松)",
    help: "How it works & safety",
  },
};

// Generic SAMPLE data for the UI preview only — not anyone's real course list.
const MOCK = [
  { sem: "SoSe 2026", courses: [
    { name: "Beispiel-Vorlesung A", tag: "VL", files: 48 },
    { name: "Beispiel-Vorlesung B", tag: "VL", files: 31 },
    { name: "Beispiel-Vorlesung C", tag: "VL", files: 27 },
    { name: "Beispiel-Labor", tag: "PR", files: 12 },
  ]},
  { sem: "WiSe 2025/26", courses: [
    { name: "Sample Lecture D", tag: "VL", files: 51 },
    { name: "Sample Lecture E", tag: "VL", files: 24 },
    { name: "Sample Seminar F", tag: "SE", files: 9 },
  ]},
  { sem: "SoSe 2025", courses: [
    { name: "Demo Course G", tag: "VL", files: 42 },
    { name: "Demo Course H", tag: "VL", files: 30 },
  ]},
];

let lang = "zh";
const t = () => I18N[lang];
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let scanned = false;

function applyI18n() {
  const m = t();
  document.documentElement.lang = lang;
  $$("[data-i18n]").forEach((el) => {
    const v = m[el.getAttribute("data-i18n")];
    if (typeof v === "string") el.textContent = v;
  });
  $$(".lang-opt").forEach((b) => b.classList.toggle("on", b.dataset.lang === lang));
}

function setStatus(text) {
  const el = $("#scan-status");
  el.textContent = text;
  el.classList.add("done");
}

function renderTree() {
  const tree = $("#tree");
  tree.classList.remove("empty");
  tree.innerHTML = "";
  const unit = lang === "zh" ? "个文件" : "files";
  for (const group of MOCK) {
    const total = group.courses.reduce((a, c) => a + c.files, 0);
    const sem = document.createElement("div");
    sem.className = "sem";
    sem.innerHTML = `<div class="sem-head"><input type="checkbox" checked /> ${group.sem}
      <span class="count">${group.courses.length} · ${total} ${unit}</span></div>`;
    for (const c of group.courses) {
      const row = document.createElement("div");
      row.className = "course";
      row.innerHTML = `<input type="checkbox" ${c.files > 13 ? "checked" : ""}/>
        <span class="cname">${c.name}</span>
        <span class="tag">${c.tag}</span>
        <span class="fcount">${c.files}</span>`;
      sem.appendChild(row);
    }
    tree.appendChild(sem);
  }
}

function recountSelection() {
  if (!scanned) return;
  let n = 0;
  $$("#tree .course").forEach((row) => {
    if (row.querySelector('input[type="checkbox"]').checked) {
      n += parseInt(row.querySelector(".fcount").textContent, 10) || 0;
    }
  });
  $("#sel-summary").textContent = t().dlMeta(n, Math.round(n * 1.4));
  const dl = $("#download");
  dl.textContent = `${t().download} · ${n}`;
}

function doScan() {
  scanned = true;
  setStatus(t().scanDone(15, 437));
  renderTree();
  $("#tree").addEventListener("change", recountSelection);
  recountSelection();
}

$("#scan").addEventListener("click", doScan);

$("#download").addEventListener("click", () => {
  if (!scanned) doScan();
  const prog = $("#progress");
  prog.classList.remove("hidden");
  const fill = $("#fill");
  let p = 0; const total = 312;
  const timer = setInterval(() => {
    p += Math.max(2, Math.round(Math.random() * 9));
    if (p >= total) { p = total; clearInterval(timer); }
    fill.style.width = `${Math.round((p / total) * 100)}%`;
    $("#pcount").textContent = `${p} / ${total}`;
    $("#pmeta").textContent = lang === "zh"
      ? `下载 ${p} · 跳过 0 · 失败 0`
      : `${p} done · 0 skipped · 0 failed`;
  }, 170);
});

$$(".lang-opt").forEach((b) => b.addEventListener("click", () => {
  lang = b.dataset.lang;
  applyI18n();
  if (scanned) {
    setStatus(t().scanDone(15, 437));
    renderTree();
    $("#tree").addEventListener("change", recountSelection);
    recountSelection();
  }
}));

applyI18n();

// Demo hook: open with #demo to auto-populate the scanned state (for previews).
if (location.hash === "#demo") doScan();
