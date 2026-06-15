const TAGS = ['Strength', 'Weakness', 'Question', 'Suggestion'];
const SECTIONS = ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'Summary', 'Writing', 'Overall'];
const MARK_TYPES = ['highlight', 'underline'];
const MARK_COLORS = ['pink', 'purple', 'yellow', 'green', 'blue', 'orange', 'red'];
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;
const SCALE_STEP = 0.15;
const MIN_SPLIT = 32;
const MAX_SPLIT = 68;
const MAX_HIGHLIGHT_RECT_HEIGHT = 0.035;
const MAX_HIGHLIGHT_RECT_WIDTH = 0.92;
const MAX_HIGHLIGHT_RECT_AREA = 0.025;
const SPLIT_STORAGE_KEY = 'paper-reviewer:split-percent';
const api = window.paperReviewerAPI || null;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

const openPdfButton = document.getElementById('open-pdf-button');
const openPreviewButton = document.getElementById('open-preview-button');
const companionOpenPreviewButton = document.getElementById('companion-open-preview-button');
const reloadPdfButton = document.getElementById('reload-pdf-button');
const companionReloadPdfButton = document.getElementById('companion-reload-pdf-button');
const previewModeButton = document.getElementById('preview-mode-button');
const togglePaperControlsButton = document.getElementById('toggle-paper-controls-button');
const pdfInput = document.getElementById('pdf-input');
const savePdfButton = document.getElementById('save-pdf-button');
const workspace = document.getElementById('workspace');
const splitResizer = document.getElementById('split-resizer');
const pdfViewer = document.getElementById('pdf-viewer');
const pdfEmptyState = document.getElementById('pdf-empty-state');
const selectionMenu = document.getElementById('selection-menu');
const addNoteButton = document.getElementById('add-note-button');
const markPdfButton = document.getElementById('mark-pdf-button');
const reviewDraftEditor = document.getElementById('review-draft');
const statusMessage = document.getElementById('status-message');
const prevPageButton = document.getElementById('prev-page-button');
const nextPageButton = document.getElementById('next-page-button');
const zoomOutButton = document.getElementById('zoom-out-button');
const zoomInButton = document.getElementById('zoom-in-button');
const pageStatus = document.getElementById('page-status');
const zoomStatus = document.getElementById('zoom-status');
const tagButtons = document.querySelectorAll('.tag-option');
const colorButtons = document.querySelectorAll('.color-option');
const sectionSelect = document.getElementById('section-select');
const markTypeSelect = document.getElementById('mark-type-select');
const annotationEditor = document.getElementById('annotation-editor');
const selectedPreview = document.getElementById('selected-preview');
const editorTag = document.getElementById('editor-tag');
const editorSection = document.getElementById('editor-section');
const editorMarkType = document.getElementById('editor-mark-type');
const editorColor = document.getElementById('editor-color');
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
let reviewDraft = '';
let activeTag = 'Strength';
let activeSection = 'Summary';
let activeMarkType = 'highlight';
let activeColor = 'pink';
let currentPage = 1;
let scale = 1;
let paperControlsCollapsed = false;
let previewCompanionMode = false;
let splitPercent = Number(localStorage.getItem(SPLIT_STORAGE_KEY)) || 50;
let pendingSelection = null;
let clearReviewPending = false;
let clearReviewTimer = null;
let renderSerial = 0;
let syncingScroll = false;
let splitLayoutFrame = null;
let pendingWheelDelta = 0;
let wheelZoomTimer = null;
let reviewDraftSaveTimer = null;
let lastReviewRange = null;
let reloadAfterPreview = false;
let activeAnnotationId = null;

function createEmptyMetadata() {
  return { title: '', authors: '', journal: '', date: '' };
}

function createId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTag(tag) {
  return TAGS.includes(tag) ? tag : 'Strength';
}

function normalizeSection(section) {
  return SECTIONS.includes(section) ? section : 'Summary';
}

function normalizeMarkType(markType) {
  return MARK_TYPES.includes(markType) ? markType : 'highlight';
}

function normalizeColor(color) {
  return MARK_COLORS.includes(color) ? color : 'pink';
}

function markClassForAnnotation(annotation) {
  return `mark-${normalizeMarkType(annotation.markType)} mark-${normalizeColor(annotation.color)}`;
}

function sanitizeHighlightRect(rect) {
  if (!rect || !Number.isFinite(rect.pageNumber)) return null;

  const x = clamp(Number(rect.x), 0, 1);
  const y = clamp(Number(rect.y), 0, 1);
  const width = clamp(Number(rect.width), 0, 1 - x);
  const height = clamp(Number(rect.height), 0, 1 - y);

  if (width <= 0 || height <= 0) return null;
  if (width > MAX_HIGHLIGHT_RECT_WIDTH) return null;
  if (height > MAX_HIGHLIGHT_RECT_HEIGHT) return null;
  if (width * height > MAX_HIGHLIGHT_RECT_AREA) return null;

  return {
    pageNumber: Number(rect.pageNumber),
    x,
    y,
    width,
    height,
  };
}

function sanitizeHighlightRects(rects) {
  if (!Array.isArray(rects)) return [];
  return rects.map(sanitizeHighlightRect).filter(Boolean);
}

function rectContains(outer, inner) {
  const x2 = outer.x + outer.width;
  const y2 = outer.y + outer.height;
  const innerX2 = inner.x + inner.width;
  const innerY2 = inner.y + inner.height;
  return outer.x <= inner.x
    && outer.y <= inner.y
    && x2 >= innerX2
    && y2 >= innerY2
    && outer.width * outer.height > inner.width * inner.height * 1.8;
}

function normalizeSelectionRects(rects) {
  const sanitized = sanitizeHighlightRects(rects);
  const withoutContainers = sanitized.filter((rect, index) => (
    !sanitized.some((other, otherIndex) => otherIndex !== index && rectContains(rect, other))
  ));
  const grouped = new Map();

  withoutContainers.forEach((rect) => {
    const key = `${rect.pageNumber}:${Math.round((rect.y + rect.height / 2) * 1000)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(rect);
  });

  return Array.from(grouped.values()).flatMap((lineRects) => {
    lineRects.sort((a, b) => a.x - b.x);
    return lineRects.reduce((merged, rect) => {
      const last = merged[merged.length - 1];
      if (!last || rect.x > last.x + last.width + 0.006) {
        merged.push({ ...rect });
        return merged;
      }

      const right = Math.max(last.x + last.width, rect.x + rect.width);
      const bottom = Math.max(last.y + last.height, rect.y + rect.height);
      last.x = Math.min(last.x, rect.x);
      last.y = Math.min(last.y, rect.y);
      last.width = right - last.x;
      last.height = bottom - last.y;
      return merged;
    }, []);
  });
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
  syncAnnotationCommentsFromDraft();
  return {
    pdfName,
    pdfFingerprint,
    annotations,
    metadata,
    metadataEdited,
    reviewDraft,
    activeTag,
    activeSection,
    activeMarkType,
    activeColor,
    currentPage,
    scale,
    paperControlsCollapsed,
    previewCompanionMode,
    splitPercent,
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

function setActiveMarkType(markType) {
  activeMarkType = normalizeMarkType(markType);
  markTypeSelect.value = activeMarkType;
  saveState();
}

function setActiveColor(color) {
  activeColor = normalizeColor(color);
  colorButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.color === activeColor);
  });
  saveState();
}

function setPaperControlsCollapsed(collapsed, { persist = true } = {}) {
  paperControlsCollapsed = Boolean(collapsed);
  document.querySelector('.viewer-panel')?.classList.toggle('controls-collapsed', paperControlsCollapsed);
  togglePaperControlsButton.textContent = paperControlsCollapsed ? 'Show controls' : 'Hide controls';
  togglePaperControlsButton.setAttribute('aria-expanded', String(!paperControlsCollapsed));
  if (persist) saveState();
}

function setPreviewCompanionMode(enabled, { persist = true, tile = false } = {}) {
  previewCompanionMode = Boolean(enabled);
  document.body.classList.toggle('preview-companion', previewCompanionMode);
  previewModeButton.textContent = previewCompanionMode ? 'Show Paper Panel' : 'Preview Companion';
  previewModeButton.classList.toggle('primary-button', previewCompanionMode);
  closeMenu();
  closeEditor();
  if (persist) saveState();

  if (previewCompanionMode && tile && api?.tilePreviewCompanion) {
    api.tilePreviewCompanion().then((result) => {
      if (result?.tiled === false) {
        showStatus('Preview mode is on. If Preview did not move left, allow Paper Reviewer in macOS Accessibility settings.');
      }
    }).catch(() => {
      showStatus('Preview mode is on. macOS blocked automatic Preview placement.');
    });
  }
}

function refreshReviewLayoutSoon() {
  if (splitLayoutFrame) cancelAnimationFrame(splitLayoutFrame);
  splitLayoutFrame = requestAnimationFrame(() => {
    splitLayoutFrame = null;
    reviewDraftEditor?.classList.toggle('is-empty', !reviewDraftEditor.textContent.trim());
  });
}

function setSplitPercent(value, { persist = true } = {}) {
  splitPercent = clamp(Number(value) || 50, MIN_SPLIT, MAX_SPLIT);
  workspace?.style.setProperty('--paper-pane-width', `${splitPercent}%`);
  splitResizer?.setAttribute('aria-valuenow', String(Math.round(splitPercent)));

  if (persist) {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent));
    saveState();
  }

  refreshReviewLayoutSoon();
}

async function setScale(nextScale) {
  if (!pdfDocument) return;
  const clampedScale = clamp(Number(nextScale.toFixed(2)), MIN_SCALE, MAX_SCALE);
  if (clampedScale === scale) return;
  scale = clampedScale;
  await renderPdf();
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

function updateReviewDraftState() {
  reviewDraft = reviewDraftEditor.innerHTML;
  reviewDraftEditor.classList.toggle('is-empty', !reviewDraftEditor.textContent.trim());
}

function renderReviewDraft() {
  reviewDraftEditor.innerHTML = reviewDraft || '';
  reviewDraftEditor.classList.toggle('is-empty', !reviewDraftEditor.textContent.trim());
}

function scheduleReviewDraftSave() {
  updateReviewDraftState();
  clearTimeout(reviewDraftSaveTimer);
  reviewDraftSaveTimer = setTimeout(saveState, 250);
}

function saveReviewRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!reviewDraftEditor.contains(range.commonAncestorContainer)) return;
  lastReviewRange = range.cloneRange();
}

function setCursorAfter(node) {
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  saveReviewRange();
}

function insertNodeIntoReviewDraft(node) {
  reviewDraftEditor.focus();
  let range = lastReviewRange;
  if (!range || !reviewDraftEditor.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(reviewDraftEditor);
    range.collapse(false);
  }

  range.deleteContents();
  range.insertNode(node);
  setCursorAfter(node);
}

function createLinkedNoteBlock(annotation) {
  const block = document.createElement('article');
  block.className = `review-linked-note ${markClassForAnnotation(annotation)}`;
  block.dataset.annotationId = annotation.id;
  block.contentEditable = 'true';

  const meta = document.createElement('div');
  meta.className = 'review-linked-note-meta';
  meta.contentEditable = 'false';
  meta.textContent = `${annotation.tag} · ${annotation.section} · ${normalizeMarkType(annotation.markType)} · Page ${annotation.pageNumber || '?'}`;

  const quote = document.createElement('blockquote');
  quote.contentEditable = 'false';
  quote.textContent = annotation.text;

  const comment = document.createElement('p');
  comment.className = 'review-linked-note-comment';
  comment.textContent = annotation.comment || 'No note added.';

  block.append(meta, quote, comment);
  return block;
}

function insertLinkedNote(annotation) {
  const note = createLinkedNoteBlock(annotation);
  const spacer = document.createElement('p');
  spacer.innerHTML = '<br>';
  insertNodeIntoReviewDraft(note);
  insertNodeIntoReviewDraft(spacer);
  setCursorAfter(spacer);
  updateReviewDraftState();
  saveState();
}

function reviewDraftAsText() {
  const clone = reviewDraftEditor.cloneNode(true);
  return Array.from(clone.childNodes)
    .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
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
  )).reduce((allRects, rect) => allRects.concat(rect), []);
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
  editorMarkType.value = activeMarkType;
  editorColor.value = activeColor;
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

function createAnnotationFromSelection({ comment = '', trackInReview = true } = {}) {
  if (!pendingSelection) return;
  return {
    id: createId(),
    pdfFingerprint,
    text: pendingSelection.text,
    comment,
    tag: normalizeTag(trackInReview ? editorTag.value : activeTag),
    section: normalizeSection(trackInReview ? editorSection.value : activeSection),
    markType: normalizeMarkType(trackInReview ? editorMarkType.value : activeMarkType),
    color: normalizeColor(trackInReview ? editorColor.value : activeColor),
    trackInReview,
    pageNumber: pendingSelection.pageNumber,
    rects: normalizeSelectionRects(pendingSelection.rects),
    createdAt: Date.now(),
  };
}

async function persistAnnotation(annotation) {
  if (!annotation) return;
  annotations.unshift(annotation);
  setActiveTag(annotation.tag);
  setActiveSection(annotation.section);
  setActiveMarkType(annotation.markType);
  setActiveColor(annotation.color);
  drawAnnotation(annotation);

  if (annotation.trackInReview !== false) {
    insertLinkedNote(annotation);
    updateAnnotationCommentFromDraft(annotation.id);
  }

  saveState();
  closeEditor();
  closeMenu();

  if (annotation.rects.length === 0) {
    showStatus('Saved the page mark. Select a smaller text range for an exact PDF mark.');
    return;
  }

  await saveAnnotatedPdf({ silent: true });
}

async function addAnnotation() {
  const annotation = createAnnotationFromSelection({
    comment: editorComment.value.trim(),
    trackInReview: true,
  });

  await persistAnnotation(annotation);
}

async function markPdfOnly() {
  pendingSelection = capturePdfSelection();
  if (!pendingSelection) {
    closeMenu();
    showStatus('Select text inside the PDF before marking it.');
    return;
  }

  await persistAnnotation(createAnnotationFromSelection({ trackInReview: false }));
}

function drawAnnotation(annotation) {
  annotation.rects.forEach((rect) => {
    const page = pdfViewer.querySelector(`.pdf-page[data-page-number="${rect.pageNumber}"]`);
    const layer = page?.querySelector('.highlight-layer');
    if (!layer) return;

    const highlight = document.createElement('button');
    highlight.className = `pdf-mark ${markClassForAnnotation(annotation)}`;
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

function markActiveAnnotation(annotationId) {
  activeAnnotationId = annotationId;
  pdfViewer.querySelectorAll('.pdf-mark.is-focused').forEach((item) => item.classList.remove('is-focused'));
  reviewDraftEditor.querySelectorAll('.review-linked-note.is-focused').forEach((item) => item.classList.remove('is-focused'));
  document.querySelectorAll(`[data-annotation-id="${annotationId}"]`).forEach((item) => {
    item.classList.add('is-focused');
  });
}

function focusAnnotation(annotationId) {
  const annotation = annotations.find((item) => item.id === annotationId);
  if (!annotation) return;

  scrollToPage(annotation.pageNumber);
  markActiveAnnotation(annotationId);
}

async function deleteActiveAnnotation() {
  if (!activeAnnotationId) return;
  const annotation = annotations.find((item) => item.id === activeAnnotationId);
  if (!annotation) return;

  annotations = annotations.filter((item) => item.id !== activeAnnotationId);
  document.querySelectorAll(`[data-annotation-id="${activeAnnotationId}"]`).forEach((item) => item.remove());
  activeAnnotationId = null;
  updateReviewDraftState();
  saveState();
  await saveAnnotatedPdf({ silent: true, allowEmpty: true });
  showStatus('Deleted the selected annotation.');
}

function updateAnnotationCommentFromDraft(annotationId) {
  const annotation = annotations.find((item) => item.id === annotationId);
  const note = reviewDraftEditor.querySelector(`.review-linked-note[data-annotation-id="${annotationId}"]`);
  const comment = note?.querySelector('.review-linked-note-comment');
  if (annotation && comment) annotation.comment = comment.textContent.trim();
}

function syncAnnotationCommentsFromDraft() {
  annotations.forEach((annotation) => updateAnnotationCommentFromDraft(annotation.id));
}

function scrollToPage(pageNumber) {
  const pdfPage = pdfViewer.querySelector(`.pdf-page[data-page-number="${pageNumber}"]`);
  currentPage = pageNumber;
  updatePageStatus();
  syncingScroll = true;
  pdfPage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  reviewDraft = '';
  currentPage = 1;
  scale = 1;

  if (restoreState && api && pdfPath) {
    const saved = await api.loadReviewState({ sourcePath: pdfPath });
    if (saved) applySavedState(saved);
  }

  await extractMetadata({ overwriteEdited: false });
  renderReviewDraft();
  await renderPdf();
  saveState();
  clearStatus();
}

function applySavedState(saved) {
  annotations = Array.isArray(saved.annotations)
    ? saved.annotations.map((annotation) => ({
      ...annotation,
      tag: normalizeTag(annotation.tag),
      section: normalizeSection(annotation.section),
      markType: normalizeMarkType(annotation.markType),
      color: normalizeColor(annotation.color),
      trackInReview: annotation.trackInReview !== false,
      rects: sanitizeHighlightRects(annotation.rects),
    }))
    : [];
  metadata = { ...createEmptyMetadata(), ...(saved.metadata || {}) };
  metadataEdited = saved.metadataEdited || {};
  reviewDraft = saved.reviewDraft || '';
  activeTag = normalizeTag(saved.activeTag);
  activeSection = normalizeSection(saved.activeSection);
  activeMarkType = normalizeMarkType(saved.activeMarkType);
  activeColor = normalizeColor(saved.activeColor);
  currentPage = saved.currentPage || 1;
  scale = saved.scale || 1;
  paperControlsCollapsed = Boolean(saved.paperControlsCollapsed);
  previewCompanionMode = Boolean(saved.previewCompanionMode);
  if (Number.isFinite(saved.splitPercent)) setSplitPercent(saved.splitPercent, { persist: false });
  setPaperControlsCollapsed(paperControlsCollapsed, { persist: false });
  setPreviewCompanionMode(previewCompanionMode, { persist: false });
  setActiveTag(activeTag);
  setActiveSection(activeSection);
  setActiveMarkType(activeMarkType);
  setActiveColor(activeColor);
  setMetadata(metadata, { overwriteEdited: true });
  renderReviewDraft();
}

async function renderPdf() {
  const serial = ++renderSerial;
  pdfViewer.innerHTML = '';
  if (!pdfDocument) {
    pdfViewer.appendChild(pdfEmptyState);
    updatePageStatus();
    return;
  }

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (serial !== renderSerial) return;
    await renderPage(pageNumber);
  }

  drawAllAnnotations();
  updatePageStatus();
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
  reviewDraft = '';
  currentPage = 1;
  scale = 1;
  setPreviewCompanionMode(false);
  setPaperControlsCollapsed(false);
  setSplitPercent(50);
  Object.keys(metadataInputs).forEach((key) => { metadataInputs[key].value = ''; });
  renderReviewDraft();
  closeEditor();
  closeMenu();
  closeSummary();
  setActiveTag('Strength');
  setActiveSection('Summary');
  setActiveMarkType('highlight');
  setActiveColor('pink');
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
  syncAnnotationCommentsFromDraft();
  const lines = ['# Review Summary', ''];
  lines.push(`**Title:** ${metadata.title || 'Untitled manuscript'}`);
  lines.push(`**Authors:** ${metadata.authors || 'Not specified'}`);
  lines.push(`**Journal:** ${metadata.journal || 'Not specified'}`);
  lines.push(`**Date:** ${metadata.date || 'Not specified'}`);
  lines.push('');

  const draftText = reviewDraftAsText();
  if (draftText) {
    lines.push('## Review Notes', '');
    lines.push(draftText, '');
  }

  const reviewAnnotations = annotations.filter((annotation) => annotation.trackInReview !== false);

  if (reviewAnnotations.length === 0) {
    if (!draftText) lines.push('No notes yet.');
    return lines.join('\n').trimEnd();
  }

  lines.push('## Linked Annotations', '');
  SECTIONS.forEach((section) => {
    const sectionAnnotations = reviewAnnotations.filter((annotation) => annotation.section === section);
    if (sectionAnnotations.length === 0) return;
    lines.push(`### ${section}`, '');
    sectionAnnotations.slice().reverse().forEach((annotation) => {
      lines.push(`#### ${annotation.tag} - Page ${annotation.pageNumber || '?'}`, '');
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

async function saveAnnotatedPdf({ silent = false, allowEmpty = false } = {}) {
  if (!api) {
    if (!silent) showStatus('Run the desktop app to save PDF annotations into the original file.');
    return;
  }
  if (!pdfPath) {
    if (!silent) showStatus('Open a PDF before saving annotations.');
    return;
  }
  if (!allowEmpty && annotations.length === 0) {
    if (!silent) showStatus('No Paper Reviewer annotations to save.');
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

async function reloadCurrentPdf() {
  if (!api || !pdfPath) return;
  try {
    const bytes = await api.readPdf({ sourcePath: pdfPath });
    if (!bytes) return;
    await loadPdfBytes(new Uint8Array(bytes), pdfName, pdfPath);
    showStatus('Reloaded the PDF from disk.');
  } catch {
    showStatus('Could not reload the PDF from disk.');
  }
}

async function openInPreview() {
  if (!api) {
    showStatus('Run the desktop app to open this PDF in Preview.');
    return;
  }
  if (!pdfPath) {
    showStatus('Open a PDF first, then send it to Preview.');
    return;
  }

  try {
    saveState();
    const result = await api.openInPreview({ sourcePath: pdfPath });
    setPreviewCompanionMode(true);
    reloadAfterPreview = true;
    if (result?.tiled === false) {
      showStatus('Opened in Preview. If it did not move left, allow Paper Reviewer in macOS Accessibility settings.');
    } else {
      showStatus('Opened Preview on the left and kept review notes on the right.');
    }
  } catch {
    showStatus('Could not open this PDF in Preview.');
  }
}

openPdfButton.addEventListener('click', openPdf);
openPreviewButton.addEventListener('click', openInPreview);
companionOpenPreviewButton.addEventListener('click', openInPreview);
reloadPdfButton.addEventListener('click', reloadCurrentPdf);
companionReloadPdfButton.addEventListener('click', reloadCurrentPdf);
previewModeButton.addEventListener('click', () => setPreviewCompanionMode(!previewCompanionMode, { tile: true }));
togglePaperControlsButton.addEventListener('click', () => setPaperControlsCollapsed(!paperControlsCollapsed));
pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  await loadPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name, '');
  pdfInput.value = '';
});

pdfViewer.addEventListener('mouseup', () => {
  if (previewCompanionMode) return;
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
  saveState();
});

pdfViewer.addEventListener('wheel', (event) => {
  if (!event.ctrlKey || !pdfDocument) return;
  event.preventDefault();
  pendingWheelDelta += event.deltaY;
  clearTimeout(wheelZoomTimer);
  wheelZoomTimer = setTimeout(() => {
    const direction = pendingWheelDelta > 0 ? -1 : 1;
    pendingWheelDelta = 0;
    setScale(scale + direction * SCALE_STEP);
  }, 35);
}, { passive: false });

document.addEventListener('click', (event) => {
  const insideSelectionUi = selectionMenu.contains(event.target) || annotationEditor.contains(event.target);
  if (!insideSelectionUi && !pdfViewer.contains(event.target)) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (!['Delete', 'Backspace'].includes(event.key)) return;
  if (!activeAnnotationId) return;

  const target = event.target;
  const typingInEditableField = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target?.closest?.('.review-linked-note-comment')
    || (target?.isContentEditable && !target.closest('.review-linked-note'));
  if (typingInEditableField) return;

  event.preventDefault();
  deleteActiveAnnotation();
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
markPdfButton.addEventListener('click', markPdfOnly);

tagButtons.forEach((button) => button.addEventListener('click', () => setActiveTag(button.dataset.tag)));
colorButtons.forEach((button) => button.addEventListener('click', () => setActiveColor(button.dataset.color)));
Object.entries(metadataInputs).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    metadata[key] = input.value;
    metadataEdited[key] = true;
    saveState();
  });
});
sectionSelect.addEventListener('change', () => setActiveSection(sectionSelect.value));
markTypeSelect.addEventListener('change', () => setActiveMarkType(markTypeSelect.value));
reviewDraftEditor.addEventListener('input', scheduleReviewDraftSave);
reviewDraftEditor.addEventListener('keyup', saveReviewRange);
reviewDraftEditor.addEventListener('mouseup', saveReviewRange);
reviewDraftEditor.addEventListener('focus', saveReviewRange);
reviewDraftEditor.addEventListener('click', (event) => {
  const linkedNote = event.target.closest('.review-linked-note');
  if (linkedNote?.dataset.annotationId) focusAnnotation(linkedNote.dataset.annotationId);
});
reviewDraftEditor.addEventListener('paste', (event) => {
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';
  document.execCommand('insertText', false, text);
});
prevPageButton.addEventListener('click', () => pdfDocument && scrollToPage(Math.max(1, currentPage - 1)));
nextPageButton.addEventListener('click', () => pdfDocument && scrollToPage(Math.min(pdfDocument.numPages, currentPage + 1)));
zoomOutButton.addEventListener('click', () => setScale(scale - SCALE_STEP));
zoomInButton.addEventListener('click', () => setScale(scale + SCALE_STEP));
splitResizer?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  splitResizer.classList.add('is-dragging');
  splitResizer.setPointerCapture?.(event.pointerId);
  document.body.style.cursor = 'col-resize';

  const updateFromPointer = (moveEvent) => {
    const rect = workspace.getBoundingClientRect();
    const nextPercent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
    setSplitPercent(nextPercent);
  };
  const stopDragging = () => {
    splitResizer.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', updateFromPointer);
    document.removeEventListener('pointerup', stopDragging);
  };

  updateFromPointer(event);
  document.addEventListener('pointermove', updateFromPointer);
  document.addEventListener('pointerup', stopDragging);
});
splitResizer?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    setSplitPercent(splitPercent - 2);
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    setSplitPercent(splitPercent + 2);
  }
  if (event.key === 'Home') {
    event.preventDefault();
    setSplitPercent(MIN_SPLIT);
  }
  if (event.key === 'End') {
    event.preventDefault();
    setSplitPercent(MAX_SPLIT);
  }
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
window.addEventListener('focus', () => {
  if (!reloadAfterPreview) return;
  reloadAfterPreview = false;
  setTimeout(reloadCurrentPdf, 500);
});

setSplitPercent(splitPercent, { persist: false });
setPaperControlsCollapsed(paperControlsCollapsed, { persist: false });
setPreviewCompanionMode(previewCompanionMode, { persist: false });
setActiveTag(activeTag);
setActiveSection(activeSection);
setActiveMarkType(activeMarkType);
setActiveColor(activeColor);
setMetadata(metadata, { overwriteEdited: true });
updatePageStatus();
renderReviewDraft();
