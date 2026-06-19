# Paper Reviewer

Paper Reviewer is a macOS desktop app for reading academic manuscript PDFs and writing review notes beside the paper. It links selected PDF text to structured reviewer notes, saves Paper Reviewer highlights back into the original PDF, and exports a Markdown review summary with any note images.

The app is built with Electron, PDF.js, and pdf-lib. It runs locally on your machine; PDFs and review notes are not sent to a server.

## Features

- Open or drag a manuscript PDF into the paper panel.
- Read the PDF with selectable text rendered by PDF.js.
- Select text and create linked review notes.
- Mark selections as highlights or underlines.
- Tag notes as `Strength`, `Weakness`, `Question`, or `Suggestion`.
- Choose annotation colors for PDF marks.
- Write rich review notes with paragraphs, headings, quotes, code blocks, text sizes, text colors, highlights, and embedded images.
- Paste or drag snapshots/images directly into the review note.
- Add visible page breaks in the review note.
- Hide manuscript metadata when you want more writing space.
- Keep the note formatting toolbar visible while scrolling long reviews.
- Auto-fill editable manuscript metadata when possible: title, authors, journal, and date.
- Save Paper Reviewer annotations directly into the original PDF.
- Export a Markdown review summary and image assets.
- Reopen exported Markdown summaries as editable reviews, including local note images when available.
- Complete a structured final assessment with journal fit, major claims, novelty, evidence, influence, and a 1–10 novelty score.
- Use Preview Companion mode to open the PDF in macOS Preview beside the review notes.

## Requirements

- macOS
- Node.js and npm

The packaged app targets macOS. The code is mostly standard Electron, but Preview Companion and app packaging are macOS-specific.

## Install From Source

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd paper-reviewer
npm install
```

Run the app in development mode:

```bash
npm start
```

Build a macOS app package:

```bash
npm run package:mac
```

The build output is written to `dist/`. If a DMG is produced, open it and drag Paper Reviewer into `/Applications`. You can also copy the generated `.app` bundle from `dist/mac-arm64/` into `/Applications`.

## Basic Workflow

1. Open Paper Reviewer.
2. Click `Open PDF`, or drag a PDF into the manuscript panel.
3. Select text in the PDF.
4. Choose `Note` to create a linked review note, or `Mark PDF` to mark the PDF only.
5. Write or edit your review in the notes panel.
6. Use `Save to Original PDF` to write Paper Reviewer annotations back into the opened PDF.
7. Use `Finish Review` to complete the final assessment, preview the combined summary, and copy or save it as Markdown.
8. Use `Open Summary` to reopen a previously exported Markdown review for further editing.

## Review Notes

The review editor supports:

- Bold, italic, underline, and strikethrough.
- Paragraph, heading, quote, and code block styles.
- Text size controls.
- A custom text color picker and preset colors.
- Highlight color.
- Image insertion from file picker, paste, or drag/drop.
- Page breaks for separating longer reviews.

Images embedded in notes are stored in the local review state as data URLs. When you save a Markdown summary, image files are exported into a sibling assets folder.

## Final Assessment And Summary Import

`Finish Review` adds five optional assessment prompts covering journal suitability, major claims, novelty and significance, strength of evidence, and likely influence. Novelty can also be scored from 1 to 10. Incomplete answers are retained as drafts and shown as unanswered in the Markdown preview.

`Open Summary` restores summaries exported by Paper Reviewer into editable metadata, notes, and assessment fields. Linked annotations are imported as editable note content because Markdown does not contain the PDF coordinates needed to recreate highlights. Any PDF marks already open in the app are left unchanged. Generic Markdown files can also be opened as editable review notes.

## PDF And Data Handling

- Review state is stored locally by source PDF path in Electron's app data directory.
- The opened PDF path is used as the key for restoring notes and settings.
- PDF annotations are written into the original PDF with an atomic temporary-file replace.
- Existing Paper Reviewer annotations are removed before rewriting the current annotation set, which prevents duplicate highlights after repeated saves.
- The app does not upload PDFs, notes, or images.

## Limitations

- Linked notes require selectable PDF text. Scanned PDFs may need OCR before text selection works.
- PDF annotation saving writes to the original file. Keep a backup if you are reviewing an important manuscript copy.
- The app is currently focused on macOS.
- Code signing and notarization are not configured in this repository.

## Project Structure

- `electron/main.js` - Electron window setup, native dialogs, PDF writing, summary saving, review-state storage.
- `electron/preload.js` - Secure renderer bridge for native file actions.
- `src/index.html` - App layout.
- `src/styles.css` - Desktop UI styling.
- `src/app.js` - PDF rendering, annotations, note editor behavior, drag/drop, and summary generation.
- `src/vendor/pdfjs/` - Local PDF.js runtime.
- `src/assets/` - Renderer assets.
- `build/` - App icon assets used for packaging.
- `DESIGN.md` - Design notes and product direction.
- `CODEX.md` - Development notes for AI-assisted maintenance.

## Development Notes

Useful commands:

```bash
npm start
npm run package:mac
node --check src/app.js
node --check electron/main.js
node --check electron/preload.js
```

Before publishing, avoid committing generated build output from `dist/` or dependency folders such as `node_modules/`.

## License

No license has been specified yet. Add a license before inviting public reuse or redistribution.
