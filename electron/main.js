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
const execFileAsync = promisify(execFile);
const MAX_HIGHLIGHT_RECT_HEIGHT = 0.035;
const MAX_HIGHLIGHT_RECT_WIDTH = 0.92;
const MAX_HIGHLIGHT_RECT_AREA = 0.025;
const PREVIEW_TILE_DELAY_MS = 700;

let mainWindow = null;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 420,
    minHeight: 360,
    resizable: true,
    title: 'Paper Reviewer',
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
  const result = await dialog.showSaveDialog({
    title: 'Save review summary',
    defaultPath: defaultOutputPath(sourcePath, '-review-summary', '.md'),
    filters: [{ name: 'Markdown files', extensions: ['md'] }],
  });

  if (result.canceled || !result.filePath) return null;

  await fs.writeFile(result.filePath, payload.markdown || '', 'utf8');
  return { path: result.filePath };
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
