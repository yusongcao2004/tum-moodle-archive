export const LANGS = { zh: "中文", en: "EN" };
export const DEFAULT_LANG = "zh";

export const MESSAGES = {
  zh: {
    title: "Moodle Archive",
    scan: "扫描我的课程",
    rescan: "重新扫描",
    scanning: "正在扫描课程……（几分钟，别关浏览器）",
    loginRequired: "尚未登录 Moodle。请打开 moodle.tum.de 登录后重试。",
    noScan: "先点「扫描」列出你的课程（不下载）。",
    cCourses: "门课", cFiles: "个文件", cNew: "个新文件",
    filtersType: "文件类型",
    examOnly: "只要考试相关（Klausur/Altklausur…）",
    selectAll: "全选", selectNone: "全不选",
    download: "下载选中",
    downloading: "正在下载到 Downloads/TUM_Archive/ …",
    done: "完成",
    lblDownloaded: "下载", lblSkipped: "已有跳过", lblFailed: "失败",
    failuresTitle: "失败文件",
    redownload: "忽略已下载记录，全部重下",
    newBadge: "新",
    footNote: "仅在你已登录的浏览器内运行 · 不上传任何文件",
    errorPfx: "出错：",
    scanningCourses: "正在获取课程列表……",
    scanProgress: (d, n) => `正在扫描课程 ${d}/${n} ……`,
    cancel: "停止",
    reset: "重置",
    cancelled: "已停止。可重新选择后再下载。",
    moreInfo: "其他信息",
    aboutNote: "非官方工具 · 仅供 TUM 师生个人使用 · 作者 Yusong Cao（曹雨松）",
    selCount: (n, nw) => `将下载 ${n} 个文件（其中 ${nw} 新）`,
  },
  en: {
    title: "Moodle Archive",
    scan: "Scan my courses",
    rescan: "Re-scan",
    scanning: "Scanning courses… (a few minutes; keep the browser open)",
    loginRequired: "Not logged in to Moodle. Open moodle.tum.de, sign in, then retry.",
    noScan: "Click Scan to list your courses (no download yet).",
    cCourses: "courses", cFiles: "files", cNew: "new",
    filtersType: "File types",
    examOnly: "Exam materials only (Klausur/Altklausur…)",
    selectAll: "All", selectNone: "None",
    download: "Download selected",
    downloading: "Downloading to Downloads/TUM_Archive/ …",
    done: "Done",
    lblDownloaded: "downloaded", lblSkipped: "skipped", lblFailed: "failed",
    failuresTitle: "Failed files",
    redownload: "Ignore download history, re-download all",
    newBadge: "new",
    footNote: "Runs in your logged-in browser · nothing is uploaded",
    errorPfx: "Error: ",
    scanningCourses: "Fetching course list…",
    scanProgress: (d, n) => `Scanning courses ${d}/${n} …`,
    cancel: "Stop",
    reset: "Reset",
    cancelled: "Stopped. Re-select and download again.",
    moreInfo: "More info",
    aboutNote: "Unofficial · for TUM staff & students only · by Yusong Cao (曹雨松)",
    selCount: (n, nw) => `${n} files selected (${nw} new)`,
  },
};

export async function loadLang() {
  const { lang } = await chrome.storage.local.get("lang");
  return MESSAGES[lang] ? lang : DEFAULT_LANG;
}
export async function saveLang(lang) { await chrome.storage.local.set({ lang }); }
