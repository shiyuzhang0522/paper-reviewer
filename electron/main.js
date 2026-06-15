const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
    title: 'Paper Reviewer',
    backgroundColor: '#fbf7ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
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

function annotationColor(tag) {
  if (tag === 'Weakness') return rgb(1, 0.55, 0.72);
  if (tag === 'Question') return rgb(0.72, 0.58, 1);
  if (tag === 'Suggestion') return rgb(0.96, 0.66, 1);
  return rgb(0.93, 0.48, 0.79);
}

function annotationColorArray(pdfDoc, tag) {
  const color = annotationColor(tag);
  return pdfDoc.context.obj([color.red, color.green, color.blue]);
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
    annotation.comment || '',
    annotation.text ? `Selected text: ${annotation.text}` : '',
  ].filter(Boolean).join('\n\n');

  const annotationDict = pdfDoc.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Highlight'),
    Rect: coordinates.rect,
    QuadPoints: coordinates.quadPoints,
    Contents: PDFString.of(contents),
    T: PDFString.of('Paper Reviewer'),
    NM: PDFString.of(`PaperReviewer:${annotation.id}:${rectIndex}`),
    C: annotationColorArray(pdfDoc, annotation.tag),
    CA: 0.55,
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
      const page = pages[(rect.pageNumber || annotation.pageNumber || 1) - 1];
      if (page) addHighlightAnnotation(pdfDoc, page, annotation, rect, rectIndex);
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
