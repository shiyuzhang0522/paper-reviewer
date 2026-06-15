# Paper Reviewer App

An installable desktop PDF reviewer for reading manuscripts, linking selected PDF text to review notes, saving annotations into the original PDF, and exporting markdown summaries beside the manuscript.

## Purpose

- Open a manuscript PDF in the left half of the app
- Write page-matched review notes in the right half
- Auto-fill editable manuscript details: title, authors, journal, and date
- Select PDF text and add linked notes with colored highlights
- Tag notes as `Strength`, `Weakness`, `Question`, or `Suggestion`
- Save annotations directly into the original PDF so they open in Preview
- Save a markdown review summary next to the source PDF by default

## Getting started

Install dependencies once:

```bash
npm install
```

Run the desktop app:

```bash
npm start
```

Build a macOS app package:

```bash
npm run package:mac
```

## File structure

- `electron/main.js` - Electron window, native dialogs, PDF/summary saving, review-state storage
- `electron/preload.js` - secure renderer bridge for native file actions
- `src/index.html` - app layout
- `src/styles.css` - pink/purple desktop UI
- `src/app.js` - PDF rendering and review interaction logic
- `src/vendor/pdfjs/` - local PDF.js runtime
- `DESIGN.md` - app design notes

## Notes

The app writes Paper Reviewer highlights/comments directly into the opened PDF. Writes are done through a temporary file and replace step so failed saves do not leave a half-written manuscript. Review summaries default to the same folder as the opened PDF.
