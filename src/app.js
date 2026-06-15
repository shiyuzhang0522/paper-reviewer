const manuscript = document.getElementById('manuscript');
const selectionMenu = document.getElementById('selection-menu');
const commentList = document.getElementById('comment-list');
const commentTemplate = document.getElementById('comment-template');
const importButton = document.getElementById('import-button');

let currentSelection = null;
let annotations = [];

function updateCommentPanel() {
  commentList.innerHTML = '';

  if (annotations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No highlights yet. Select text to start.';
    commentList.appendChild(empty);
    return;
  }

  annotations.forEach((annotation) => {
    const item = commentTemplate.content.cloneNode(true);
    item.querySelector('.comment-tag').textContent = annotation.tag || 'Highlight';
    item.querySelector('.comment-time').textContent = new Date(annotation.createdAt).toLocaleString();
    item.querySelector('.comment-text').textContent = annotation.comment || 'No comment provided.';
    item.querySelector('.comment-highlight').textContent = annotation.text;
    commentList.appendChild(item);
  });
}

function openMenu(x, y) {
  selectionMenu.style.left = `${x}px`;
  selectionMenu.style.top = `${y - 40}px`;
  selectionMenu.classList.remove('hidden');
}

function closeMenu() {
  selectionMenu.classList.add('hidden');
}

function getSelectedText() {
  const selection = window.getSelection();
  return selection?.toString().trim() || '';
}

function addAnnotation(tag = 'Highlight') {
  const text = getSelectedText();
  if (!text) return;

  const comment = prompt('Comment for this highlight:', '');

  annotations.push({
    text,
    tag,
    comment,
    createdAt: Date.now(),
  });

  updateCommentPanel();
  window.getSelection().removeAllRanges();
  closeMenu();
}

manuscript.addEventListener('mouseup', (event) => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    closeMenu();
    return;
  }

  currentSelection = selection;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  openMenu(rect.left + window.scrollX, rect.top + window.scrollY);
});

document.addEventListener('click', (event) => {
  if (!selectionMenu.contains(event.target) && !manuscript.contains(event.target)) {
    closeMenu();
  }
});

selectionMenu.addEventListener('click', (event) => {
  const action = event.target.dataset.action;
  if (!action) return;

  if (action === 'highlight') {
    addAnnotation('Highlight');
  } else if (action === 'comment') {
    addAnnotation('Comment');
  } else if (action === 'tag') {
    const tag = prompt('Tag this note as Strength, Weakness, Question or Suggestion:', 'Strength');
    if (tag) addAnnotation(tag);
  }
});

importButton.addEventListener('click', () => {
  const newText = prompt('Paste manuscript text here:');
  if (newText) {
    manuscript.innerHTML = newText.split('\n\n').map((paragraph) => `<p>${paragraph}</p>`).join('');
  }
});

updateCommentPanel();
