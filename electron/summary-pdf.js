const path = require('path');

const SUMMARY_ASSET_DIR_PLACEHOLDER = 'review-summary-assets';

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

function parseMarkdownImage(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/);
  if (!match) return null;

  let reference = match[2].trim();
  const titleMatch = reference.match(/^(.+?)\s+["'][^"']*["']$/);
  if (titleMatch) reference = titleMatch[1].trim();
  if ((reference.startsWith('<') && reference.endsWith('>'))
    || (reference.startsWith('"') && reference.endsWith('"'))) {
    reference = reference.slice(1, -1).trim();
  }

  return {
    alt: match[1].replace(/\\([\[\]])/g, '$1'),
    reference,
  };
}

function assetKeysForReference(reference) {
  const raw = String(reference || '').trim();
  const keys = new Set([raw]);
  try {
    keys.add(decodeURIComponent(raw));
  } catch {
    // Keep the original raw reference when it is not URI encoded.
  }

  Array.from(keys).forEach((key) => {
    const basename = path.basename(key);
    if (basename) keys.add(basename);
  });

  return Array.from(keys).filter(Boolean);
}

function addAssetToMap(assetMap, reference, dataUrl) {
  assetKeysForReference(reference).forEach((key) => assetMap.set(key, dataUrl));
}

function createAssetMap(assets = []) {
  const assetMap = new Map();
  assets.forEach((asset) => {
    if (!asset?.dataUrl) return;
    const filename = asset.filename || asset.name;
    if (filename) {
      addAssetToMap(assetMap, filename, asset.dataUrl);
      addAssetToMap(assetMap, `${SUMMARY_ASSET_DIR_PLACEHOLDER}/${filename}`, asset.dataUrl);
    }
    if (asset.reference) addAssetToMap(assetMap, asset.reference, asset.dataUrl);
  });
  return assetMap;
}

function markdownToPrintableHtml(markdown, assets = []) {
  const assetMap = createAssetMap(assets);
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

    if (trimmed === '<!-- paper-reviewer-summary:v2 -->') continue;

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
      const columnCount = Math.max(...tableRows.map((row) => row.length), 1);
      const normalizedRows = tableRows.map((row) => (
        Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] || '')
      ));
      const header = normalizedRows[0] || [];
      const bodyRows = normalizedRows.slice(1);
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

    const image = parseMarkdownImage(line);
    if (image) {
      flushParagraph();
      const source = assetMap.get(image.reference) || image.reference;
      if (/^data:image\//i.test(source)) {
        html.push(`<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(image.alt)}"><figcaption>${escapeHtml(image.alt)}</figcaption></figure>`);
      } else {
        html.push(`<p class="image-missing">Image unavailable: ${escapeHtml(image.alt || image.reference)}</p>`);
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
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, '').trim());
        index += 1;
      }
      index -= 1;
      html.push(`<blockquote>${quoteLines.map((quoteLine) => inlineMarkdown(quoteLine)).join('<br>')}</blockquote>`);
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

module.exports = {
  SUMMARY_ASSET_DIR_PLACEHOLDER,
  markdownToPrintableHtml,
  parseMarkdownImage,
  summaryPdfDocumentHtml,
};
