const assert = require('assert');
const { markdownToPrintableHtml, parseMarkdownImage } = require('../electron/summary-pdf');

const tinyPng = 'data:image/png;base64,iVBORw0KGgo=';

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders tables, figures, and grouped quotes for printable PDF HTML', () => {
  const markdown = [
    '# Review Summary',
    '',
    '| Claim | Concern |',
    '| --- | --- |',
    '| A | Needs more evidence |',
    '',
    '![Figure 1: pathway](review-summary-assets/note-image-01.png)',
    '',
    '> First quoted line',
    '> second quoted line',
  ].join('\n');

  const html = markdownToPrintableHtml(markdown, [{
    filename: 'note-image-01.png',
    dataUrl: tinyPng,
  }]);

  assert.match(html, /<table>/);
  assert.match(html, /<th>Claim<\/th>/);
  assert.match(html, /<td>Needs more evidence<\/td>/);
  assert.match(html, /<figure><img src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(html, /<figcaption>Figure 1: pathway<\/figcaption>/);
  assert.match(html, /<blockquote>First quoted line<br>second quoted line<\/blockquote>/);
});

test('matches imported assets by reference and by filename', () => {
  const html = markdownToPrintableHtml('![Plot](summary assets/plot image.png)', [{
    reference: 'summary assets/plot image.png',
    name: 'plot image.png',
    dataUrl: tinyPng,
  }]);

  assert.match(html, /<img src="data:image\/png;base64,iVBORw0KGgo="/);
});

test('parses Markdown image references with spaces and optional titles', () => {
  assert.deepStrictEqual(parseMarkdownImage('![Alt](<assets/my plot.png> "caption")'), {
    alt: 'Alt',
    reference: 'assets/my plot.png',
  });
});
