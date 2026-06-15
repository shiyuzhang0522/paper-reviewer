# Paper Reviewer App Design

## User story

As a manuscript reviewer, I want to read a PDF and write structured notes beside the exact page I am reading, so I can prepare a clear review while keeping evidence linked to the paper.

## Core features

- Installable macOS desktop app
- PDF reader with selectable text
- Page-matched review sheets
- Linked PDF highlights and reviewer comments
- Editable manuscript metadata: title, authors, journal, date
- Tags: `Strength`, `Weakness`, `Question`, `Suggestion`
- Direct save into the original PDF
- Markdown review-summary export

## UI layout

- Left half: PDF manuscript
- Right half: same-height review sheets for each PDF page
- Header: open PDF, save to original PDF, clear review, review summary
- Selection menu: quick entry point for a linked note

## Save model

- The opened PDF path is the source of truth.
- App review state is stored by PDF path for fast reloads.
- PDF annotations are written back to the original file with an atomic temp-file replace.
- Existing Paper Reviewer annotations are removed before writing the current set to prevent duplicate highlights.

## Future improvements

- Custom app icon and code signing
- Better PDF annotation appearance controls
- OCR support for scanned PDFs
- Review checklist templates
- Optional project/session export
