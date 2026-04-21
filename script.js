// ═══════════════════════════════════════════════════════════════
//  PR-190: Relationship Breakdown Case Analysis — Group Worksheet
//  Real-time collaboration via Supabase
// ═══════════════════════════════════════════════════════════════

// ── GOOGLE SHEETS WEBHOOK ────────────────────────────────────────
// Paste your deployed Apps Script Web App URL here after setup
const SHEETS_WEBHOOK_URL = '';

// ── SUPABASE CONFIG ─────────────────────────────────────────────
const SUPABASE_URL = 'https://tfltgoufgimhhkeuvtgp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmbHRnb3VmZ2ltaGhrZXV2dGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjg2MDYsImV4cCI6MjA5MTcwNDYwNn0.mzLjt1gE00oDeUBMpny8TVYMRa0gFUrGaMaJrBO_hr4';

// ── SESSION KEYS ────────────────────────────────────────────────
const SESSION_KEY  = 'pr190-session';
const PROGRESS_KEY = 'pr190-progress';

// ── WORKSHEET FIELD IDs ─────────────────────────────────────────
const WORKSHEET_FIELDS = [
  'p1_core_issue',
  'p1_factors_checks',       // hidden input — serialized checkbox state
  'p1_factors_explanation',
  'p2_breakdown_point',
  'p2_red_flags',
  'p2_responsibility',
  'p3_reputation',
  'p3_audience',
  'p3_pr_issue',
  'p4_immediate',
  'p4_communication',
  'p4_prevention',
  'p4_relationship',
  'p5_takeaway',
  'p5_opinion',
];

// Fields that have a textarea element (for decoration + event wiring)
const TEXTAREA_FIELDS = WORKSHEET_FIELDS.filter(id => id !== 'p1_factors_checks');

const P1_FIELDS = ['p1_core_issue', 'p1_factors_explanation'];
const P2_FIELDS = WORKSHEET_FIELDS.filter(id => id.startsWith('p2_'));
const P3_FIELDS = WORKSHEET_FIELDS.filter(id => id.startsWith('p3_'));
const P4_FIELDS = WORKSHEET_FIELDS.filter(id => id.startsWith('p4_'));
const P5_FIELDS = WORKSHEET_FIELDS.filter(id => id.startsWith('p5_'));

// ── SESSION STATE ────────────────────────────────────────────────
let myName       = '';
let groupCode    = '';
let sb           = null;   // Supabase client
let rtChannel    = null;   // Realtime channel
let saveTimers   = {};     // Per-field debounce timers
let typingTimers = {};     // Per-field typing indicator timers
let attributions = {};     // fieldId → array of editor names

// ── INIT SUPABASE ────────────────────────────────────────────────
function initSupabase() {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ── GROUP CODE GENERATION ────────────────────────────────────────
// Avoids O/0 and I/1 to prevent confusion when sharing verbally
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── JOIN SESSION ─────────────────────────────────────────────────
async function joinSession(name, code) {
  myName    = name.trim();
  groupCode = code.trim().toUpperCase();
  setJoinStatus('Connecting…', 'loading');

  try {
    await sb.from('pr190_groups')
      .upsert({ group_code: groupCode }, { onConflict: 'group_code' });

    await sb.from('pr190_members')
      .insert({ group_code: groupCode, member_name: myName });

    await loadFromSupabase();
    subscribeToRealtime();

    localStorage.setItem(SESSION_KEY, JSON.stringify({ name: myName, groupCode }));
    activateWorksheet();
    setJoinStatus(`Connected as ${myName}  ·  Group ${groupCode}`, 'connected');
    updateMemberBar();

  } catch (err) {
    console.error('Join error:', err);
    setJoinStatus('Could not connect. Check your connection and try again.', 'error');
  }
}

// ── LOAD ALL FIELDS FROM SUPABASE ────────────────────────────────
async function loadFromSupabase() {
  const { data, error } = await sb
    .from('pr190_responses')
    .select('field_id, value, last_edited_by, editors')
    .eq('group_code', groupCode);

  if (error) { console.warn('Load error:', error); return; }

  (data || []).forEach(({ field_id, value, last_edited_by, editors }) => {
    const el = document.getElementById(field_id);
    if (el) el.value = value;

    if (field_id === 'p1_factors_checks') {
      applyCheckboxState(value);
    }

    const names = editors ? editors.split(',').map(n => n.trim()).filter(Boolean) : [];
    if (!names.length && last_edited_by) names.push(last_edited_by);
    if (names.length) {
      attributions[field_id] = names;
      setAttribution(field_id, names);
    }
  });

  updateProgress();
}

// ── CHECKBOX STATE HELPERS ───────────────────────────────────────
function applyCheckboxState(value) {
  const checked = (value || '').split(',').map(s => s.trim()).filter(Boolean);
  document.querySelectorAll('.factor-cb').forEach(cb => {
    cb.checked = checked.includes(cb.dataset.value);
  });
}

function getCheckboxState() {
  const checked = [];
  document.querySelectorAll('.factor-cb:checked').forEach(cb => {
    checked.push(cb.dataset.value);
  });
  return checked.join(',');
}

// ── SAVE FIELD TO SUPABASE (debounced 1.5s) ──────────────────────
function queueSave(fieldId, value) {
  clearTimeout(saveTimers[fieldId]);
  saveTimers[fieldId] = setTimeout(() => saveField(fieldId, value), 1500);
}

async function saveField(fieldId, value) {
  if (!groupCode || !sb) return;

  const existing = attributions[fieldId] || [];
  const editors  = [...existing];
  if (!editors.includes(myName)) editors.push(myName);

  const { error } = await sb.from('pr190_responses').upsert(
    {
      group_code:     groupCode,
      field_id:       fieldId,
      value:          value,
      last_edited_by: myName,
      editors:        editors.join(', '),
      updated_at:     new Date().toISOString(),
    },
    { onConflict: 'group_code,field_id' }
  );

  if (!error) {
    attributions[fieldId] = editors;
    setAttribution(fieldId, editors);
    showSaveNotice();
  }
}

// ── BROADCAST (live keystroke sync, sub-100ms) ────────────────────
function broadcastChange(fieldId, value) {
  if (!rtChannel) return;
  rtChannel.send({
    type:    'broadcast',
    event:   'field_change',
    payload: { fieldId, value, name: myName },
  });
}

// ── REALTIME SUBSCRIPTION ────────────────────────────────────────
function subscribeToRealtime() {
  if (rtChannel) rtChannel.unsubscribe();

  rtChannel = sb.channel(`pr190:${groupCode}`, {
    config: { presence: { key: myName } },
  });

  // Live typing from teammates
  rtChannel.on('broadcast', { event: 'field_change' }, ({ payload }) => {
    if (payload.name === myName) return;
    const el = document.getElementById(payload.fieldId);
    if (el) el.value = payload.value;
    if (payload.fieldId === 'p1_factors_checks') {
      applyCheckboxState(payload.value);
    }
    showTypingIndicator(payload.fieldId, payload.name);
    updateProgress();
  });

  // Presence: who is online
  rtChannel.on('presence', { event: 'sync' }, () => {
    updatePresenceIndicators(rtChannel.presenceState());
    updateMemberBar();
  });
  rtChannel.on('presence', { event: 'join' }, () => updateMemberBar());
  rtChannel.on('presence', { event: 'leave' }, () => updateMemberBar());

  // Postgres changes: sync saved values for late joiners
  ['INSERT', 'UPDATE'].forEach(evt => {
    rtChannel.on(
      'postgres_changes',
      { event: evt, schema: 'public', table: 'pr190_responses',
        filter: `group_code=eq.${groupCode}` },
      ({ new: row }) => {
        if (row.last_edited_by === myName) return;
        const el = document.getElementById(row.field_id);
        if (el && el.value !== row.value) el.value = row.value;
        if (row.field_id === 'p1_factors_checks') {
          applyCheckboxState(row.value);
        }
        const names = row.editors ? row.editors.split(',').map(n => n.trim()).filter(Boolean) : [];
        if (!names.length && row.last_edited_by) names.push(row.last_edited_by);
        attributions[row.field_id] = names;
        setAttribution(row.field_id, names);
        updateProgress();
      }
    );
  });

  rtChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await rtChannel.track({ name: myName, focusedField: null });
    }
  });
}

// ── PRESENCE: TRACK FOCUS ────────────────────────────────────────
async function trackFocus(fieldId) {
  if (!rtChannel) return;
  await rtChannel.track({ name: myName, focusedField: fieldId });
}

async function trackBlur() {
  if (!rtChannel) return;
  await rtChannel.track({ name: myName, focusedField: null });
}

// ── TYPING INDICATOR ─────────────────────────────────────────────
function showTypingIndicator(fieldId, name) {
  const ind = document.getElementById(`typing-${fieldId}`);
  if (!ind) return;
  ind.textContent = `${name} is typing…`;
  ind.classList.add('visible');
  clearTimeout(typingTimers[fieldId]);
  typingTimers[fieldId] = setTimeout(() => {
    ind.classList.remove('visible');
    ind.textContent = '';
  }, 2500);
}

function updatePresenceIndicators(state) {
  document.querySelectorAll('.typing-indicator').forEach(el => {
    el.classList.remove('visible');
    el.textContent = '';
  });
  Object.values(state || {}).flat().forEach(p => {
    if (p.name === myName || !p.focusedField) return;
    const ind = document.getElementById(`typing-${p.focusedField}`);
    if (ind) {
      ind.textContent = `${p.name} is here`;
      ind.classList.add('visible');
    }
  });
}

// ── MEMBER BAR ───────────────────────────────────────────────────
async function updateMemberBar() {
  const bar     = document.getElementById('memberBar');
  const barWrap = document.getElementById('memberBarWrap');
  if (!bar || !groupCode || !sb) return;

  const { data } = await sb
    .from('pr190_members')
    .select('member_name')
    .eq('group_code', groupCode);

  const members = [...new Set((data || []).map(r => r.member_name))];
  bar.innerHTML = members
    .map(n => `<span class="member-pill${n === myName ? ' me' : ''}">${n}</span>`)
    .join('');
  barWrap.style.display = members.length ? 'flex' : 'none';
}

// ── ATTRIBUTION ("— Name, Name" after question label) ────────────
function setAttribution(fieldId, names) {
  const span = document.getElementById(`attr-${fieldId}`);
  if (!span) return;
  const list = Array.isArray(names) ? names : (names ? [names] : []);
  span.textContent = list.length ? ` \u2014 ${list.join(', ')}` : '';
}

// Dynamically adds attribution + typing indicator elements near each textarea
function initFieldDecorations() {
  TEXTAREA_FIELDS.forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (!el || el.tagName !== 'TEXTAREA') return;

    const container = el.closest('.reflection-item, .rewrite-item');
    if (!container) return;

    const label = container.querySelector('.reflection-q, .rewrite-label');
    if (!label) return;

    if (!document.getElementById(`attr-${fieldId}`)) {
      const attrSpan = document.createElement('span');
      attrSpan.id        = `attr-${fieldId}`;
      attrSpan.className = 'field-attribution';
      label.appendChild(attrSpan);
    }

    if (!document.getElementById(`typing-${fieldId}`)) {
      const typingEl = document.createElement('div');
      typingEl.id        = `typing-${fieldId}`;
      typingEl.className = 'typing-indicator';
      container.insertBefore(typingEl, el);
    }
  });
}

// ── ACTIVATE WORKSHEET ───────────────────────────────────────────
function activateWorksheet() {
  document.getElementById('studentName').value = myName;
}

// ── JOIN STATUS ──────────────────────────────────────────────────
function setJoinStatus(msg, type) {
  const el = document.getElementById('joinStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = `join-status join-status-${type}`;
}

// ── SAVE NOTICE ──────────────────────────────────────────────────
let _saveNoticeTimer;
function showSaveNotice() {
  const el = document.getElementById('saveNotice');
  if (!el) return;
  el.textContent   = 'Saved';
  el.style.opacity = '1';
  clearTimeout(_saveNoticeTimer);
  _saveNoticeTimer = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

// ── PROGRESS BAR ─────────────────────────────────────────────────
function updateProgress() {
  const allFilled = (ids) => ids.every(id => {
    const el = document.getElementById(id);
    return el && el.value.trim().length > 0;
  });

  const stateMap = {
    'dot-p1': allFilled(P1_FIELDS),
    'dot-p2': allFilled(P2_FIELDS),
    'dot-p3': allFilled(P3_FIELDS),
    'dot-p4': allFilled(P4_FIELDS),
    'dot-p5': allFilled(P5_FIELDS),
  };

  let done = 0;
  Object.entries(stateMap).forEach(([dotId, complete]) => {
    if (complete) done++;
    document.getElementById(dotId)?.classList.toggle('done', complete);
  });

  const pct   = Math.round((done / 5) * 100);
  const fill  = document.getElementById('progressFill');
  const label = document.getElementById('progressPct');
  if (fill)  fill.style.width  = pct + '%';
  if (label) label.textContent = pct + '%';
}

// ── VALIDATION ───────────────────────────────────────────────────
const REQUIRED_FIELDS = [
  { id: 'p1_core_issue',          label: 'Part 1, Q1' },
  { id: 'p1_factors_explanation', label: 'Part 1, Q2 Explanation' },
  { id: 'p2_breakdown_point',     label: 'Part 2, Q3' },
  { id: 'p2_red_flags',           label: 'Part 2, Q4' },
  { id: 'p2_responsibility',      label: 'Part 2, Q5' },
  { id: 'p3_reputation',          label: 'Part 3, Q6' },
  { id: 'p3_audience',            label: 'Part 3, Q7' },
  { id: 'p3_pr_issue',            label: 'Part 3, Q8' },
  { id: 'p4_immediate',           label: 'Part 4, Q9' },
  { id: 'p4_communication',       label: 'Part 4, Q10' },
  { id: 'p4_prevention',          label: 'Part 4, Q11' },
  { id: 'p4_relationship',        label: 'Part 4, Q12' },
  { id: 'p5_takeaway',            label: 'Part 5, Q13' },
  { id: 'p5_opinion',             label: 'Part 5, Q14' },
];

function validate() {
  const msg = document.getElementById('validationMsg');

  if (!myName || !groupCode) {
    msg.textContent = 'Please join a session before downloading.';
    document.getElementById('sec-info').scrollIntoView({ behavior: 'smooth' });
    return false;
  }

  const missing = REQUIRED_FIELDS.filter(f => {
    const el = document.getElementById(f.id);
    return !el || !el.value.trim();
  });

  if (missing.length > 0) {
    msg.textContent = `Please complete all fields before downloading. Missing: ${missing.map(f => f.label).join(', ')}`;
    const firstEl = document.getElementById(missing[0].id);
    if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  msg.textContent = '';
  return true;
}

// ── SCROLL SPY ───────────────────────────────────────────────────
function initScrollSpy() {
  const sections = [
    'sec-info', 'sec-overview', 'sec-scenario',
    'sec-p1', 'sec-p2', 'sec-p3', 'sec-p4', 'sec-p5', 'sec-submit'
  ];
  const links = document.querySelectorAll('.sidebar-nav a');

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const sidebar  = document.getElementById('sidebarNav');
  const joinCard = document.getElementById('sec-info');
  const stickyTop = 110;

  function updateSidebar() {
    if (!sidebar || !joinCard) return;
    const joinTop = joinCard.getBoundingClientRect().top;
    sidebar.style.top = Math.max(stickyTop, joinTop) + 'px';

    const scrollY = window.scrollY + 120;
    let activeId = sections[0];
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) activeId = id;
    }
    links.forEach(link => {
      link.classList.toggle('active', link.dataset.target === activeId);
    });
  }

  sidebar.style.visibility = 'hidden';
  window.addEventListener('load', () => {
    requestAnimationFrame(() => { updateSidebar(); sidebar.style.visibility = ''; });
  });
  setTimeout(() => { updateSidebar(); sidebar.style.visibility = ''; }, 500);

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateSidebar(); ticking = false; });
  });
}

// ── CLEAR FORM ───────────────────────────────────────────────────
function clearForm() {
  if (!confirm('Clear all answers and start over? This cannot be undone.')) return;
  WORKSHEET_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('.factor-cb').forEach(cb => { cb.checked = false; });
  WORKSHEET_FIELDS.forEach(id => setAttribution(id, []));
  updateProgress();
  showSaveNotice();
}

// ── GOOGLE SHEETS SUBMISSION ─────────────────────────────────────
async function submitToGoogleSheets(memberNames) {
  if (!SHEETS_WEBHOOK_URL) return;

  const payload = {
    submittedAt:           new Date().toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }),
    groupCode:             groupCode,
    members:               memberNames,
    p1_core_issue:         document.getElementById('p1_core_issue')?.value.trim()         || '',
    p1_factors_checks:     document.getElementById('p1_factors_checks')?.value.trim()     || '',
    p1_factors_explanation:document.getElementById('p1_factors_explanation')?.value.trim()|| '',
    p2_breakdown_point:    document.getElementById('p2_breakdown_point')?.value.trim()    || '',
    p2_red_flags:          document.getElementById('p2_red_flags')?.value.trim()          || '',
    p2_responsibility:     document.getElementById('p2_responsibility')?.value.trim()     || '',
    p3_reputation:         document.getElementById('p3_reputation')?.value.trim()         || '',
    p3_audience:           document.getElementById('p3_audience')?.value.trim()           || '',
    p3_pr_issue:           document.getElementById('p3_pr_issue')?.value.trim()           || '',
    p4_immediate:          document.getElementById('p4_immediate')?.value.trim()          || '',
    p4_communication:      document.getElementById('p4_communication')?.value.trim()      || '',
    p4_prevention:         document.getElementById('p4_prevention')?.value.trim()         || '',
    p4_relationship:       document.getElementById('p4_relationship')?.value.trim()       || '',
    p5_takeaway:           document.getElementById('p5_takeaway')?.value.trim()           || '',
    p5_opinion:            document.getElementById('p5_opinion')?.value.trim()            || '',
  };

  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('Sheets submission failed (non-blocking):', err);
  }
}

// ── PDF GENERATION ────────────────────────────────────────────────
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const margin   = 20;
  const pageW    = 215.9;
  const contentW = pageW - margin * 2;
  let y = margin;

  const navy  = [0,   51,  102];
  const gold  = [229, 168,  35];
  const black = [26,   26,  46];
  const gray  = [107, 114, 128];
  const blue  = [55,  138, 221];

  // Fetch all group members
  let memberNames = myName;
  if (groupCode && sb) {
    const { data } = await sb
      .from('pr190_members')
      .select('member_name')
      .eq('group_code', groupCode);
    if (data?.length) {
      memberNames = [...new Set(data.map(r => r.member_name))].join(', ');
    }
  }

  const courseLabel   = document.querySelector('.course-label')?.textContent?.trim() || 'PR 190';
  const activityTitle = document.querySelector('.header-title h1')?.textContent?.trim() || 'Relationship Breakdown Case Analysis';
  const now           = new Date();
  const downloadedAt  = now.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const downloadedShort = now.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // ── Helpers ──────────────────────────────────────────────────────
  function checkNewPage(needed = 12) {
    if (y + needed > 268) { doc.addPage(); y = margin; }
  }

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
    doc.text('Downloaded: ' + downloadedShort, margin, 25);
    y = 36;
  }

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

  function questionLabel(text, editors) {
    checkNewPage(8);
    doc.setTextColor(...navy);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const display = text.length > 100 ? text.substring(0, 97) + '...' : text;
    doc.text(display, margin, y);
    const list = Array.isArray(editors) ? editors : (editors ? [editors] : []);
    if (list.length) {
      const labelW = doc.getTextWidth(display);
      doc.setTextColor(...gray);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(` \u2014 ${list.join(', ')}`, margin + labelW, y);
    }
    y += 5;
  }

  function answerText(id) {
    const val = (document.getElementById(id)?.value || '').trim() || '(no response)';
    doc.setTextColor(...black);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.splitTextToSize(val, contentW).forEach(line => {
      checkNewPage(6);
      doc.text(line, margin, y);
      y += 5.2;
    });
    y += 3;
  }

  function subLabel(text) {
    checkNewPage(6);
    doc.setTextColor(...gray);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'italic');
    doc.text(text, margin + 2, y);
    y += 4.5;
  }

  // ── Build PDF ─────────────────────────────────────────────────────
  drawHeader();

  // Group info box
  doc.setFillColor(242, 244, 247);
  doc.roundedRect(margin, y, contentW, 18, 2, 2, 'F');
  doc.setTextColor(...gray);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('GROUP MEMBERS', margin + 4, y + 5);
  doc.text('GROUP CODE', margin + 120, y + 5);
  doc.setTextColor(...black);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  const memberDisplay = memberNames.length > 60 ? memberNames.substring(0, 57) + '...' : memberNames;
  doc.text(memberDisplay || '\u2014', margin + 4, y + 12);
  doc.text(groupCode || '\u2014', margin + 120, y + 12);
  y += 22;

  // Timestamp box
  doc.setFillColor(255, 248, 230);
  doc.setDrawColor(...gold);
  doc.roundedRect(margin, y, contentW, 12, 1, 1, 'FD');
  doc.setTextColor(...gray);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('DOWNLOADED AT:', margin + 4, y + 4.5);
  doc.setTextColor(80, 60, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(downloadedAt, margin + 4, y + 9);
  y += 18;

  // Part 1
  sectionTitle('Part 1 \u2014 Scenario Analysis');

  questionLabel('Q1. What is the core issue in this partnership?', attributions['p1_core_issue']);
  answerText('p1_core_issue');

  questionLabel('Q2. What factors contributed to this issue?', attributions['p1_factors_checks']);
  const checkedFactors = document.getElementById('p1_factors_checks')?.value;
  if (checkedFactors) {
    subLabel('Selected: ' + checkedFactors.split(',').join(', '));
  }
  questionLabel('Q2. Explanation', attributions['p1_factors_explanation']);
  answerText('p1_factors_explanation');

  // Part 2
  sectionTitle('Part 2 \u2014 Breakdown Point');
  questionLabel('Q3. At what point did the relationship begin to break down?', attributions['p2_breakdown_point']);
  answerText('p2_breakdown_point');
  questionLabel('Q4. What warning signs were present before the issue escalated?', attributions['p2_red_flags']);
  answerText('p2_red_flags');
  questionLabel('Q5. Which party holds the most responsibility for the breakdown?', attributions['p2_responsibility']);
  answerText('p2_responsibility');

  // Part 3
  sectionTitle('Part 3 \u2014 PR Impact');
  questionLabel('Q6. How could this situation impact the brand\'s reputation?', attributions['p3_reputation']);
  answerText('p3_reputation');
  questionLabel('Q7. How might audiences interpret this situation?', attributions['p3_audience']);
  answerText('p3_audience');
  questionLabel('Q8. Why is this a PR issue, not just an operational issue?', attributions['p3_pr_issue']);
  answerText('p3_pr_issue');

  // Part 4
  sectionTitle('Part 4 \u2014 Fix Strategy');
  questionLabel('Q9. What should the brand do immediately? (2+ actions)', attributions['p4_immediate']);
  answerText('p4_immediate');
  questionLabel('Q10. How should the brand communicate with the influencer?', attributions['p4_communication']);
  answerText('p4_communication');
  questionLabel('Q11. What long-term changes should the brand make?', attributions['p4_prevention']);
  answerText('p4_prevention');
  questionLabel('Q12. How could better relationship management have prevented this?', attributions['p4_relationship']);
  answerText('p4_relationship');

  // Part 5
  sectionTitle('Part 5 \u2014 Reflection');
  questionLabel('Q13. What is one key takeaway about influencer relations and PR?', attributions['p5_takeaway']);
  answerText('p5_takeaway');
  questionLabel('Q14. What matters more in influencer partnerships: control or trust?', attributions['p5_opinion']);
  answerText('p5_opinion');

  // Google Drive upload reminder box
  checkNewPage(44);
  y += 6;
  doc.setFillColor(224, 240, 255);
  doc.setDrawColor(55, 138, 221);
  doc.roundedRect(margin, y, contentW, 38, 2, 2, 'FD');
  doc.setTextColor(...navy);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('\uD83D\uDCC1  NEXT STEP: Upload to Google Drive', margin + 4, y + 8);
  doc.setTextColor(...black);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text('After downloading, upload this PDF to your Group Folder in Google Drive:', margin + 4, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...navy);
  doc.text('Google Drive  \u2192  Your Group Folder  \u2192  Worksheet Packet', margin + 4, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gray);
  doc.setFontSize(8.5);
  doc.text('One submission per group. Ensure all group members have access to the shared folder before uploading.', margin + 4, y + 30);
  doc.text('Unit 5: Relationship Management, Risk & Crisis  |  Week 14 Activity', margin + 4, y + 35);
  y += 44;

  // Footer on every page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy);
    doc.rect(0, 274, pageW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${courseLabel}  |  Relationship Breakdown Case Analysis  |  Group: ${groupCode}  |  Page ${i} of ${pageCount}`.substring(0, 95),
      margin, 282
    );
  }

  doc.save(`PR190-Relationship-Breakdown-Group-${groupCode || 'Unknown'}.pdf`);
}

// ── DOMContentLoaded ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initFieldDecorations();
  updateProgress();
  initScrollSpy();

  // Generate code button
  document.getElementById('btnGenerate')?.addEventListener('click', () => {
    const input = document.getElementById('groupCodeInput');
    if (input) input.value = generateCode();
  });

  // Join button
  document.getElementById('btnJoin')?.addEventListener('click', () => {
    const name = document.getElementById('nameInput').value.trim();
    const code = document.getElementById('groupCodeInput').value.trim();
    if (!name) { setJoinStatus('Please enter your name.', 'error'); return; }
    if (!code) { setJoinStatus('Please enter or generate a group code.', 'error'); return; }
    joinSession(name, code);
  });

  // Allow Enter key to submit join form
  ['nameInput', 'groupCodeInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnJoin')?.click();
    });
  });

  // Auto-rejoin from saved session
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.name && saved?.groupCode) {
      document.getElementById('nameInput').value      = saved.name;
      document.getElementById('groupCodeInput').value = saved.groupCode;
      joinSession(saved.name, saved.groupCode);
    }
  } catch (e) { /* ignore */ }

  // Wire up all textarea fields
  TEXTAREA_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.addEventListener('input', () => {
      broadcastChange(id, el.value);
      queueSave(id, el.value);
      updateProgress();
    });
    el.addEventListener('focus', () => trackFocus(id));
    el.addEventListener('blur',  () => trackBlur());
    el.addEventListener('paste', e => e.preventDefault());
    el.addEventListener('drop',  e => e.preventDefault());
  });

  // Wire up checkboxes → serialize to hidden input → broadcast + save
  document.querySelectorAll('.factor-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const state = getCheckboxState();
      const hidden = document.getElementById('p1_factors_checks');
      if (hidden) hidden.value = state;
      broadcastChange('p1_factors_checks', state);
      queueSave('p1_factors_checks', state);
    });
  });

  // Download PDF + submit to Google Sheets
  document.getElementById('btnDownload')?.addEventListener('click', async () => {
    if (!validate()) return;

    // Resolve member names (same logic as generatePDF uses)
    let memberNames = myName;
    if (groupCode && sb) {
      const { data } = await sb
        .from('pr190_members')
        .select('member_name')
        .eq('group_code', groupCode);
      if (data?.length) {
        memberNames = [...new Set(data.map(r => r.member_name))].join(', ');
      }
    }

    // Fire Sheets submission and PDF generation in parallel
    submitToGoogleSheets(memberNames);
    generatePDF();
  });

  // Clear form
  document.getElementById('btnClear')?.addEventListener('click', clearForm);
});
