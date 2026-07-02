# tum-moodle-archive

A Chrome/Edge extension (Manifest V3) that scans your own TUM Moodle courses and saves the files to local folders, organised by semester, course, and category.

I built it because clicking through every course to download lecture slides, exercises, and solutions one by one is tedious, and I wanted a clean local copy of my study material that mirrors how Moodle is structured.

## How it works

The extension runs inside your already-logged-in browser session. It reads the course list and file listings the same way the Moodle web UI does, then downloads the files through the browser's normal download mechanism.

- **Uses your existing session.** It never asks for your password and never touches two-factor auth. If you're logged into Moodle, it works; if you're not, it doesn't.
- **Nothing is uploaded.** All files go straight to your local `Downloads` folder. There is no server, no account, no telemetry.
- **Incremental.** It keeps track of what it has already downloaded, so re-running it only fetches new files.
- **Category filtering.** You can include or skip categories such as Lectures, Exercises, Solutions, Exams, Formula Sheets, Scripts, and Others.
- **Bilingual UI.** Chinese and English.
- **German-aware sorting.** File classification recognises German course-material naming (Klausur, Übung, Lösung, Formelsammlung, Skript), so items land in the right category.

## Output layout

Files are organised so the local copy matches the course structure:

```
Downloads/TUM_Archive/<Semester>/<Course>/<Category>/<file>
```

## Install

This is an unpacked extension (not on the Chrome Web Store).

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project folder.
5. Log into TUM Moodle, open the extension, and start a scan.

## Limitations

- It only sees what your account can already access; it grants no extra permissions.
- Moodle markup changes over time. If the layout of a course page changes, scanning may need an update.
- It is designed for the TUM Moodle instance and its course layout, not Moodle in general.

## Disclaimer

This is a personal, unofficial tool for archiving your **own** course materials. It is not affiliated with, endorsed by, or connected to the Technical University of Munich. Respect the copyright of the material you download and the terms of use of your institution.

## License

MIT — see [LICENSE](LICENSE).
