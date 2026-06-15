const TAGS = ['Strength', 'Weakness', 'Question', 'Suggestion'];
const SECTIONS = ['Summary', 'Methods', 'Results', 'Writing', 'Overall'];
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;
const SCALE_STEP = 0.15;
const api = window.paperReviewerAPI || null;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

const openPdfButton = document.getElementById('open-pdf-button');
const pdfInput = document.getElementById('pdf-input');
const savePdfButton = document.getElementById('save-pdf-button');
const pdfViewer = document.getElementById('pdf-viewer');
const pdfEmptyState = document.getElementById('pdf-empty-state');
const selectionMenu = document.getElementById('selection-menu');
const addNoteButton = document.getElementById('add-note-button');
const commentList = document.getElementById('comment-list');
const statusMessage = document.getElementById('status-message');
const prevPageButton = document.getElementById('prev-page-button');
const nextPageButton = document.getElementById('next-page-button');
const zoomOutButton = document.getElementById('zoom-out-button');
const zoomInButton = document.getElementById('zoom-in-button');
const pageStatus = document.getElementById('page-status');
const zoomStatus = document.getElementById('zoom-status');
const tagButtons = document.querySelectorAll('.tag-option');
const sectionSelect = document.getElementById('section-select');
const tagFilter = document.getElementById('tag-filter');
const sectionFilter = document.getElementById('section-filter');
const annotationEditor = document.getElementById('annotation-editor');
const selectedPreview = document.getElementById('selected-preview');
const editorTag = document.getElementById('editor-tag');
const editorSection = document.getElementById('editor-section');
const editorComment = document.getElementById('editor-comment');
const saveAnnotationButton = document.getElementById('save-annotation-button');
const cancelAnnotationButton = document.getElementById('cancel-annotation-button');
const closeEditorButton = document.getElementById('close-editor-button');
const summaryButton = document.getElementById('summary-button');
const saveSummaryButton = document.getElementById('save-summary-button');
const clearReviewButton = document.getElementById('clear-review-button');
const summaryDialog = document.getElementById('summary-dialog');
const summaryOutput = document.getElementById('summary-output');
const copySummaryButton = document.getElementById('copy-summary-button');
const closeSummaryButton = document.getElementById('close-summary-button');
const dismissSummaryButton = document.getElementById('dismiss-summary-button');
const copyStatus = document.getElementById('copy-status');

const metadataInputs = {
  title: document.getElementById('metadata-title'),
  authors: document.getElementById('metadata-authors'),
  journal: document.getElementById('metadata-journal'),
  date: document.getElementById('metadata-date'),
};

let pdfDocument = null;
let pdfBytes = null;
let pdfName = '';
let pdfPath = '';
let pdfFingerprint = '';
let annotations = [];
let metadata = createEmptyMetadata();
let metadataEdited = {};
let activeTag = 'Strength';
let activeSection = 'Summary';
let currentPage = 1;
let scale = 1;
let pendingSelection = null;
let clearReviewPending = false;
let clearReviewTimer = null;
let renderSerial = 0;
let syncingScroll = false;

function createEmptyMetadata() {
  return { title: '', authors: '', journal: '', date: '' };
}

function createId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTag(tag) {
  return TAGS.includes(tag) ? tag : 'Strength';
}

function normalizeSection(section) {
  return SECTIONS.includes(section) ? section : 'Summary';
}

function highlightClassForTag(tag) {
  return `highlight-${normalizeTag(tag).toLowerCase()}`;
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden');
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.classList.add('hidden');
}

function reviewState() {
  return {
    pdfName,
    pdfFingerprint,
    annotations,
    metadata,
    metadataEdited,
    activeTag,
    activeSection,
    currentPage,
    scale,
  };
}

function saveState() {
  if (!api || !pdfPath) return;
  api.saveReviewState({ sourcePath: pdfPath, state: reviewState() }).catch(() => {
    showStatus('Could not save this review state.');
  });
}

function setActiveTag(tag) {
  activeTag = normalizeTag(tag);
  tagButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tag === activeTag);
  });
  saveState();
}

function setActiveSection(section) {
  activeSection = normalizeSection(section);
  sectionSelect.value = activeSection;
  saveState();
}

function setMetadata(nextMetadata, { markEdited = false, overwriteEdited = false } = {}) {
  Object.keys(metadata).forEach((key) => {
    const value = nextMetadata[key] || '';
    if (overwriteEdited || !metadataEdited[key]) {
      metadata[key] = value;
      metadataInputs[key].value = value;
    }
    if (markEdited) metadataEdited[key] = true;
  });
  saveState();
}

function updatePageStatus() {
  if (!pdfDocument) {
    pageStatus.textContent = 'No PDF loaded';
    zoomStatus.textContent = `${Math.round(scale * 100)}%`;
    return;
  }

  pageStatus.textContent = `Page ${currentPage} of ${pdfDocument.numPages}`;
  zoomStatus.textContent = `${Math.round(scale * 100)}%`;
}

function getFilteredAnnotations() {
  return annotations.filter((annotation) => {
    const tagMatches = tagFilter.value === 'all' || annotation.tag === tagFilter.value;
    const sectionMatches = sectionFilter.value === 'all' || annotation.section === sectionFilter.value;
    return tagMatches && sectionMatches;
  });
}

function annotationsForPage(pageNumber) {
  return getFilteredAnnotations()
    .filter((annotation) => annotation.pageNumber === pageNumber)
    .sort((a, b) => a.createdAt - b.createdAt);
}

function emptyReviewMessage() {
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = pdfDocument
    ? 'No notes on this page yet.'
    : 'No PDF notes yet. Open a PDF and select text to start.';
  return empty;
}

function renderReviewSheets(pageHeights = []) {
  commentList.innerHTML = '';

  if (!pdfDocument) {
    commentList.appendChild(emptyReviewMessage());
    return;
  }

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const sheet = document.createElement('section');
    sheet.className = 'review-sheet';
    sheet.dataset.pageNumber = pageNumber;
    sheet.style.height = `${pageHeights[pageNumber] || 720}px`;

    const header = document.createElement('div');
    header.className = 'review-sheet-header';
    header.innerHTML = `<h3>Page ${pageNumber}</h3><span>${annotationsForPage(pageNumber).length} notes</span>`;
    sheet.appendChild(header);

    const pageAnnotations = annotationsForPage(pageNumber);
    if (pageAnnotations.length === 0) {
      sheet.appendChild(emptyReviewMessage());
    } else {
      pageAnnotations.forEach((annotation) => sheet.appendChild(createNoteCard(annotation)));
    }

    commentList.appendChild(sheet);
  }
}

function createNoteCard(annotation) {
  const card = document.createElement('article');
  card.className = 'comment-card';
  card.dataset.annotationId = annotation.id;
  card.innerHTML = `
    <div class="comment-meta">
      <span class="comment-tag">${annotation.tag}</span>
      <span class="comment-section">${annotation.section}</span>
      <span class="comment-page">Page ${annotation.pageNumber || '?'}</span>
      <span class="comment-time">${new Date(annotation.createdAt).toLocaleString()}</span>
    </div>
    <blockquote class="comment-highlight"></blockquote>
    <p class="comment-text"></p>
  `;
  card.querySelector('.comment-highlight').textContent = annotation.text;
  card.querySelector('.comment-text').textContent = annotation.comment || 'No note added.';
  card.addEventListener('click', () => focusAnnotation(annotation.id));
  return card;
}

function openMenu(x, y) {
  selectionMenu.style.left = `${x}px`;
  selectionMenu.style.top = `${Math.max(y - 48, 8)}px`;
  selectionMenu.classList.remove('hidden');
}

function closeMenu() {
  selectionMenu.classList.add('hidden');
}

function clearSelection() {
  window.getSelection()?.removeAllRanges();
}

function pageContainerForNode(node) {
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return element?.closest?.('.pdf-page') || null;
}

function getSelectionRects(selection) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const pageMap = new Map();

  Array.from(range.getClientRects()).forEach((rect) => {
    if (rect.width < 2 || rect.height < 2) return;
    const midpoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const page = pageContainerForNode(midpoint) || pageContainerForNode(range.commonAncestorContainer);
    if (!page) return;
    const pageRect = page.getBoundingClientRect();
    const pageNumber = Number(page.dataset.pageNumber);
    if (!pageNumber) return;

    if (!pageMap.has(pageNumber)) pageMap.set(pageNumber, []);
    pageMap.get(pageNumber).push({
      x: (rect.left - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    });
  });

  return Array.from(pageMap.entries()).flatMap(([pageNumber, rects]) => (
    rects.map((rect) => ({ pageNumber, ...rect }))
  ));
}

function capturePdfSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || '';
  if (!text || !selection.rangeCount) return null;

  const anchorPage = pageContainerForNode(selection.anchorNode);
  const focusPage = pageContainerForNode(selection.focusNode);
  if (!anchorPage && !focusPage) return null;

  const rects = getSelectionRects(selection);
  const firstPage = rects[0]?.pageNumber || Number(anchorPage?.dataset.pageNumber || focusPage?.dataset.pageNumber || currentPage);
  return { text, pageNumber: firstPage, rects };
}

function openEditor() {
  if (!pendingSelection) return;
  selectedPreview.textContent = pendingSelection.text;
  editorTag.value = activeTag;
  editorSection.value = activeSection;
  editorComment.value = '';
  annotationEditor.classList.remove('hidden');
  editorComment.focus();
}

function closeEditor({ clear = true } = {}) {
  annotationEditor.classList.add('hidden');
  if (clear) {
    pendingSelection = null;
    clearSelection();
  }
}

async function addAnnotation() {
  if (!pendingSelection) return;
  const tag = normalizeTag(editorTag.value);
  const section = normalizeSection(editorSection.value);
  const annotation = {
    id: createId(),
    pdfFingerprint,
    text: pendingSelection.text,
    comment: editorComment.value.trim(),
    tag,
    section,
    pageNumber: pendingSelection.pageNumber,
    rects: pendingSelection.rects,
    createdAt: Date.now(),
    highlightClass: highlightClassForTag(tag),
  };

  annotations.unshift(annotation);
  setActiveTag(tag);
  setActiveSection(section);
  drawAnnotation(annotation);
  syncReviewSheetHeights();
  renderReviewSheets(collectPageHeights());
  saveState();
  closeEditor();
  closeMenu();

  if (annotation.rects.length === 0) {
    showStatus('Saved the note and page link. Select a smaller text range for an exact PDF highlight.');
    return;
  }

  await saveAnnotatedPdf({ silent: true });
}

function drawAnnotation(annotation) {
  annotation.rects.forEach((rect) => {
    const page = pdfViewer.querySelector(`.pdf-page[data-page-number="${rect.pageNumber}"]`);
    const layer = page?.querySelector('.highlight-layer');
    if (!layer) return;

    const highlight = document.createElement('button');
    highlight.className = `pdf-highlight ${annotation.highlightClass}`;
    highlight.type = 'button';
    highlight.dataset.annotationId = annotation.id;
    highlight.style.left = `${rect.x * 100}%`;
    highlight.style.top = `${rect.y * 100}%`;
    highlight.style.width = `${rect.width * 100}%`;
    highlight.style.height = `${rect.height * 100}%`;
    highlight.setAttribute('aria-label', `Annotation: ${annotation.tag}`);
    highlight.addEventListener('click', () => focusAnnotation(annotation.id));
    layer.appendChild(highlight);
  });
}

function drawAllAnnotations() {
  pdfViewer.querySelectorAll('.highlight-layer').forEach((layer) => {
    layer.innerHTML = '';
  });
  annotations.forEach(drawAnnotation);
}

function collectPageHeights() {
  const heights = [];
  pdfViewer.querySelectorAll('.pdf-page').forEach((page) => {
    heights[Number(page.dataset.pageNumber)] = page.offsetHeight;
  });
  return heights;
}

function syncReviewSheetHeights() {
  collectPageHeights().forEach((height, pageNumber) => {
    const sheet = commentList.querySelector(`.review-sheet[data-page-number="${pageNumber}"]`);
    if (sheet) sheet.style.height = `${height}px`;
  });
}

function focusAnnotation(annotationId) {
  const annotation = annotations.find((item) => item.id === annotationId);
  if (!annotation) return;

  scrollToPage(annotation.pageNumber);
  pdfViewer.querySelectorAll('.pdf-highlight.is-focused').forEach((item) => item.classList.remove('is-focused'));
  commentList.querySelectorAll('.comment-card.is-focused').forEach((item) => item.classList.remove('is-focused'));
  document.querySelectorAll(`[data-annotation-id="${annotationId}"]`).forEach((item) => {
    item.classList.add('is-focused');
    setTimeout(() => item.classList.remove('is-focused'), 2200);
  });
}

function scrollToPage(pageNumber) {
  const pdfPage = pdfViewer.querySelector(`.pdf-page[data-page-number="${pageNumber}"]`);
  const sheet = commentList.querySelector(`.review-sheet[data-page-number="${pageNumber}"]`);
  currentPage = pageNumber;
  updatePageStatus();
  syncingScroll = true;
  pdfPage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  sheet?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { syncingScroll = false; }, 600);
  saveState();
}

async function loadPdfBytes(bytes, name, sourcePath = '', { restoreState = true } = {}) {
  pdfBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  pdfName = name || 'Manuscript.pdf';
  pdfPath = sourcePath;
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  pdfDocument = await loadingTask.promise;
  pdfFingerprint = pdfDocument.fingerprints?.[0] || `${pdfName}-${pdfBytes.byteLength}`;

  annotations = [];
  metadata = createEmptyMetadata();
  metadataEdited = {};
  currentPage = 1;
  scale = 1;

  if (restoreState && api && pdfPath) {
    const saved = await api.loadReviewState({ sourcePath: pdfPath });
    if (saved) applySavedState(saved);
  }

  await extractMetadata({ overwriteEdited: false });
  await renderPdf();
  renderReviewSheets(collectPageHeights());
  saveState();
  clearStatus();
}

function applySavedState(saved) {
  annotations = Array.isArray(saved.annotations) ? saved.annotations : [];
  metadata = { ...createEmptyMetadata(), ...(saved.metadata || {}) };
  metadataEdited = saved.metadataEdited || {};
  activeTag = normalizeTag(saved.activeTag);
  activeSection = normalizeSection(saved.activeSection);
  currentPage = saved.currentPage || 1;
  scale = saved.scale || 1;
  setActiveTag(activeTag);
  setActiveSection(activeSection);
  setMetadata(metadata, { overwriteEdited: true });
}

async function renderPdf() {
  const serial = ++renderSerial;
  pdfViewer.innerHTML = '';
  if (!pdfDocument) {
    pdfViewer.appendChild(pdfEmptyState);
    updatePageStatus();
    renderReviewSheets();
    return;
  }

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (serial !== renderSerial) return;
    await renderPage(pageNumber);
  }

  drawAllAnnotations();
  updatePageStatus();
  renderReviewSheets(collectPageHeights());
  scrollToPage(Math.min(currentPage, pdfDocument.numPages));
}

async function renderPage(pageNumber) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const pageElement = document.createElement('section');
  pageElement.className = 'pdf-page';
  pageElement.dataset.pageNumber = pageNumber;
  pageElement.style.width = `${viewport.width}px`;
  pageElement.style.height = `${viewport.height}px`;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  pageElement.appendChild(canvas);

  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  pageElement.appendChild(textLayer);

  const highlightLayer = document.createElement('div');
  highlightLayer.className = 'highlight-layer';
  pageElement.appendChild(highlightLayer);
  pdfViewer.appendChild(pageElement);

  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
  await page.render({ canvasContext: context, viewport, transform }).promise;
  const textContent = await page.getTextContent();
  if (textContent.items.length === 0 && pageNumber === 1) {
    showStatus('This PDF page has no selectable text. Scanned manuscripts may need OCR before linked notes can work.');
  }
  await pdfjsLib.renderTextLayer({
    textContentSource: textContent,
    container: textLayer,
    viewport,
    textDivs: [],
    enhanceTextSelection: true,
  }).promise;
}

function compactLines(text) {
  return text.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function parsePdfDate(value) {
  if (!value) return '';
  const match = String(value).match(/D:(\d{4})(\d{2})?(\d{2})?/);
  return match ? [match[1], match[2], match[3]].filter(Boolean).join('-') : String(value);
}

function inferMetadataFromLines(lines) {
  const firstLines = lines.slice(0, 18);
  const datePattern = /\b(19|20)\d{2}\b|received|accepted|published/i;
  const journalPattern = /journal|proceedings|transactions|nature|science|cell|lancet|jmir|plos|frontiers|arxiv|medrxiv|biorxiv/i;
  const title = firstLines.find((line) => line.length > 20 && !journalPattern.test(line) && !datePattern.test(line)) || '';
  const titleIndex = firstLines.indexOf(title);
  return {
    title,
    authors: firstLines.slice(Math.max(titleIndex + 1, 1), Math.max(titleIndex + 5, 5))
      .find((line) => /,| and |;|\d/.test(line) && !journalPattern.test(line) && !datePattern.test(line)) || '',
    journal: firstLines.find((line) => journalPattern.test(line)) || '',
    date: firstLines.find((line) => datePattern.test(line)) || '',
  };
}

async function extractMetadata({ overwriteEdited = false } = {}) {
  if (!pdfDocument) return;
  let info = {};
  try {
    info = (await pdfDocument.getMetadata()).info || {};
  } catch {
    info = {};
  }

  let firstPageLines = [];
  try {
    const firstPage = await pdfDocument.getPage(1);
    const textContent = await firstPage.getTextContent();
    firstPageLines = compactLines(textContent.items.map((item) => item.str).join('\n'));
  } catch {
    firstPageLines = [];
  }

  const inferred = inferMetadataFromLines(firstPageLines);
  setMetadata({
    title: info.Title || inferred.title || '',
    authors: info.Author || inferred.authors || '',
    journal: info.Subject || info.Producer || inferred.journal || '',
    date: parsePdfDate(info.CreationDate || info.ModDate) || inferred.date || '',
  }, { overwriteEdited });
}

function resetClearReviewButton() {
  clearReviewPending = false;
  clearReviewButton.textContent = 'Clear review';
  clearReviewButton.classList.remove('pending');
}

async function clearReview() {
  if (api && pdfPath) await api.clearReviewState({ sourcePath: pdfPath });
  pdfDocument = null;
  pdfBytes = null;
  pdfName = '';
  pdfPath = '';
  pdfFingerprint = '';
  annotations = [];
  metadata = createEmptyMetadata();
  metadataEdited = {};
  currentPage = 1;
  scale = 1;
  tagFilter.value = 'all';
  sectionFilter.value = 'all';
  Object.keys(metadataInputs).forEach((key) => { metadataInputs[key].value = ''; });
  closeEditor();
  closeMenu();
  closeSummary();
  setActiveTag('Strength');
  setActiveSection('Summary');
  await renderPdf();
  showStatus('Cleared this review.');
}

function requestClearReview() {
  if (clearReviewPending) {
    clearTimeout(clearReviewTimer);
    resetClearReviewButton();
    clearReview();
    return;
  }
  clearReviewPending = true;
  clearReviewButton.textContent = 'Confirm clear';
  clearReviewButton.classList.add('pending');
  clearReviewTimer = setTimeout(resetClearReviewButton, 4000);
}

function generateMarkdownSummary() {
  const lines = ['# Review Summary', ''];
  lines.push(`**Title:** ${metadata.title || 'Untitled manuscript'}`);
  lines.push(`**Authors:** ${metadata.authors || 'Not specified'}`);
  lines.push(`**Journal:** ${metadata.journal || 'Not specified'}`);
  lines.push(`**Date:** ${metadata.date || 'Not specified'}`);
  lines.push('');

  if (annotations.length === 0) {
    lines.push('No annotations yet.');
    return lines.join('\n');
  }

  SECTIONS.forEach((section) => {
    const sectionAnnotations = annotations.filter((annotation) => annotation.section === section);
    if (sectionAnnotations.length === 0) return;
    lines.push(`## ${section}`, '');
    sectionAnnotations.slice().reverse().forEach((annotation) => {
      lines.push(`### ${annotation.tag} - Page ${annotation.pageNumber || '?'}`, '');
      lines.push(`> ${annotation.text.replace(/\s+/g, ' ')}`, '');
      lines.push(annotation.comment || 'No note added.', '');
    });
  });
  return lines.join('\n').trimEnd();
}

function openSummary() {
  summaryOutput.value = generateMarkdownSummary();
  copyStatus.textContent = '';
  summaryDialog.classList.remove('hidden');
  summaryOutput.focus();
  summaryOutput.select();
}

function closeSummary() {
  summaryDialog.classList.add('hidden');
}

async function saveSummaryToPath() {
  const markdown = generateMarkdownSummary();
  if (!api) {
    copyStatus.textContent = 'Run the desktop app to save beside the PDF. Markdown is ready to copy.';
    return;
  }
  const result = await api.saveSummary({ sourcePath: pdfPath, markdown });
  copyStatus.textContent = result?.path ? `Saved to ${result.path}` : 'Summary save cancelled.';
}

async function saveAnnotatedPdf({ silent = false } = {}) {
  if (!api) {
    if (!silent) showStatus('Run the desktop app to save PDF annotations into the original file.');
    return;
  }
  if (!pdfPath || annotations.length === 0) {
    if (!silent) showStatus('Open a PDF and add at least one note before saving annotations.');
    return;
  }
  try {
    const result = await api.saveAnnotatedPdf({ sourcePath: pdfPath, annotations });
    if (result?.path) {
      showStatus(silent ? 'Saved annotation into the original PDF.' : `Saved changes into ${result.path}`);
    }
  } catch {
    showStatus('Could not write changes into the original PDF. Check that the file is writable and not open as read-only.');
  }
}

function copySummary() {
  summaryOutput.select();
  const text = summaryOutput.value;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copyStatus.textContent = 'Markdown copied to clipboard.';
    }).catch(() => {
      document.execCommand('copy');
      copyStatus.textContent = 'Markdown selected and copied.';
    });
    return;
  }
  document.execCommand('copy');
  copyStatus.textContent = 'Markdown selected and copied.';
}

async function openPdf() {
  if (api) {
    const result = await api.openPdf();
    if (!result) return;
    await loadPdfBytes(new Uint8Array(result.bytes), result.name, result.path);
    showStatus(`Opened ${result.name}.`);
    return;
  }
  pdfInput.click();
}

openPdfButton.addEventListener('click', openPdf);
pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  await loadPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name, '');
  pdfInput.value = '';
});

pdfViewer.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  const captured = capturePdfSelection();
  if (!captured) {
    closeMenu();
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  openMenu(rect.left + window.scrollX, rect.top + window.scrollY);
});

pdfViewer.addEventListener('scroll', () => {
  const pages = Array.from(pdfViewer.querySelectorAll('.pdf-page'));
  const viewerRect = pdfViewer.getBoundingClientRect();
  const visible = pages.find((page) => page.getBoundingClientRect().bottom > viewerRect.top + 80);
  if (!visible) return;
  currentPage = Number(visible.dataset.pageNumber);
  updatePageStatus();
  if (!syncingScroll) {
    const sheet = commentList.querySelector(`.review-sheet[data-page-number="${currentPage}"]`);
    sheet?.scrollIntoView({ block: 'nearest' });
  }
  saveState();
});

document.addEventListener('click', (event) => {
  const insideSelectionUi = selectionMenu.contains(event.target) || annotationEditor.contains(event.target);
  if (!insideSelectionUi && !pdfViewer.contains(event.target)) closeMenu();
});

addNoteButton.addEventListener('click', () => {
  pendingSelection = capturePdfSelection();
  if (!pendingSelection) {
    closeMenu();
    showStatus('Select text inside the PDF before adding a note.');
    return;
  }
  openEditor();
});

tagButtons.forEach((button) => button.addEventListener('click', () => setActiveTag(button.dataset.tag)));
Object.entries(metadataInputs).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    metadata[key] = input.value;
    metadataEdited[key] = true;
    saveState();
  });
});
sectionSelect.addEventListener('change', () => setActiveSection(sectionSelect.value));
tagFilter.addEventListener('change', () => renderReviewSheets(collectPageHeights()));
sectionFilter.addEventListener('change', () => renderReviewSheets(collectPageHeights()));
prevPageButton.addEventListener('click', () => pdfDocument && scrollToPage(Math.max(1, currentPage - 1)));
nextPageButton.addEventListener('click', () => pdfDocument && scrollToPage(Math.min(pdfDocument.numPages, currentPage + 1)));
zoomOutButton.addEventListener('click', async () => {
  if (!pdfDocument) return;
  scale = Math.max(MIN_SCALE, Number((scale - SCALE_STEP).toFixed(2)));
  await renderPdf();
  saveState();
});
zoomInButton.addEventListener('click', async () => {
  if (!pdfDocument) return;
  scale = Math.min(MAX_SCALE, Number((scale + SCALE_STEP).toFixed(2)));
  await renderPdf();
  saveState();
});
saveAnnotationButton.addEventListener('click', addAnnotation);
cancelAnnotationButton.addEventListener('click', () => {
  closeEditor();
  closeMenu();
});
closeEditorButton.addEventListener('click', () => {
  closeEditor();
  closeMenu();
});
summaryButton.addEventListener('click', openSummary);
saveSummaryButton.addEventListener('click', saveSummaryToPath);
savePdfButton.addEventListener('click', saveAnnotatedPdf);
clearReviewButton.addEventListener('click', requestClearReview);
copySummaryButton.addEventListener('click', copySummary);
closeSummaryButton.addEventListener('click', closeSummary);
dismissSummaryButton.addEventListener('click', closeSummary);
summaryDialog.addEventListener('click', (event) => {
  if (event.target === summaryDialog) closeSummary();
});

setActiveTag(activeTag);
setActiveSection(activeSection);
setMetadata(metadata, { overwriteEdited: true });
updatePageStatus();
renderReviewSheets();
