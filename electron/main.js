const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  rgb,
} = require('pdf-lib');

const REVIEW_DIR = 'reviews';
const SUMMARY_ASSET_DIR_PLACEHOLDER = 'review-summary-assets';
const execFileAsync = promisify(execFile);
const MAX_HIGHLIGHT_RECT_HEIGHT = 0.035;
const MAX_HIGHLIGHT_RECT_WIDTH = 0.92;
const MAX_HIGHLIGHT_RECT_AREA = 0.025;
const PREVIEW_TILE_DELAY_MS = 700;
const APP_ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png');

let mainWindow = null;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createWindow() {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(APP_ICON_PATH);
  }

  const win = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 420,
    minHeight: 360,
    resizable: true,
    title: 'Paper Reviewer',
    icon: APP_ICON_PATH,
    backgroundColor: '#fbf7ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow = win;

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

function companionWindowBounds() {
  const fallback = { x: 0, y: 0, width: 1480, height: 980 };
  const currentBounds = mainWindow?.getBounds() || fallback;
  const workArea = screen.getDisplayMatching(currentBounds).workArea;
  const previewWidth = Math.floor(workArea.width * 0.52);
  const reviewerWidth = workArea.width - previewWidth;

  return {
    preview: {
      x: workArea.x,
      y: workArea.y,
      width: previewWidth,
      height: workArea.height,
    },
    reviewer: {
      x: workArea.x + previewWidth,
      y: workArea.y,
      width: reviewerWidth,
      height: workArea.height,
    },
  };
}

async function tilePreviewWindow(previewBounds) {
  const script = `
tell application "Preview" to activate
delay 0.15
tell application "System Events"
  if exists process "Preview" then
    tell process "Preview"
      if (count of windows) > 0 then
        set position of window 1 to {${previewBounds.x}, ${previewBounds.y}}
        set size of window 1 to {${previewBounds.width}, ${previewBounds.height}}
      end if
    end tell
  end if
end tell
`;

  await execFileAsync('/usr/bin/osascript', ['-e', script]);
}

async function arrangePreviewCompanionWindows() {
  if (!mainWindow || mainWindow.isDestroyed()) return { tiled: false };

  const bounds = companionWindowBounds();
  mainWindow.setBounds(bounds.reviewer, true);

  try {
    await tilePreviewWindow(bounds.preview);
    mainWindow.focus();
    return { tiled: true };
  } catch (error) {
    mainWindow.focus();
    return {
      tiled: false,
      reason: error?.message || 'macOS blocked Preview window placement.',
    };
  }
}

function keyForPath(filePath) {
  return crypto.createHash('sha256').update(filePath || 'untitled').digest('hex');
}

async function ensureReviewDir() {
  const dir = path.join(app.getPath('userData'), REVIEW_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function reviewStatePath(filePath) {
  const dir = await ensureReviewDir();
  return path.join(dir, `${keyForPath(filePath)}.json`);
}

function defaultOutputPath(sourcePath, suffix, extension) {
  const parsed = path.parse(sourcePath || path.join(app.getPath('documents'), 'manuscript.pdf'));
  return path.join(parsed.dir, `${parsed.name}${suffix}${extension}`);
}

function defaultSummaryPdfPath(sourcePath, summaryPath) {
  if (summaryPath) {
    const parsed = path.parse(summaryPath);
    return path.join(parsed.dir, `${parsed.name}.pdf`);
  }
  return defaultOutputPath(sourcePath, '-review-summary', '.pdf');
}

function imageTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return 'image/png';
}

async function markdownImageAssets(markdown, markdownPath) {
  const assets = [];
  const references = new Set();
  const imagePattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let match = imagePattern.exec(markdown);

  while (match) {
    references.add(match[1]);
    match = imagePattern.exec(markdown);
  }

  for (const reference of references) {
    if (/^(data:|https?:\/\/)/i.test(reference)) continue;
    try {
      const decodedReference = decodeURIComponent(reference);
      const assetPath = path.resolve(path.dirname(markdownPath), decodedReference);
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(assetPath).toLowerCase())) continue;
      const bytes = await fs.readFile(assetPath);
      assets.push({
        reference,
        name: path.basename(assetPath),
        dataUrl: `data:${imageTypeForPath(assetPath)};base64,${bytes.toString('base64')}`,
      });
    } catch {
      // Missing image assets should not prevent the summary text from opening.
    }
  }

  return assets;
}

function bufferFromDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(?:png|jpe?g|webp|gif);base64,(.+)$/i);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function parseMarkdownTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isMarkdownTableSeparator(line) {
  const cells = parseMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function markdownToPrintableHtml(markdown, assets = []) {
  const assetMap = new Map();
  assets.forEach((asset) => {
    if (!asset?.filename || !asset?.dataUrl) return;
    assetMap.set(`${SUMMARY_ASSET_DIR_PLACEHOLDER}/${asset.filename}`, asset.dataUrl);
    assetMap.set(asset.filename, asset.dataUrl);
  });

  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraphLines = [];
  let codeLines = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraphLines.join(' ').trim())}</p>`);
    paragraphLines = [];
  };

  const flushCode = () => {
    html.push(`<pre>${escapeHtml(codeLines.join('\n'))}</pre>`);
    codeLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === SUMMARY_FORMAT_MARKER) continue;

    if (/^```/.test(trimmed)) {
      flushParagraph();
      if (inCodeBlock) flushCode();
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed === '---') {
      flushParagraph();
      html.push('<hr>');
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1])) {
      flushParagraph();
      const tableRows = [parseMarkdownTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        tableRows.push(parseMarkdownTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      const header = tableRows[0] || [];
      const bodyRows = tableRows.slice(1);
      html.push('<table><thead><tr>');
      header.forEach((cell) => html.push(`<th>${inlineMarkdown(cell)}</th>`));
      html.push('</tr></thead><tbody>');
      bodyRows.forEach((row) => {
        html.push('<tr>');
        row.forEach((cell) => html.push(`<td>${inlineMarkdown(cell)}</td>`));
        html.push('</tr>');
      });
      html.push('</tbody></table>');
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/);
    if (imageMatch) {
      flushParagraph();
      const source = assetMap.get(imageMatch[2]) || imageMatch[2];
      if (/^data:image\//i.test(source)) {
        html.push(`<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(imageMatch[1])}"><figcaption>${escapeHtml(imageMatch[1])}</figcaption></figure>`);
      } else {
        html.push(`<p class="image-missing">Image unavailable: ${escapeHtml(imageMatch[1] || imageMatch[2])}</p>`);
      }
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = Math.min(headingMatch[1].length, 4);
      html.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, '').trim())}</blockquote>`);
      continue;
    }

    paragraphLines.push(line.replace(/^[-*+]\s+/, ''));
  }

  if (inCodeBlock || codeLines.length) flushCode();
  flushParagraph();
  return html.join('\n');
}

function summaryPdfDocumentHtml(markdown, assets) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0.58in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #291b34;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.58;
    }
    h1, h2, h3, h4 {
      margin: 0.9em 0 0.35em;
      color: #21142b;
      line-height: 1.25;
      page-break-after: avoid;
    }
    h1 { margin-top: 0; font-size: 26px; }
    h2 { padding-top: 8px; border-top: 1px solid #ead4f7; font-size: 18px; }
    h3 { font-size: 14px; }
    h4 { font-size: 12px; }
    p { margin: 0 0 0.72em; }
    blockquote {
      margin: 0 0 0.75em;
      padding: 7px 10px;
      border-left: 4px solid #d8bddf;
      background: #fbf7ff;
      color: #493556;
    }
    table {
      width: 100%;
      margin: 0 0 0.85em;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: avoid;
    }
    th, td {
      padding: 6px 8px;
      border: 1px solid #d8bddf;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th { background: #f7effb; text-align: left; }
    pre, code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f5f0f8;
    }
    pre {
      white-space: pre-wrap;
      padding: 8px 10px;
      border-radius: 6px;
      overflow-wrap: anywhere;
    }
    figure { margin: 10px 0 14px; page-break-inside: avoid; }
    img {
      display: block;
      max-width: 100%;
      max-height: 7.2in;
      object-fit: contain;
    }
    figcaption, .image-missing {
      margin-top: 4px;
      color: #7b6688;
      font-size: 10px;
    }
    hr {
      break-after: page;
      page-break-after: always;
      border: 0;
      margin: 0;
    }
  </style>
</head>
<body>
${markdownToPrintableHtml(markdown, assets)}
</body>
</html>`;
}

async function writeSummaryPdf({ destinationPath, markdown, assets }) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    const html = summaryPdfDocumentHtml(markdown, assets);
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfBytes = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'none',
      },
    });
    await fs.writeFile(destinationPath, pdfBytes);
  } finally {
    printWindow.destroy();
  }
}

function annotationColor(annotation) {
  if (annotation.color === 'purple') return rgb(0.72, 0.58, 1);
  if (annotation.color === 'yellow') return rgb(1, 0.86, 0.34);
  if (annotation.color === 'green') return rgb(0.5, 0.78, 0.56);
  if (annotation.color === 'blue') return rgb(0.36, 0.66, 1);
  if (annotation.color === 'orange') return rgb(1, 0.58, 0.24);
  if (annotation.color === 'red') return rgb(1, 0.33, 0.38);
  if (annotation.color === 'pink') return rgb(0.93, 0.48, 0.79);

  const tag = annotation.tag;
  if (tag === 'Weakness') return rgb(1, 0.55, 0.72);
  if (tag === 'Question') return rgb(0.72, 0.58, 1);
  if (tag === 'Suggestion') return rgb(0.96, 0.66, 1);
  return rgb(0.93, 0.48, 0.79);
}

function annotationColorArray(pdfDoc, annotation) {
  const color = annotationColor(annotation);
  return pdfDoc.context.obj([color.red, color.green, color.blue]);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeHighlightRect(rect) {
  const pageNumber = Number(rect?.pageNumber);
  if (!Number.isFinite(pageNumber)) return null;

  const x = clamp(Number(rect.x), 0, 1);
  const y = clamp(Number(rect.y), 0, 1);
  const width = clamp(Number(rect.width), 0, 1 - x);
  const height = clamp(Number(rect.height), 0, 1 - y);

  if (width <= 0 || height <= 0) return null;
  if (width > MAX_HIGHLIGHT_RECT_WIDTH) return null;
  if (height > MAX_HIGHLIGHT_RECT_HEIGHT) return null;
  if (width * height > MAX_HIGHLIGHT_RECT_AREA) return null;

  return { pageNumber, x, y, width, height };
}

function getOrCreateAnnotsArray(pdfDoc, page) {
  let annots = page.node.lookup(PDFName.of('Annots'));
  if (annots instanceof PDFArray) return annots;

  annots = pdfDoc.context.obj([]);
  page.node.set(PDFName.of('Annots'), annots);
  return annots;
}

function decodePdfText(value) {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText();
  if (value instanceof PDFName) return value.asString();
  return '';
}

function isPaperReviewerAnnotation(annotation) {
  if (!(annotation instanceof PDFDict)) return false;

  const author = decodePdfText(annotation.get(PDFName.of('T')));
  const name = decodePdfText(annotation.get(PDFName.of('NM')));
  return author === 'Paper Reviewer' || name.startsWith('PaperReviewer:');
}

function removePaperReviewerAnnotations(pdfDoc) {
  pdfDoc.getPages().forEach((page) => {
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) return;

    for (let index = annots.size() - 1; index >= 0; index -= 1) {
      const annotation = annots.lookup(index);
      if (isPaperReviewerAnnotation(annotation)) {
        annots.remove(index);
      }
    }
  });
}

function rectToPdfCoordinates(rect, page) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const x1 = rect.x * pageWidth;
  const x2 = (rect.x + rect.width) * pageWidth;
  const yTop = pageHeight - rect.y * pageHeight;
  const yBottom = pageHeight - (rect.y + rect.height) * pageHeight;
  return {
    x1,
    x2,
    yTop,
    yBottom,
    rect: [x1, yBottom, x2, yTop],
    quadPoints: [x1, yTop, x2, yTop, x1, yBottom, x2, yBottom],
  };
}

function addHighlightAnnotation(pdfDoc, page, annotation, rect, rectIndex) {
  const coordinates = rectToPdfCoordinates(rect, page);
  const contents = [
    annotation.tag,
    annotation.section ? `Section: ${annotation.section}` : '',
    annotation.markType ? `Mark: ${annotation.markType}` : '',
    annotation.comment || '',
    annotation.text ? `Selected text: ${annotation.text}` : '',
  ].filter(Boolean).join('\n\n');

  const annotationDict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of(annotation.markType === 'underline' ? 'Underline' : 'Highlight'),
    Rect: coordinates.rect,
    QuadPoints: coordinates.quadPoints,
    Contents: PDFString.of(contents),
    T: PDFString.of('Paper Reviewer'),
    NM: PDFString.of(`PaperReviewer:${annotation.id}:${rectIndex}`),
    C: annotationColorArray(pdfDoc, annotation),
    CA: annotation.markType === 'underline' ? 0.85 : 0.28,
    F: 4,
  });

  const ref = pdfDoc.context.register(annotationDict);
  getOrCreateAnnotsArray(pdfDoc, page).push(ref);
}

async function writeAnnotatedPdf({ sourcePath, annotations }) {
  const sourceBytes = await fs.readFile(sourcePath);
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const pages = pdfDoc.getPages();

  removePaperReviewerAnnotations(pdfDoc);

  annotations.forEach((annotation) => {
    const rects = Array.isArray(annotation.rects) ? annotation.rects : [];
    rects.forEach((rect, rectIndex) => {
      const cleanRect = sanitizeHighlightRect({
        ...rect,
        pageNumber: rect.pageNumber || annotation.pageNumber || 1,
      });
      const page = pages[(cleanRect?.pageNumber || 1) - 1];
      if (page && cleanRect) addHighlightAnnotation(pdfDoc, page, annotation, cleanRect, rectIndex);
    });
  });

  return pdfDoc.save();
}

async function overwritePdfAtomically(filePath, pdfBytes) {
  const tempPath = `${filePath}.paper-reviewer.tmp`;
  await fs.writeFile(tempPath, pdfBytes);
  await fs.rename(tempPath, filePath);
}

ipcMain.handle('pdf:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open manuscript PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF files', extensions: ['pdf'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const bytes = await fs.readFile(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    bytes: Array.from(bytes),
  };
});

ipcMain.handle('image:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Insert image into review notes',
    properties: ['openFile'],
    filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const bytes = await fs.readFile(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    type: imageTypeForPath(filePath),
    bytes: Array.from(bytes),
  };
});

ipcMain.handle('pdf:read', async (_event, payload) => {
  const sourcePath = payload?.sourcePath;
  if (!sourcePath) throw new Error('No source PDF path was provided.');

  const bytes = await fs.readFile(sourcePath);
  return Array.from(bytes);
});

ipcMain.handle('pdf:saveAnnotated', async (_event, payload) => {
  const sourcePath = payload?.sourcePath;
  if (!sourcePath) throw new Error('No source PDF path was provided.');

  const annotatedBytes = await writeAnnotatedPdf({
    sourcePath,
    annotations: payload.annotations || [],
  });
  await overwritePdfAtomically(sourcePath, annotatedBytes);
  return { path: sourcePath };
});

ipcMain.handle('pdf:openInPreview', async (_event, payload) => {
  const sourcePath = payload?.sourcePath;
  if (!sourcePath) throw new Error('No source PDF path was provided.');

  await execFileAsync('/usr/bin/open', ['-a', 'Preview', sourcePath]);
  await wait(PREVIEW_TILE_DELAY_MS);
  const tileResult = await arrangePreviewCompanionWindows();
  return { opened: true, ...tileResult };
});

ipcMain.handle('window:tilePreviewCompanion', async () => {
  return arrangePreviewCompanionWindows();
});

ipcMain.handle('summary:save', async (_event, payload) => {
  const sourcePath = payload?.sourcePath;
  let destinationPath = payload?.destinationPath;
  if (!destinationPath) {
    const result = await dialog.showSaveDialog({
      title: 'Save review summary',
      defaultPath: defaultOutputPath(sourcePath, '-review-summary', '.md'),
      filters: [{ name: 'Markdown files', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    destinationPath = result.filePath;
  }

  const parsed = path.parse(destinationPath);
  const assetDirName = `${parsed.name}-assets`;
  const assetDirPath = path.join(parsed.dir, assetDirName);
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  let markdown = String(payload.markdown || '').replaceAll(`${SUMMARY_ASSET_DIR_PLACEHOLDER}/`, `${assetDirName}/`);

  if (assets.length > 0) {
    await fs.mkdir(assetDirPath, { recursive: true });
    await Promise.all(assets.map(async (asset, index) => {
      const safeName = path.basename(asset.filename || `note-image-${index + 1}.png`);
      const buffer = bufferFromDataUrl(asset.dataUrl);
      if (!buffer) return;
      await fs.writeFile(path.join(assetDirPath, safeName), buffer);
    }));
  }

  await fs.writeFile(destinationPath, markdown, 'utf8');
  return { path: destinationPath, assetDir: assets.length > 0 ? assetDirPath : null };
});

ipcMain.handle('summary:savePdf', async (_event, payload) => {
  const sourcePath = payload?.sourcePath;
  let destinationPath = payload?.destinationPath;
  if (!destinationPath) {
    const result = await dialog.showSaveDialog({
      title: 'Save review summary PDF',
      defaultPath: defaultSummaryPdfPath(sourcePath, payload?.summaryPath),
      filters: [{ name: 'PDF files', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    destinationPath = result.filePath;
  }

  await writeSummaryPdf({
    destinationPath,
    markdown: String(payload?.markdown || ''),
    assets: Array.isArray(payload?.assets) ? payload.assets : [],
  });
  return { path: destinationPath };
});

ipcMain.handle('summary:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open saved review summary',
    properties: ['openFile'],
    filters: [{ name: 'Markdown files', extensions: ['md', 'markdown'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const markdown = await fs.readFile(filePath, 'utf8');
  return {
    path: filePath,
    name: path.basename(filePath),
    markdown,
    assets: await markdownImageAssets(markdown, filePath),
  };
});

ipcMain.handle('review:load', async (_event, payload) => {
  const filePath = payload?.sourcePath;
  if (!filePath) return null;

  try {
    const statePath = await reviewStatePath(filePath);
    const content = await fs.readFile(statePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
});

ipcMain.handle('review:save', async (_event, payload) => {
  const filePath = payload?.sourcePath;
  if (!filePath) return { saved: false };

  const statePath = await reviewStatePath(filePath);
  await fs.writeFile(statePath, JSON.stringify(payload.state || {}, null, 2), 'utf8');
  return { saved: true };
});

ipcMain.handle('review:clear', async (_event, payload) => {
  const filePath = payload?.sourcePath;
  if (!filePath) return { cleared: false };

  try {
    await fs.unlink(await reviewStatePath(filePath));
  } catch {
    // Nothing to clear is a successful clear from the user's point of view.
  }
  return { cleared: true };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
