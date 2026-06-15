# Codex Instructions for Paper Reviewer App

## Current app state

- Installable Electron macOS app.
- PDF.js renders the manuscript in the left half of the workspace.
- The right half shows page-matched review sheets with linked reviewer notes.
- Selected PDF text can be tagged as `Strength`, `Weakness`, `Question`, or `Suggestion`.
- Notes are persisted by source PDF path through the Electron main process.
- Paper Reviewer annotations are written directly into the original PDF with an atomic temp-file replace.
- Review summaries can be saved as markdown beside the source PDF.

## Design priorities

- Keep the app focused on reviewer flow: read, select, think, write, save.
- Preserve the 50/50 paper and review layout.
- Keep review sheets visually aligned with the corresponding PDF pages.
- Keep the pink/purple color scheme restrained and readable.
- Avoid duplicating PDF annotations on repeated saves.
- Avoid silently adding large generated artifacts to Git.

## Implementation notes

- Renderer files live in `src/`.
- Electron desktop bridge lives in `electron/`.
- Local PDF.js runtime lives in `src/vendor/pdfjs/`.
- `node_modules/` and `dist/` are ignored and should not be committed.
- PDF annotation writing uses `pdf-lib` in the Electron main process.
