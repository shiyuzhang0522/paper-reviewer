const TAGS = ['Strength', 'Weakness', 'Question', 'Suggestion'];
const SECTIONS = ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'Summary', 'Writing', 'Overall'];
const MARK_TYPES = ['highlight', 'underline'];
const MARK_COLORS = ['pink', 'purple', 'yellow', 'green', 'blue', 'orange', 'red'];
const TEXT_COLOR_PRESETS = ['#291b34', '#7b6688', '#d94b55', '#4f8fdc', '#4f9f63', '#8d52d9'];
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;
const SCALE_STEP = 0.15;
const MIN_SPLIT = 32;
const MAX_SPLIT = 68;
const MAX_HIGHLIGHT_RECT_HEIGHT = 0.035;
const MAX_HIGHLIGHT_RECT_WIDTH = 0.92;
const MAX_HIGHLIGHT_RECT_AREA = 0.025;
const SPLIT_STORAGE_KEY = 'paper-reviewer:split-percent';
const MAX_NOTE_IMAGE_DIMENSION = 1600;
const NOTE_IMAGE_JPEG_QUALITY = 0.86;
const SUMMARY_ASSET_DIR_PLACEHOLDER = 'review-summary-assets';
const SUMMARY_FORMAT_MARKER = '<!-- paper-reviewer-summary:v2 -->';
const UNANSWERED_ASSESSMENT = '_Not answered._';
const ALLOWED_REVIEW_TAGS = new Set([
  'A', 'ARTICLE', 'B', 'BLOCKQUOTE', 'BR', 'DIV', 'EM', 'FIGCAPTION', 'FIGURE', 'H2', 'I', 'IMG',
  'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'U', 'UL',
]);
const ALLOWED_REVIEW_CLASSES = new Set([
  'review-linked-note', 'review-linked-note-meta', 'review-linked-note-comment',
  'review-image-figure', 'review-page-break', 'text-size-small', 'text-size-normal', 'text-size-large', 'text-size-x-large',
  'mark-highlight', 'mark-underline', 'mark-pink', 'mark-purple', 'mark-yellow', 'mark-green',
  'mark-blue', 'mark-orange', 'mark-red', 'is-focused',
]);
const api = window.paperReviewerAPI || null;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';

const openPdfButton = document.getElementById('open-pdf-button');
const openPreviewButton = document.getElementById('open-preview-button');
const companionOpenPreviewButton = document.getElementById('companion-open-preview-button');
const reloadPdfButton = document.getElementById('reload-pdf-button');
const companionReloadPdfButton = document.getElementById('companion-reload-pdf-button');
const hidePreviewPanelButton = document.getElementById('hide-preview-panel-button');
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
const reviewPageShell = document.querySelector('.review-page-shell');
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
const openSummaryButton = document.getElementById('open-summary-button');
const saveSummaryButton = document.getElementById('save-summary-button');
const clearReviewButton = document.getElementById('clear-review-button');
const summaryDialog = document.getElementById('summary-dialog');
const summaryOutput = document.getElementById('summary-output');
const copySummaryButton = document.getElementById('copy-summary-button');
const closeSummaryButton = document.getElementById('close-summary-button');
const dismissSummaryButton = document.getElementById('dismiss-summary-button');
const copyStatus = document.getElementById('copy-status');
const formatButtons = document.querySelectorAll('.format-button');
const metadataPanel = document.querySelector('.metadata-panel');
const toggleMetadataPanelButton = document.getElementById('toggle-metadata-panel-button');
const addReviewPageButton = document.getElementById('add-review-page-button');
const notesBlockStyle = document.getElementById('notes-block-style');
const notesTextSize = document.getElementById('notes-text-size');
const notesTextColor = document.getElementById('notes-text-color');
const notesHighlightColor = document.getElementById('notes-highlight-color');
const textColorPresetButtons = document.querySelectorAll('.text-color-option');
const insertNoteImageButton = document.getElementById('insert-note-image-button');
const assessmentInputs = {
  journalFit: document.getElementById('assessment-journal-fit'),
  majorClaims: document.getElementById('assessment-major-claims'),
  novelty: document.getElementById('assessment-novelty'),
  noveltyScore: document.getElementById('assessment-novelty-score'),
  convincing: document.getElementById('assessment-convincing'),
  influence: document.getElementById('assessment-influence'),
};

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
let assessment = createEmptyAssessment();
let activeTag = 'Strength';
let activeSection = 'Summary';
let activeMarkType = 'highlight';
let activeColor = 'pink';
let currentPage = 1;
let scale = 1;
let paperControlsCollapsed = false;
let previewCompanionMode = false;
let previewPanelHidden = false;
let metadataPanelCollapsed = false;
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

function createEmptyAssessment() {
  return {
    journalFit: '',
    majorClaims: '',
    novelty: '',
    noveltyScore: '',
    convincing: '',
    influence: '',
  };
}

function normalizeNoveltyScore(value) {
  if (value === '' || value === null || value === undefined) return '';
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 10 ? score : '';
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
  syncAssessmentFromInputs();
  syncAnnotationCommentsFromDraft();
  return {
    stateVersion: 2,
    pdfName,
    pdfFingerprint,
    annotations,
    metadata,
    metadataEdited,
    reviewDraft,
    assessment,
    activeTag,
    activeSection,
    activeMarkType,
    activeColor,
    currentPage,
    scale,
    paperControlsCollapsed,
    previewCompanionMode,
    previewPanelHidden,
    metadataPanelCollapsed,
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

function setMetadataPanelCollapsed(collapsed, { persist = true } = {}) {
  metadataPanelCollapsed = Boolean(collapsed);
  metadataPanel?.classList.toggle('hidden', metadataPanelCollapsed);
  toggleMetadataPanelButton.textContent = metadataPanelCollapsed ? 'Show metadata' : 'Hide metadata';
  toggleMetadataPanelButton.setAttribute('aria-expanded', String(!metadataPanelCollapsed));
  if (persist) saveState();
}

function updatePreviewModeButton() {
  if (previewCompanionMode && previewPanelHidden) {
    previewModeButton.textContent = 'Show Preview Panel';
  } else {
    previewModeButton.textContent = previewCompanionMode ? 'Show Paper Panel' : 'Preview Companion';
  }
  previewModeButton.classList.toggle('primary-button', previewCompanionMode);
}

function setPreviewPanelHidden(hidden, { persist = true } = {}) {
  previewPanelHidden = Boolean(hidden) && previewCompanionMode;
  document.body.classList.toggle('preview-panel-hidden', previewCompanionMode && previewPanelHidden);
  updatePreviewModeButton();
  if (persist) saveState();
}

function setPreviewCompanionMode(enabled, { persist = true, tile = false } = {}) {
  previewCompanionMode = Boolean(enabled);
  if (!previewCompanionMode) previewPanelHidden = false;
  document.body.classList.toggle('preview-companion', previewCompanionMode);
  document.body.classList.toggle('preview-panel-hidden', previewCompanionMode && previewPanelHidden);
  updatePreviewModeButton();
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

function setAssessment(nextAssessment = {}, { persist = true } = {}) {
  assessment = {
    ...createEmptyAssessment(),
    ...nextAssessment,
    noveltyScore: normalizeNoveltyScore(nextAssessment.noveltyScore),
  };

  Object.entries(assessmentInputs).forEach(([key, input]) => {
    input.value = assessment[key];
  });

  if (persist) saveState();
}

function syncAssessmentFromInputs() {
  assessment = {
    journalFit: assessmentInputs.journalFit.value.trim(),
    majorClaims: assessmentInputs.majorClaims.value.trim(),
    novelty: assessmentInputs.novelty.value.trim(),
    noveltyScore: normalizeNoveltyScore(assessmentInputs.noveltyScore.value),
    convincing: assessmentInputs.convincing.value.trim(),
    influence: assessmentInputs.influence.value.trim(),
  };
  assessmentInputs.noveltyScore.value = assessment.noveltyScore;
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
  reviewDraft = sanitizeReviewHtml(reviewDraftEditor.innerHTML);
  reviewDraftEditor.classList.toggle('is-empty', !reviewDraftEditor.textContent.trim());
}

function renderReviewDraft() {
  reviewDraftEditor.innerHTML = sanitizeReviewHtml(reviewDraft || '');
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

function setReviewRangeFromPoint(clientX, clientY) {
  const range = document.caretRangeFromPoint
    ? document.caretRangeFromPoint(clientX, clientY)
    : document.caretPositionFromPoint?.(clientX, clientY);
  if (!range) return false;

  const nextRange = document.createRange();
  if ('offsetNode' in range) {
    nextRange.setStart(range.offsetNode, range.offset);
  } else {
    nextRange.setStart(range.startContainer, range.startOffset);
  }
  nextRange.collapse(true);
  if (!reviewDraftEditor.contains(nextRange.commonAncestorContainer)) return false;

  lastReviewRange = nextRange;
  return true;
}

function createReviewPageBreak() {
  const pageBreak = document.createElement('div');
  pageBreak.className = 'review-page-break';
  pageBreak.contentEditable = 'false';
  pageBreak.textContent = 'Page break';
  return pageBreak;
}

function addReviewPage() {
  const pageBreak = createReviewPageBreak();
  const spacer = document.createElement('p');
  spacer.innerHTML = '<br>';
  insertNodeIntoReviewDraft(pageBreak);
  insertNodeIntoReviewDraft(spacer);
  setCursorAfter(spacer);
  updateReviewDraftState();
  saveState();
}

function insertFragmentIntoReviewDraft(fragment) {
  const nodes = Array.from(fragment.childNodes);
  nodes.forEach((node) => insertNodeIntoReviewDraft(node));
  if (nodes.length) setCursorAfter(nodes[nodes.length - 1]);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function isAllowedCssColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value)
    || /^rgb(a)?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(value);
}

function cleanInlineStyle(styleText) {
  const source = document.createElement('span');
  source.setAttribute('style', styleText || '');
  const clean = {};
  ['color', 'backgroundColor'].forEach((property) => {
    const value = source.style[property];
    if (value && isAllowedCssColor(value)) clean[property] = value;
  });
  if (['0.88rem', '1.18rem', '1.38rem'].includes(source.style.fontSize)) {
    clean.fontSize = source.style.fontSize;
  }
  return clean;
}

function sanitizeReviewNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');

  const tagName = node.tagName.toUpperCase();
  if (tagName === 'SCRIPT' || tagName === 'STYLE') return document.createTextNode('');
  const cleanTag = ALLOWED_REVIEW_TAGS.has(tagName) ? tagName.toLowerCase() : 'span';
  const clean = document.createElement(cleanTag);

  const classes = Array.from(node.classList || []).filter((name) => ALLOWED_REVIEW_CLASSES.has(name));
  if (classes.length) clean.className = classes.join(' ');
  if (node.dataset?.annotationId && cleanTag === 'article') clean.dataset.annotationId = node.dataset.annotationId;
  if (node.getAttribute('contenteditable') === 'false') clean.contentEditable = 'false';

  if (cleanTag === 'a') {
    const href = node.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
      clean.href = href;
      clean.rel = 'noreferrer';
    }
  }

  if (cleanTag === 'img') {
    const src = node.getAttribute('src') || '';
    if (src.startsWith('data:image/')) clean.src = src;
    clean.alt = (node.getAttribute('alt') || '').slice(0, 200);
  }

  const styles = cleanInlineStyle(node.getAttribute('style'));
  Object.entries(styles).forEach(([property, value]) => {
    clean.style[property] = value;
  });

  Array.from(node.childNodes).forEach((child) => {
    const sanitized = sanitizeReviewNode(child);
    if (sanitized.textContent || sanitized.nodeType === Node.ELEMENT_NODE) clean.appendChild(sanitized);
  });

  return clean;
}

function sanitizeReviewHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  const fragment = document.createDocumentFragment();
  Array.from(template.content.childNodes).forEach((node) => fragment.appendChild(sanitizeReviewNode(node)));
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function restoreReviewSelection() {
  reviewDraftEditor.focus();
  if (!lastReviewRange || !reviewDraftEditor.contains(lastReviewRange.commonAncestorContainer)) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(lastReviewRange);
}

function execReviewCommand(command, value = null) {
  restoreReviewSelection();
  document.execCommand(command, false, value);
  scheduleReviewDraftSave();
  saveReviewRange();
}

function applyTextSize(size) {
  restoreReviewSelection();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!reviewDraftEditor.contains(range.commonAncestorContainer)) return;

  const className = size ? `text-size-${size}` : '';
  if (!className) return;
  const span = document.createElement('span');
  span.className = className;

  if (range.collapsed) {
    span.appendChild(document.createTextNode('\u200b'));
    range.insertNode(span);
    range.setStart(span.firstChild, 1);
    range.collapse(true);
  } else {
    span.appendChild(range.extractContents());
    range.insertNode(span);
    range.selectNodeContents(span);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
  saveReviewRange();
  scheduleReviewDraftSave();
}

function formatBlock(tagName) {
  execReviewCommand('formatBlock', tagName);
}

function blockStyleForNode(node) {
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const block = element?.closest?.('pre, h2, blockquote, p');
  if (!block || !reviewDraftEditor.contains(block)) return 'P';
  return block.tagName.toUpperCase();
}

function updateNotesBlockStyle() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!reviewDraftEditor.contains(range.commonAncestorContainer)) return;
  notesBlockStyle.value = blockStyleForNode(range.commonAncestorContainer);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImageFile(file) {
  return file?.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file?.name || '');
}

function imageMimeTypeForName(name = '') {
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.webp$/i.test(name)) return 'image/webp';
  if (/\.gif$/i.test(name)) return 'image/gif';
  return 'image/png';
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function normalizeNoteImage(dataUrl, mimeType = 'image/png') {
  const image = await loadImage(dataUrl);
  const scaleFactor = Math.min(1, MAX_NOTE_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scaleFactor));
  const height = Math.max(1, Math.round(image.naturalHeight * scaleFactor));
  const outputType = mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : 'image/jpeg';

  if (scaleFactor === 1 && dataUrl.length < 1200000) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(outputType, NOTE_IMAGE_JPEG_QUALITY);
}

function createReviewImageFigure(dataUrl, alt = '') {
  const figure = document.createElement('figure');
  figure.className = 'review-image-figure';

  const image = document.createElement('img');
  image.src = dataUrl;
  image.alt = alt;
  image.contentEditable = 'false';

  const caption = document.createElement('figcaption');
  caption.contentEditable = 'true';

  figure.append(image, caption);
  return figure;
}

async function insertImageDataUrl(dataUrl, { name = 'Inserted image', mimeType = 'image/png' } = {}) {
  const normalized = await normalizeNoteImage(dataUrl, mimeType);
  const figure = createReviewImageFigure(normalized, name);
  const spacer = document.createElement('p');
  spacer.innerHTML = '<br>';
  insertNodeIntoReviewDraft(figure);
  insertNodeIntoReviewDraft(spacer);
  setCursorAfter(spacer);
  updateReviewDraftState();
  saveState();
}

async function insertImageFile(file) {
  if (!isImageFile(file)) return;
  const dataUrl = await readFileAsDataUrl(file);
  await insertImageDataUrl(dataUrl, { name: file.name || 'Inserted image', mimeType: file.type || imageMimeTypeForName(file.name) });
}

function dataUrlToAsset(dataUrl, index, caption = '') {
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i);
  if (!match) return null;
  const extension = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
  return {
    filename: `note-image-${String(index).padStart(2, '0')}.${extension}`,
    dataUrl,
    caption,
  };
}

function markdownEscape(text) {
  return String(text || '').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function richReviewDraftAsMarkdown(assetDirName = SUMMARY_ASSET_DIR_PLACEHOLDER) {
  const clone = reviewDraftEditor.cloneNode(true);
  const assets = [];
  const lines = [];

  function appendText(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned) lines.push(cleaned, '');
  }

  Array.from(clone.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent || '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node;
    if (element.matches('.review-page-break')) {
      lines.push('---', '');
      return;
    }

    const image = element.matches('img') ? element : element.querySelector('img');
    if (image?.src?.startsWith('data:image/')) {
      const caption = element.querySelector('figcaption')?.textContent.trim() || image.alt || 'Review image';
      const asset = dataUrlToAsset(image.src, assets.length + 1, caption);
      if (asset) {
        assets.push(asset);
        lines.push(`![${markdownEscape(caption)}](${assetDirName}/${asset.filename})`, '');
      }
      return;
    }

    if (element.matches('h2')) {
      const heading = element.textContent.replace(/\s+/g, ' ').trim();
      if (heading) lines.push(`### ${heading}`, '');
      return;
    }

    if (element.matches('blockquote')) {
      const quote = element.textContent.replace(/\s+/g, ' ').trim();
      if (quote) lines.push(`> ${quote}`, '');
      return;
    }

    appendText(element.textContent || '');
  });

  return {
    markdown: lines.join('\n').trimEnd(),
    assets,
  };
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
  return richReviewDraftAsMarkdown().markdown;
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
  assessment = createEmptyAssessment();
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
  assessment = {
    ...createEmptyAssessment(),
    ...(saved.assessment || {}),
    noveltyScore: normalizeNoveltyScore(saved.assessment?.noveltyScore),
  };
  setAssessment(assessment, { persist: false });
  activeTag = normalizeTag(saved.activeTag);
  activeSection = normalizeSection(saved.activeSection);
  activeMarkType = normalizeMarkType(saved.activeMarkType);
  activeColor = normalizeColor(saved.activeColor);
  currentPage = saved.currentPage || 1;
  scale = saved.scale || 1;
  paperControlsCollapsed = Boolean(saved.paperControlsCollapsed);
  previewCompanionMode = Boolean(saved.previewCompanionMode);
  previewPanelHidden = Boolean(saved.previewPanelHidden);
  metadataPanelCollapsed = Boolean(saved.metadataPanelCollapsed);
  if (Number.isFinite(saved.splitPercent)) setSplitPercent(saved.splitPercent, { persist: false });
  setPaperControlsCollapsed(paperControlsCollapsed, { persist: false });
  setPreviewCompanionMode(previewCompanionMode, { persist: false });
  setPreviewPanelHidden(previewPanelHidden, { persist: false });
  setMetadataPanelCollapsed(metadataPanelCollapsed, { persist: false });
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
  assessment = createEmptyAssessment();
  currentPage = 1;
  scale = 1;
  setPreviewCompanionMode(false);
  setPreviewPanelHidden(false);
  setPaperControlsCollapsed(false);
  setMetadataPanelCollapsed(false);
  setSplitPercent(50);
  Object.keys(metadataInputs).forEach((key) => { metadataInputs[key].value = ''; });
  setAssessment(createEmptyAssessment(), { persist: false });
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

function assessmentAnswer(value) {
  return String(value || '').trim() || UNANSWERED_ASSESSMENT;
}

function generateMarkdownSummary() {
  syncAssessmentFromInputs();
  syncAnnotationCommentsFromDraft();
  const draft = richReviewDraftAsMarkdown();
  const lines = [SUMMARY_FORMAT_MARKER, '', '# Review Summary', ''];
  lines.push(`**Title:** ${metadata.title || 'Untitled manuscript'}`);
  lines.push(`**Authors:** ${metadata.authors || 'Not specified'}`);
  lines.push(`**Journal:** ${metadata.journal || 'Not specified'}`);
  lines.push(`**Date:** ${metadata.date || 'Not specified'}`);
  lines.push('');
  lines.push('## Final Assessment', '');
  lines.push('### 1. Journal Suitability', '', assessmentAnswer(assessment.journalFit), '');
  lines.push('### 2. Major Claims', '', assessmentAnswer(assessment.majorClaims), '');
  lines.push('### 3. Novelty and Significant Advance', '');
  lines.push(`**Score:** ${assessment.noveltyScore ? `${assessment.noveltyScore}/10` : 'Not scored'}`, '');
  lines.push(assessmentAnswer(assessment.novelty), '');
  lines.push('### 4. Strength of Evidence', '', assessmentAnswer(assessment.convincing), '');
  lines.push('### 5. Influence and Wider Interest', '', assessmentAnswer(assessment.influence), '');

  if (draft.markdown) {
    lines.push('## Review Notes', '');
    lines.push(draft.markdown, '');
  }

  const reviewAnnotations = annotations.filter((annotation) => annotation.trackInReview !== false);

  if (reviewAnnotations.length === 0) {
    if (!draft.markdown) lines.push('No notes yet.');
    return { markdown: lines.join('\n').trimEnd(), assets: draft.assets };
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
  return { markdown: lines.join('\n').trimEnd(), assets: draft.assets };
}

function refreshSummaryPreview() {
  summaryOutput.value = generateMarkdownSummary().markdown;
}

function openSummary() {
  setAssessment(assessment, { persist: false });
  refreshSummaryPreview();
  copyStatus.textContent = '';
  summaryDialog.classList.remove('hidden');
  assessmentInputs.journalFit.focus();
}

function closeSummary() {
  syncAssessmentFromInputs();
  saveState();
  summaryDialog.classList.add('hidden');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownSection(markdown, heading, followingHeadings = []) {
  const startsAt = markdown.search(new RegExp(`^${escapeRegExp(heading)}\\s*$`, 'm'));
  if (startsAt < 0) return '';
  const contentStart = startsAt + markdown.slice(startsAt).indexOf('\n') + 1;
  let contentEnd = markdown.length;

  followingHeadings.forEach((nextHeading) => {
    const relativeEnd = markdown.slice(contentStart).search(new RegExp(`^${escapeRegExp(nextHeading)}\\s*$`, 'm'));
    if (relativeEnd >= 0) contentEnd = Math.min(contentEnd, contentStart + relativeEnd);
  });

  return markdown.slice(contentStart, contentEnd).trim();
}

function importedAnswer(markdown, heading, followingHeadings) {
  const value = markdownSection(markdown, heading, followingHeadings).trim();
  return value === UNANSWERED_ASSESSMENT ? '' : value;
}

function parsePaperReviewerSummary(markdown) {
  const assessmentHeadings = [
    '### 1. Journal Suitability',
    '### 2. Major Claims',
    '### 3. Novelty and Significant Advance',
    '### 4. Strength of Evidence',
    '### 5. Influence and Wider Interest',
  ];
  const noveltySection = markdownSection(markdown, assessmentHeadings[2], assessmentHeadings.slice(3).concat('## Review Notes', '## Linked Annotations'));
  const scoreMatch = noveltySection.match(/^\*\*Score:\*\*\s*(\d{1,2})\/10\s*$/m);
  const novelty = noveltySection
    .replace(/^\*\*Score:\*\*.*$/m, '')
    .trim();
  const reviewNotes = markdownSection(markdown, '## Review Notes', ['## Linked Annotations']);
  const linkedAnnotations = markdownSection(markdown, '## Linked Annotations');
  const noteParts = [reviewNotes];
  if (linkedAnnotations) noteParts.push(`## Imported Linked Annotations\n\n${linkedAnnotations}`);

  const metadataValue = (label) => {
    const match = markdown.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`, 'm'));
    const value = match?.[1]?.trim() || '';
    return ['Not specified', 'Untitled manuscript'].includes(value) ? '' : value;
  };

  return {
    metadata: {
      title: metadataValue('Title'),
      authors: metadataValue('Authors'),
      journal: metadataValue('Journal'),
      date: metadataValue('Date'),
    },
    assessment: {
      journalFit: importedAnswer(markdown, assessmentHeadings[0], assessmentHeadings.slice(1).concat('## Review Notes', '## Linked Annotations')),
      majorClaims: importedAnswer(markdown, assessmentHeadings[1], assessmentHeadings.slice(2).concat('## Review Notes', '## Linked Annotations')),
      novelty: novelty === UNANSWERED_ASSESSMENT ? '' : novelty,
      noveltyScore: normalizeNoveltyScore(scoreMatch?.[1]),
      convincing: importedAnswer(markdown, assessmentHeadings[3], assessmentHeadings.slice(4).concat('## Review Notes', '## Linked Annotations')),
      influence: importedAnswer(markdown, assessmentHeadings[4], ['## Review Notes', '## Linked Annotations']),
    },
    notesMarkdown: noteParts.filter(Boolean).join('\n\n'),
  };
}

function markdownToReviewHtml(markdown, importedAssets = []) {
  const assetMap = new Map(importedAssets.map((asset) => [asset.reference, asset]));
  const container = document.createElement('div');
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  let paragraphLines = [];
  let codeLines = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const paragraph = document.createElement('p');
    paragraph.textContent = paragraphLines.join(' ').trim();
    if (paragraph.textContent) container.appendChild(paragraph);
    paragraphLines = [];
  };

  const flushCode = () => {
    const pre = document.createElement('pre');
    pre.textContent = codeLines.join('\n');
    container.appendChild(pre);
    codeLines = [];
  };

  lines.forEach((line) => {
    if (/^```/.test(line.trim())) {
      flushParagraph();
      if (inCodeBlock) flushCode();
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      return;
    }

    const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/);
    if (imageMatch) {
      flushParagraph();
      const asset = assetMap.get(imageMatch[2]);
      if (asset?.dataUrl) container.appendChild(createReviewImageFigure(asset.dataUrl, imageMatch[1] || asset.name));
      else paragraphLines.push(`[Image unavailable: ${imageMatch[1] || imageMatch[2]}]`);
      return;
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const heading = document.createElement('h2');
      heading.textContent = headingMatch[1];
      container.appendChild(heading);
      return;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quote = document.createElement('blockquote');
      quote.textContent = line.replace(/^>\s?/, '');
      container.appendChild(quote);
      return;
    }

    paragraphLines.push(line.replace(/^[-*+]\s+/, '• '));
  });

  if (inCodeBlock || codeLines.length) flushCode();
  flushParagraph();
  return sanitizeReviewHtml(container.innerHTML);
}

function hasCurrentReviewContent() {
  return Boolean(
    reviewDraftEditor.textContent.trim()
    || Object.values(metadata).some((value) => String(value || '').trim())
    || Object.entries(assessment).some(([key, value]) => key !== 'noveltyScore'
      ? String(value || '').trim()
      : value !== ''),
  );
}

async function openSavedSummary() {
  if (!api?.openSummary) {
    showStatus('Run the desktop app to open a saved Markdown summary.');
    return;
  }

  try {
    const result = await api.openSummary();
    if (!result) return;
    if (hasCurrentReviewContent() && !window.confirm(
      'Open this saved summary and replace the current metadata, review notes, and final assessment? Existing PDF marks will be kept.',
    )) return;

    const isPaperReviewerSummary = result.markdown.includes(SUMMARY_FORMAT_MARKER)
      || /^# Review Summary\s*$/m.test(result.markdown);
    const imported = isPaperReviewerSummary
      ? parsePaperReviewerSummary(result.markdown)
      : {
        metadata: createEmptyMetadata(),
        assessment: createEmptyAssessment(),
        notesMarkdown: result.markdown,
      };

    metadata = { ...createEmptyMetadata(), ...imported.metadata };
    metadataEdited = Object.fromEntries(Object.keys(metadata).map((key) => [key, Boolean(metadata[key])]));
    Object.entries(metadataInputs).forEach(([key, input]) => { input.value = metadata[key]; });
    reviewDraft = markdownToReviewHtml(imported.notesMarkdown, result.assets || []);
    renderReviewDraft();
    setAssessment(imported.assessment, { persist: false });
    saveState();
    closeSummary();
    showStatus(`Opened ${result.name}. PDF marks were left unchanged.`);
  } catch {
    showStatus('Could not open that review summary.');
  }
}

async function saveSummaryToPath() {
  const { markdown, assets } = generateMarkdownSummary();
  if (!api) {
    copyStatus.textContent = 'Run the desktop app to save beside the PDF. Markdown is ready to copy.';
    return;
  }
  const result = await api.saveSummary({ sourcePath: pdfPath, markdown, assets });
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

function isPdfFile(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
}

async function loadPdfFile(file) {
  if (!isPdfFile(file)) {
    showStatus('Drop a PDF file into the manuscript panel.');
    return false;
  }

  await loadPdfBytes(new Uint8Array(await file.arrayBuffer()), file.name, file.path || '');
  showStatus(`Opened ${file.name}.`);
  return true;
}

function droppedFiles(event) {
  return Array.from(event.dataTransfer?.files || []);
}

function hasImageTransfer(event) {
  const files = droppedFiles(event);
  if (files.length > 0) return files.some(isImageFile);
  return Array.from(event.dataTransfer?.items || []).some((item) => item.type?.startsWith('image/'));
}

function setDragActive(element, active) {
  element?.classList.toggle('is-dragover', active);
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
hidePreviewPanelButton.addEventListener('click', () => setPreviewPanelHidden(true));
previewModeButton.addEventListener('click', () => {
  if (previewCompanionMode && previewPanelHidden) {
    setPreviewPanelHidden(false);
    return;
  }
  setPreviewCompanionMode(!previewCompanionMode, { tile: true });
});
togglePaperControlsButton.addEventListener('click', () => setPaperControlsCollapsed(!paperControlsCollapsed));
pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  await loadPdfFile(file);
  pdfInput.value = '';
});

['dragenter', 'dragover'].forEach((eventName) => {
  pdfViewer.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(pdfViewer, true);
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  pdfViewer.addEventListener(eventName, () => setDragActive(pdfViewer, false));
});

pdfViewer.addEventListener('drop', async (event) => {
  event.preventDefault();
  const files = droppedFiles(event);
  if (files.length !== 1 || !isPdfFile(files[0])) {
    showStatus('Drop one PDF file into the manuscript panel.');
    return;
  }

  try {
    await loadPdfFile(files[0]);
  } catch {
    showStatus('Could not open the dropped PDF.');
  }
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
toggleMetadataPanelButton.addEventListener('click', () => setMetadataPanelCollapsed(!metadataPanelCollapsed));
addReviewPageButton.addEventListener('click', addReviewPage);

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
reviewDraftEditor.addEventListener('input', () => {
  scheduleReviewDraftSave();
  updateNotesBlockStyle();
});
reviewDraftEditor.addEventListener('keyup', () => {
  saveReviewRange();
  updateNotesBlockStyle();
});
reviewDraftEditor.addEventListener('mouseup', () => {
  saveReviewRange();
  updateNotesBlockStyle();
});
reviewDraftEditor.addEventListener('focus', () => {
  saveReviewRange();
  updateNotesBlockStyle();
});
reviewDraftEditor.addEventListener('click', (event) => {
  const linkedNote = event.target.closest('.review-linked-note');
  if (linkedNote?.dataset.annotationId) focusAnnotation(linkedNote.dataset.annotationId);
});
reviewDraftEditor.addEventListener('paste', (event) => {
  event.preventDefault();
  const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
  if (imageItem) {
    insertImageFile(imageItem.getAsFile()).catch(() => showStatus('Could not insert the pasted image.'));
    return;
  }

  const html = event.clipboardData?.getData('text/html') || '';
  if (html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeReviewHtml(html);
    const fragment = template.content.cloneNode(true);
    insertFragmentIntoReviewDraft(fragment);
    updateReviewDraftState();
    saveState();
    return;
  }

  const text = event.clipboardData?.getData('text/plain') || '';
  document.execCommand('insertText', false, text);
});
formatButtons.forEach((button) => {
  button.addEventListener('click', () => execReviewCommand(button.dataset.command));
});
notesBlockStyle.addEventListener('change', () => {
  const tagName = notesBlockStyle.value;
  formatBlock(tagName);
  notesBlockStyle.value = tagName;
});
notesTextSize.addEventListener('change', () => {
  applyTextSize(notesTextSize.value);
  notesTextSize.value = '';
});
notesTextColor.addEventListener('input', () => execReviewCommand('foreColor', notesTextColor.value));
notesHighlightColor.addEventListener('input', () => execReviewCommand('hiliteColor', notesHighlightColor.value));
textColorPresetButtons.forEach((button) => {
  const color = button.dataset.textColor;
  button.style.setProperty('--preset-color', color);
  button.addEventListener('click', () => {
    if (!TEXT_COLOR_PRESETS.includes(color)) return;
    notesTextColor.value = color;
    execReviewCommand('foreColor', color);
  });
});
insertNoteImageButton.addEventListener('click', async () => {
  try {
    if (api?.openImage) {
      const result = await api.openImage();
      if (!result) return;
      const bytes = new Uint8Array(result.bytes);
      await insertImageDataUrl(`data:${result.type};base64,${bytesToBase64(bytes)}`, {
        name: result.name,
        mimeType: result.type,
      });
      return;
    }

    showStatus('Run the desktop app to insert image files.');
  } catch {
    showStatus('Could not insert that image.');
  }
});

[reviewPageShell, reviewDraftEditor].forEach((dropTarget) => {
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropTarget?.addEventListener(eventName, (event) => {
      if (!hasImageTransfer(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDragActive(reviewPageShell, true);
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropTarget?.addEventListener(eventName, () => setDragActive(reviewPageShell, false));
  });
});

reviewPageShell?.addEventListener('drop', async (event) => {
  const images = droppedFiles(event).filter(isImageFile);
  if (images.length === 0) return;

  event.preventDefault();
  setReviewRangeFromPoint(event.clientX, event.clientY);

  try {
    for (const image of images) {
      await insertImageFile(image);
    }
    showStatus(images.length === 1 ? 'Inserted dropped image into the review note.' : `Inserted ${images.length} dropped images into the review note.`);
  } catch {
    showStatus('Could not insert the dropped image.');
  }
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
openSummaryButton.addEventListener('click', openSavedSummary);
saveSummaryButton.addEventListener('click', saveSummaryToPath);
savePdfButton.addEventListener('click', saveAnnotatedPdf);
clearReviewButton.addEventListener('click', requestClearReview);
copySummaryButton.addEventListener('click', copySummary);
closeSummaryButton.addEventListener('click', closeSummary);
dismissSummaryButton.addEventListener('click', closeSummary);
summaryDialog.addEventListener('click', (event) => {
  if (event.target === summaryDialog) closeSummary();
});
Object.entries(assessmentInputs).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    if (key === 'noveltyScore' && input.value) {
      input.value = String(clamp(Math.round(Number(input.value) || 1), 1, 10));
    }
    syncAssessmentFromInputs();
    refreshSummaryPreview();
    saveState();
  });
});
window.addEventListener('focus', () => {
  if (!reloadAfterPreview) return;
  reloadAfterPreview = false;
  setTimeout(reloadCurrentPdf, 500);
});

setSplitPercent(splitPercent, { persist: false });
setPaperControlsCollapsed(paperControlsCollapsed, { persist: false });
setPreviewCompanionMode(previewCompanionMode, { persist: false });
setMetadataPanelCollapsed(metadataPanelCollapsed, { persist: false });
setActiveTag(activeTag);
setActiveSection(activeSection);
setActiveMarkType(activeMarkType);
setActiveColor(activeColor);
setMetadata(metadata, { overwriteEdited: true });
setAssessment(assessment, { persist: false });
updatePageStatus();
renderReviewDraft();
