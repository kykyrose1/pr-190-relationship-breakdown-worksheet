// ── CONFIG ────────────────────────────────────────────────────────────────
// Paste your Google Apps Script web app URL here after deploying your sheet.
// Leave empty ('') to disable automatic submission to Google Sheets.
const GOOGLE_APPS_SCRIPT_URL = '';

// Change these keys to be unique for each new worksheet you create.
// This prevents students' answers from one activity bleeding into another.
const STORAGE_KEY  = 'worksheet-template';   // e.g. 'pr192-pitch-worksheet'
const ANN_KEY      = 'worksheet-template-annotations';
const UNLOCK_KEY   = 'worksheet-template-unlocked';
const PROGRESS_KEY = 'worksheet-template-progress';

// ── FIELD IDS ─────────────────────────────────────────────────────────────
// These IDs must match the id attributes on every input/textarea in index.html.
// Add or remove pairs here if you add or remove sections in Parts 2–4.
const FIELD_IDS = [
  'studentName', 'studentEmail',
  // Part 2 — one _wrong / _why pair per section in the flawed document
  'p2_section1_wrong', 'p2_section1_why',
  'p2_section2_wrong', 'p2_section2_why',
  'p2_section3_wrong', 'p2_section3_why',
  'p2_section4_wrong', 'p2_section4_why',
  'p2_section5_wrong', 'p2_section5_why',
  'p2_section6_wrong', 'p2_section6_why',
  'p2_section7_wrong', 'p2_section7_why',
  'p2_section8_wrong', 'p2_section8_why',
  // Part 3 — one field per rewrite section (add/remove to match your sections)
  'p3_1','p3_2','p3_3','p3_4','p3_5','p3_6','p3_7','p3_8','p3_9',
  // Part 4 — one field per reflection question
  'p4_1','p4_2','p4_3','p4_4',
];

const P2_FIELDS = FIELD_IDS.filter(id => id.startsWith('p2_'));
const P3_FIELDS = FIELD_IDS.filter(id => id.startsWith('p3_'));
const P4_FIELDS = FIELD_IDS.filter(id => id.startsWith('p4_'));

// ── SAVE / RESTORE ────────────────────────────────────────────────────────
function saveToStorage() {
  const data = {};
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  showSaveNotice();
  updateProgress();
}

function restoreFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] !== undefined) el.value = data[id];
    });
  } catch (e) {
    console.warn('Could not restore saved data:', e);
  }
}

// ── STEP PROGRESS ─────────────────────────────────────────────────────────
function getStepProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch(e) { return {}; }
}
function saveStepProgress(steps) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(steps));
}

// ── SAVE NOTICE ───────────────────────────────────────────────────────────
let saveTimer;
function showSaveNotice() {
  const notice = document.getElementById('saveNotice');
  notice.textContent = 'Progress saved';
  notice.style.opacity = '1';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { notice.style.opacity = '0'; }, 2000);
}

// ── PROGRESS BAR ──────────────────────────────────────────────────────────
// Parts 1–3 complete when the Continue button is clicked.
// Part 4 completes when all reflection fields have content.
function updateProgress() {
  const steps = getStepProgress();

  const p4done = P4_FIELDS.every(id => {
    const el = document.getElementById(id);
    return el && el.value.trim().length > 0;
  });

  const stateMap = {
    'dot-p1': !!steps.p1,
    'dot-p2': !!steps.p2,
    'dot-p3': !!steps.p3,
    'dot-p4': p4done,
  };

  let done = 0;
  Object.entries(stateMap).forEach(([dotId, complete]) => {
    if (complete) done++;
    document.getElementById(dotId)?.classList.toggle('done', complete);
  });

  const pct   = Math.round((done / 4) * 100);
  const fill  = document.getElementById('progressFill');
  const label = document.getElementById('progressPct');
  if (fill)  fill.style.width  = pct + '%';
  if (label) label.textContent = pct + '%';
}

// ── VALIDATION ────────────────────────────────────────────────────────────
function validate() {
  const name  = document.getElementById('studentName').value.trim();
  const email = document.getElementById('studentEmail').value.trim();
  const msg   = document.getElementById('validationMsg');

  if (!name) {
    msg.textContent = 'Please enter your full name before downloading.';
    document.getElementById('studentName').focus();
    document.getElementById('sec-info').scrollIntoView({ behavior: 'smooth' });
    return false;
  }
  if (!email || !email.includes('@')) {
    msg.textContent = 'Please enter a valid email address before downloading.';
    document.getElementById('studentEmail').focus();
    document.getElementById('sec-info').scrollIntoView({ behavior: 'smooth' });
    return false;
  }
  msg.textContent = '';
  return true;
}

// ── CONTINUE BUTTON LOGIC ─────────────────────────────────────────────────
const PART_CONFIG = {
  'btn-continue-p1': {
    msgId:   'msg-p1',
    nextIds: ['sec-p2'],
    check:   () => document.querySelectorAll('#briefContent .ann-highlight, #briefContent .ann-underline, #briefContent .ann-flag').length > 0,
    errMsg:  'Annotate at least one part of the document before continuing.',
  },
  'btn-continue-p2': {
    msgId:   'msg-p2',
    nextIds: ['sec-p3'],
    check:   () => P2_FIELDS.every(id => document.getElementById(id)?.value.trim()),
    errMsg:  'Fill in all boxes before continuing.',
  },
  'btn-continue-p3': {
    msgId:   'msg-p3',
    nextIds: ['sec-p4', 'sec-submit'],
    check:   () => P3_FIELDS.every(id => document.getElementById(id)?.value.trim()),
    errMsg:  'Fill in all boxes before continuing.',
  },
};

const CONTINUE_PART_MAP = {
  'btn-continue-p1': 'p1',
  'btn-continue-p2': 'p2',
  'btn-continue-p3': 'p3',
};

function handleContinue(btnId) {
  const cfg   = PART_CONFIG[btnId];
  const msgEl = document.getElementById(cfg.msgId);

  if (!cfg.check()) {
    msgEl.textContent = cfg.errMsg;
    return;
  }

  msgEl.textContent = '';

  const partKey = CONTINUE_PART_MAP[btnId];
  if (partKey) {
    const steps = getStepProgress();
    steps[partKey] = true;
    saveStepProgress(steps);
  }

  (cfg.nextIds || []).forEach(id => {
    document.getElementById(id)?.classList.remove('part-locked');
  });
  saveUnlockedParts();
  updateProgress();

  const firstId = (cfg.nextIds || [])[0];
  const firstEl = firstId && document.getElementById(firstId);
  if (firstEl) {
    setTimeout(() => firstEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
}

function saveUnlockedParts() {
  const ids = ['sec-p2','sec-p3','sec-p4','sec-submit'];
  const unlocked = ids.filter(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('part-locked');
  });
  localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked));
}

function restoreUnlockedParts() {
  try {
    const saved = JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]');
    saved.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('part-locked');
    });
  } catch (e) { /* ignore */ }
}

// ── PDF GENERATION (PR-191 style) ─────────────────────────────────────────
// Uses mm units and clean helper functions.
// Course info is read directly from the page header so you only need to
// update the HTML — the PDF reflects it automatically.
function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const margin   = 20;
  const pageW    = 215.9;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Colors
  const navy  = [0, 51, 102];
  const gold  = [229, 168, 35];
  const black = [26, 26, 46];
  const gray  = [107, 114, 128];

  // Read course info from the DOM so it auto-updates when you edit the HTML
  const studentName  = document.getElementById('studentName').value.trim()  || '';
  const studentEmail = document.getElementById('studentEmail').value.trim() || '';
  const courseLabel  = document.querySelector('.course-label')?.textContent?.trim()
                       || '[COURSE NUMBER]: [COURSE NAME]';
  const activityTitle = document.querySelector('.header-title h1')?.textContent?.trim()
                        || 'In-Class Activity';

  const downloadedAt = new Date().toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function checkNewPage(needed = 12) {
    if (y + needed > 268) { doc.addPage(); y = margin; }
  }

  // Navy header bar printed on the first page
  function drawHeader() {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(...gold);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text((courseLabel + '  |  SAN JOSÉ STATE UNIVERSITY').toUpperCase(), margin, 10);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(activityTitle, margin, 19);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Downloaded: ' + downloadedAt, margin, 25);
    y = 36;
  }

  // Rounded navy bar for section headings
  function sectionTitle(text) {
    checkNewPage(14);
    doc.setFillColor(...navy);
    doc.roundedRect(margin, y, contentW, 8, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(text.toUpperCase(), margin + 4, y + 5.5);
    y += 12;
  }

  // Bold navy label for a question or field name
  function questionLabel(text) {
    checkNewPage(8);
    doc.setTextColor(...navy);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    // Truncate very long question text to prevent overflow
    const display = text.length > 100 ? text.substring(0, 97) + '...' : text;
    doc.text(display, margin, y);
    y += 5;
  }

  // Student answer text (reads from a field by ID)
  function answerText(id) {
    const val = (document.getElementById(id)?.value || '').trim() || '(no response)';
    doc.setTextColor(...black);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(val, contentW);
    lines.forEach(line => {
      checkNewPage(6);
      doc.text(line, margin, y);
      y += 5.2;
    });
    y += 3;
  }

  // Italic gray sub-label (used for column labels in Part 2)
  function subLabel(text) {
    checkNewPage(6);
    doc.setTextColor(...gray);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
    doc.text(text, margin + 2, y);
    y += 4.5;
  }

  // ── Build the PDF ─────────────────────────────────────────────────────────

  drawHeader();

  // Student info box
  doc.setFillColor(242, 244, 247);
  doc.roundedRect(margin, y, contentW, 18, 2, 2, 'F');
  doc.setTextColor(...gray);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT', margin + 4, y + 5);
  doc.setTextColor(...black);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(studentName  || '—', margin + 4, y + 12);
  doc.text(studentEmail || '—', margin + 90, y + 12);
  y += 24;

  // ── Part 1: Original Document ──────────────────────────────────────────
  sectionTitle('Part 1 — Original Document');

  // Read section content from the DOM (plain text — annotations are browser-only)
  document.querySelectorAll('#briefContent .brief-section').forEach(sec => {
    const label   = sec.querySelector('.brief-section-label')?.textContent?.trim() || 'Section';
    const content = sec.querySelector('p')?.textContent?.trim() || '(no content)';
    questionLabel(label);
    doc.setTextColor(...black);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(content, contentW);
    lines.forEach(line => {
      checkNewPage(6);
      doc.text(line, margin, y);
      y += 5.2;
    });
    y += 4;
  });

  // ── Part 2: Diagnose ───────────────────────────────────────────────────
  sectionTitle('Part 2 — Diagnose the Problems');

  document.querySelectorAll('.p2-item').forEach(item => {
    const header    = item.querySelector('.p2-item-header')?.textContent?.trim() || 'Section';
    const colLabels = item.querySelectorAll('.p2-col-label');
    const textareas = item.querySelectorAll('textarea');

    checkNewPage(20);
    doc.setTextColor(...navy);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(header, margin, y);
    y += 6;

    if (textareas[0]) {
      subLabel(colLabels[0]?.textContent?.trim() || '');
      answerText(textareas[0].id);
    }
    if (textareas[1]) {
      subLabel(colLabels[1]?.textContent?.trim() || '');
      answerText(textareas[1].id);
    }
    y += 2;
  });

  // ── Part 3: Rewrite / Create ───────────────────────────────────────────
  sectionTitle('Part 3 — Rewrite / Create');

  document.querySelectorAll('.rewrite-item').forEach(item => {
    const label    = item.querySelector('.rewrite-label')?.textContent?.trim() || 'Section';
    const textarea = item.querySelector('textarea');
    questionLabel(label);
    if (textarea) answerText(textarea.id);
  });

  // ── Part 4: Reflection Questions ──────────────────────────────────────
  sectionTitle('Part 4 — Reflection Questions');

  document.querySelectorAll('.reflection-item').forEach(item => {
    const qText   = item.querySelector('.reflection-q')?.textContent?.trim().replace(/^\d+\.\s*/, '') || 'Question';
    const textarea = item.querySelector('textarea');
    questionLabel(qText);
    if (textarea) answerText(textarea.id);
  });

  // ── Footer on every page ───────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy);
    doc.rect(0, 274, pageW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const footerText = `${courseLabel}  |  ${activityTitle}  |  ${studentName}  |  Page ${i} of ${pageCount}`;
    doc.text(footerText.substring(0, 95), margin, 282);
  }

  // Save with student name in filename
  const safeName = (studentName || 'Student').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
  doc.save(`Worksheet-${safeName}.pdf`);
}

// ── GOOGLE SHEETS POST ────────────────────────────────────────────────────
// Collects all field values and POSTs to your Apps Script URL.
// Update the payload keys below to match your FIELD_IDS.
function postToSheets(name, email) {
  if (!GOOGLE_APPS_SCRIPT_URL) return;
  const val = id => document.getElementById(id)?.value.trim() || '';
  const payload = {
    timestamp:     new Date().toISOString(),
    downloaded_at: new Date().toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }),
    name, email,
  };
  // Dynamically add all field values
  FIELD_IDS.filter(id => id !== 'studentName' && id !== 'studentEmail')
    .forEach(id => { payload[id] = val(id); });

  fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ── CLEAR FORM ────────────────────────────────────────────────────────────
function clearForm() {
  if (!confirm('Are you sure you want to clear everything and start over? This cannot be undone.')) return;
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(UNLOCK_KEY);
  localStorage.removeItem(PROGRESS_KEY);
  clearAnnotations(true);
  ['sec-p2','sec-p3','sec-p4','sec-submit'].forEach(id => {
    document.getElementById(id)?.classList.add('part-locked');
  });
  updateProgress();
  const notice = document.getElementById('saveNotice');
  notice.textContent = 'Form cleared.';
  setTimeout(() => { notice.textContent = ''; }, 2000);
}

// ═════════════════════════════════════════════════════════════════════════
// ANNOTATION SYSTEM
// ═════════════════════════════════════════════════════════════════════════

let _originalBriefHTML = '';

function saveAnnotations() {
  const brief = document.getElementById('briefContent');
  if (brief) localStorage.setItem(ANN_KEY, brief.innerHTML);
  syncBriefRefs();
}

function restoreAnnotations() {
  const saved = localStorage.getItem(ANN_KEY);
  const brief = document.getElementById('briefContent');
  if (saved && brief) {
    brief.innerHTML = saved;
    brief.querySelectorAll('.ann-highlight, .ann-underline, .ann-flag')
      .forEach(attachRemoveListener);
  }
  syncBriefRefs();
}

function clearAnnotations(silent = false) {
  if (!silent && !confirm('Remove all annotations from the document?')) return;
  const brief = document.getElementById('briefContent');
  if (brief && _originalBriefHTML) brief.innerHTML = _originalBriefHTML;
  localStorage.removeItem(ANN_KEY);
  syncBriefRefs();
}

// Copies Part 1 section text into the reference blocks shown in Part 2
function syncBriefRefs() {
  document.querySelectorAll('.brief-ref[data-source]').forEach(ref => {
    const source = document.getElementById(ref.dataset.source);
    if (source) ref.innerHTML = source.innerHTML;
  });
}

function attachRemoveListener(span) {
  span.addEventListener('click', e => {
    if (window.getSelection().toString().length > 0) return;
    e.stopPropagation();
    unwrapAnnotation(span);
    saveAnnotations();
  });
}

function unwrapAnnotation(span) {
  const parent = span.parentNode;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
  parent.normalize();
}

function applyAnnotation(type, range) {
  if (!range || range.collapsed) return;
  const brief = document.getElementById('briefContent');
  if (!brief.contains(range.commonAncestorContainer)) return;

  const tag  = type === 'highlight' ? 'mark' : 'span';
  const span = document.createElement(tag);
  span.className = `ann-${type}`;

  try {
    range.surroundContents(span);
  } catch (e) {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  attachRemoveListener(span);
  window.getSelection().removeAllRanges();
  saveAnnotations();
}

// ── Floating toolbar ──────────────────────────────────────────────────────
const toolbar = document.getElementById('annToolbar');

function showToolbar(x, y) {
  toolbar.classList.add('visible');
  const halfW    = toolbar.offsetWidth / 2;
  const clampedX = Math.min(Math.max(x, halfW + 8), window.innerWidth - halfW - 8);
  toolbar.style.left = `${clampedX}px`;
  toolbar.style.top  = `${y - 8}px`;
}

function hideToolbar() { toolbar.classList.remove('visible'); }

function onMouseUp() {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { hideToolbar(); return; }
    const brief = document.getElementById('briefContent');
    const range = sel.getRangeAt(0);
    if (!brief.contains(range.commonAncestorContainer)) { hideToolbar(); return; }
    const rect = range.getBoundingClientRect();
    showToolbar(rect.left + rect.width / 2, rect.top);
  }, 10);
}

function initAnnotations() {
  const brief = document.getElementById('briefContent');
  if (!brief) return;
  _originalBriefHTML = brief.innerHTML;
  restoreAnnotations();

  document.addEventListener('mouseup', onMouseUp);

  toolbar.addEventListener('mousedown', e => {
    const btn = e.target.closest('.ann-btn');
    if (!btn) return;
    e.preventDefault();
    const type = btn.dataset.type;
    const sel  = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0).cloneRange();
    applyAnnotation(type, range);
    hideToolbar();
  });

  document.addEventListener('mousedown', e => {
    if (!toolbar.contains(e.target)) hideToolbar();
  });

  document.getElementById('btnClearAnnotations')
    .addEventListener('click', () => clearAnnotations(false));
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  restoreFromStorage();
  restoreUnlockedParts();
  updateProgress();

  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveToStorage);
  });

  // Block paste & drag-drop on all answer textareas
  document.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('paste', e => e.preventDefault());
    ta.addEventListener('drop',  e => e.preventDefault());
  });

  // Continue buttons
  Object.keys(PART_CONFIG).forEach(btnId => {
    document.getElementById(btnId)
      ?.addEventListener('click', () => handleContinue(btnId));
  });

  // Download PDF
  document.getElementById('btnDownload').addEventListener('click', () => {
    if (!validate()) return;
    generatePDF();
    postToSheets(
      document.getElementById('studentName').value.trim(),
      document.getElementById('studentEmail').value.trim(),
    );
  });

  // Clear form
  document.getElementById('btnClear').addEventListener('click', clearForm);

  // Annotations
  initAnnotations();
});
