/* ── CONFIG ─────────────────────────────────────────────────────────────── */
const API = 'http://localhost:3001';

/* ── STATE ──────────────────────────────────────────────────────────────── */
const state = {
  docId: '',
  figures: [],      // [{ id, number, title, graphicSrc, hotspots }]
  sections: [],     // [{ id, number, title, level }]
  hotspots: {},     // { [figId]: [{ x,y,w,h,label,desc,target }] }
  approval: {},     // { [figId]: boolean }
  ocrConfidence: parseInt(localStorage.getItem('ocrConfidence') || '50', 10),

  // fullscreen
  fsFigId: null,
  fsSelectedIdx: null,
  fsDrawing: false,
  fsDrawStart: { x: 0, y: 0 },
  fsDrawRect: null,
  fsOcrPending: false,
  fsPanelVisible: true,
};

/* ── API HELPERS ─────────────────────────────────────────────────────────── */
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(url, body) {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiPut(url, body) {
  return apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

/* ── API CALLS ───────────────────────────────────────────────────────────── */
function imageUrl(docId, graphicSrc) {
  const filename = graphicSrc.replace(/^images\//, '');
  const encoded = filename.split('/').map(encodeURIComponent).join('/');
  return `${API}/api/images/${encodeURIComponent(docId)}/${encoded}`;
}

async function loadDocuments() {
  return apiFetch(`${API}/api/documents`);
}

async function loadDocument(docId) {
  const [figures, sections] = await Promise.all([
    apiFetch(`${API}/api/documents/${encodeURIComponent(docId)}/figures`),
    apiFetch(`${API}/api/documents/${encodeURIComponent(docId)}/sections`),
  ]);
  return { figures, sections };
}

async function apiAiDetect(docId, figId) {
  return apiPost(
    `${API}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/ai-detect?confidence=${state.ocrConfidence}`,
    {}
  );
}

async function apiRematch(docId, figId) {
  return apiPost(
    `${API}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/rematch`,
    { hotspots: state.hotspots[figId] || [] }
  );
}

async function apiRematchAll(docId) {
  return apiPost(`${API}/api/documents/${encodeURIComponent(docId)}/rematch-all`, {});
}

async function apiWriteFigure(docId, figId, hotspots) {
  return apiPut(
    `${API}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/hotspots`,
    { hotspots }
  );
}

async function apiWriteAll(docId, figureHotspots) {
  return apiPost(
    `${API}/api/documents/${encodeURIComponent(docId)}/hotspots`,
    { figures: figureHotspots }
  );
}

async function apiRemoveAll(docId) {
  return apiDelete(`${API}/api/documents/${encodeURIComponent(docId)}/hotspots`);
}

async function apiOcrRegion(docId, figId, x, y, w, h) {
  return apiPost(
    `${API}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/ocr-region`,
    { x, y, w, h }
  );
}

/* ── TOAST ───────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ── SCREEN HELPERS ──────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

/* ── SECTION PICKER ──────────────────────────────────────────────────────── */
// Returns a wrapper div that manages its own dropdown state.
// onChange(sectionId) called on selection.
// dark=true for fullscreen panel styling
function createSectionPicker(value, onChange, dark = false) {
  const sections = state.sections;

  const wrap = document.createElement('div');
  wrap.className = 'section-picker' + (dark ? ' fs-section-picker' : '');

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Select target section...';

  const dropdown = document.createElement('div');
  dropdown.className = 'section-dropdown';

  wrap.appendChild(input);
  wrap.appendChild(dropdown);

  let isOpen = false;

  function getLabel(id) {
    if (!id) return '';
    const s = sections.find(x => x.id === id);
    return s ? `${s.number} — ${s.title}` : id;
  }

  function renderOptions(query) {
    dropdown.innerHTML = '';
    const q = (query || '').toLowerCase();
    const filtered = sections.filter(s => {
      if (!q) return true;
      return s.number.toLowerCase().includes(q) ||
             s.title.toLowerCase().includes(q) ||
             s.id.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'section-option-empty';
      empty.textContent = 'No sections found';
      dropdown.appendChild(empty);
      return;
    }

    filtered.forEach(s => {
      const opt = document.createElement('div');
      opt.className = 'section-option' + (s.id === value ? ' selected' : '');
      opt.innerHTML = `<span class="sec-num">${s.number}</span><span class="sec-title">${s.title}</span>`;
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        value = s.id;
        input.value = getLabel(s.id);
        closeDropdown();
        onChange(s.id);
      });
      dropdown.appendChild(opt);
    });
  }

  function openDropdown() {
    isOpen = true;
    dropdown.classList.add('open');
    renderOptions(input.value);
  }

  function closeDropdown() {
    isOpen = false;
    dropdown.classList.remove('open');
    // Only restore the matched label if user didn't type something new
    if (value) input.value = getLabel(value);
  }

  input.value = getLabel(value);

  input.addEventListener('focus', () => {
    // Select all text so user can immediately type to replace — don't wipe it
    input.select();
    openDropdown();
  });

  input.addEventListener('input', () => {
    // If user clears the field, clear the current selection too
    if (!input.value) {
      value = '';
      onChange('');
    }
    renderOptions(input.value);
    if (!isOpen) openDropdown();
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      closeDropdown();
    }, 150);
  });

  // expose a method to update the current value from outside
  wrap._setValue = (id) => {
    value = id;
    input.value = getLabel(id);
  };

  return wrap;
}

/* ── RENDER: FIGURE CARDS ────────────────────────────────────────────────── */
function renderFigures() {
  const list = document.getElementById('figures-list');
  list.innerHTML = '';

  if (!state.docId || state.figures.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = state.docId
      ? '<p>No figures found in this document.</p>'
      : '<p>Select a document to start annotating hotspots.</p>';
    list.appendChild(empty);
    renderApprovalPanel();
    return;
  }

  state.figures.forEach(fig => {
    list.appendChild(buildFigureCard(fig));
  });

  renderApprovalPanel();
}

function buildFigureCard(fig) {
  const hotspots = state.hotspots[fig.id] || [];
  const card = document.createElement('div');
  card.className = 'figure-card';
  card.id = `fig-card-${fig.id}`;

  // ── Image column
  const imgCol = document.createElement('div');
  imgCol.className = 'figure-image-col';

  const label = document.createElement('div');
  label.className = 'fig-label';
  label.textContent = `Figure ${fig.number}: ${fig.title}`;
  imgCol.appendChild(label);

  const img = document.createElement('img');
  img.className = 'figure-thumb';
  img.src = imageUrl(state.docId, fig.graphicSrc);
  img.alt = fig.title;
  img.addEventListener('click', () => openFullscreen(fig.id));
  img.addEventListener('error', () => {
    img.style.display = 'none';
    const ph = document.createElement('div');
    ph.className = 'figure-thumb-placeholder';
    ph.innerHTML = `<span style="font-size:22px;margin-bottom:6px;">⚠</span><span>Image not found</span><span style="font-size:11px;color:#fca5a5;margin-top:4px;word-break:break-all;">${fig.graphicSrc}</span>`;
    imgCol.insertBefore(ph, img.nextSibling);
  });
  imgCol.appendChild(img);

  const fsBtn = document.createElement('button');
  fsBtn.className = 'btn-fullscreen';
  fsBtn.textContent = 'Open Fullscreen & Select Regions';
  fsBtn.addEventListener('click', () => openFullscreen(fig.id));
  imgCol.appendChild(fsBtn);

  // ── Hotspot panel
  const panel = document.createElement('div');
  panel.className = 'hotspot-panel';

  const panelHeader = document.createElement('div');
  panelHeader.className = 'hotspot-panel-header';

  const h3 = document.createElement('h3');
  h3.textContent = 'Hotspots';
  panelHeader.appendChild(h3);

  const actions = document.createElement('div');
  actions.className = 'hotspot-actions';

  function makeBtn(label, cls, handler) {
    const b = document.createElement('button');
    b.className = cls;
    b.style.fontSize = '12px';
    b.style.padding = '4px 9px';
    b.textContent = label;
    b.addEventListener('click', handler);
    return b;
  }

  const btnAI       = makeBtn('AI Detect',         'btn-purple', () => handleAiDetect(fig.id, btnAI));
  const btnRematch  = makeBtn('Re-match',           'btn-teal',   () => handleRematch(fig.id, btnRematch));
  const btnClear    = makeBtn('Clear & Re-detect',  'btn-indigo', () => handleClearRedetect(fig.id, btnClear));
  const btnWrite    = makeBtn('Write to XML',       'btn-green',  () => handleWriteFigure(fig.id, btnWrite));
  const btnRmUnm    = makeBtn('Remove Unmatched',   'btn-orange', () => handleRemoveUnmatched(fig.id));
  const btnAdd      = makeBtn('+ Add Hotspot',      'btn-blue',   () => handleAddHotspot(fig.id));

  [btnAI, btnRematch, btnClear, btnWrite, btnRmUnm, btnAdd].forEach(b => actions.appendChild(b));
  panelHeader.appendChild(actions);
  panel.appendChild(panelHeader);

  // Hotspot list
  const hsListEl = document.createElement('div');
  hsListEl.className = 'hotspot-list';
  hsListEl.id = `hs-list-${fig.id}`;
  panel.appendChild(hsListEl);

  renderHotspotList(fig.id, hsListEl);

  // ── Assemble card
  const inner = document.createElement('div');
  inner.className = 'figure-card-inner';
  inner.appendChild(imgCol);
  inner.appendChild(panel);
  card.appendChild(inner);

  return card;
}

function renderHotspotList(figId, container) {
  if (!container) container = document.getElementById(`hs-list-${figId}`);
  if (!container) return;

  container.innerHTML = '';
  const hotspots = state.hotspots[figId] || [];

  if (hotspots.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray" style="padding:8px 0;">No hotspots. Draw on the image or add manually.</p>';
    return;
  }

  hotspots.forEach((hs, idx) => {
    container.appendChild(buildHotspotRow(figId, idx, hs));
  });
}

function buildHotspotRow(figId, idx, hs) {
  const row = document.createElement('div');
  row.className = 'hotspot-row';
  row.id = `hs-row-${figId}-${idx}`;

  // Header
  const header = document.createElement('div');
  header.className = 'hotspot-row-header';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '8px';

  const num = document.createElement('span');
  num.className = 'text-sm text-gray';
  num.textContent = `Hotspot #${idx + 1}`;

  const badge = document.createElement('span');
  badge.className = hs.target ? 'badge badge-matched' : 'badge badge-unmatched';
  badge.textContent = hs.target ? 'Matched' : 'Unmatched';

  left.appendChild(num);
  left.appendChild(badge);

  const delBtn = document.createElement('button');
  delBtn.style.cssText = 'background:none;color:#dc2626;font-size:12px;padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => handleDeleteHotspot(figId, idx));

  header.appendChild(left);
  header.appendChild(delBtn);
  row.appendChild(header);

  // Coordinates
  const coordsRow = document.createElement('div');
  coordsRow.className = 'coords-row';
  ['x', 'y', 'w', 'h'].forEach(field => {
    const f = document.createElement('div');
    f.className = 'coord-field';
    const lbl = document.createElement('label');
    lbl.textContent = `${field} =`;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = hs[field];
    inp.addEventListener('input', e => {
      updateHotspot(figId, idx, { [field]: parseFloat(e.target.value) || 0 }, true);
    });
    f.appendChild(lbl);
    f.appendChild(inp);
    coordsRow.appendChild(f);
  });
  row.appendChild(coordsRow);

  // Label
  row.appendChild(buildFieldRow('Label', hs.label, val => updateHotspot(figId, idx, { label: val }, true), 'Hotspot label'));

  // Desc
  row.appendChild(buildFieldRow('Desc', hs.desc, val => updateHotspot(figId, idx, { desc: val }, true), 'Description'));

  // Target section picker
  const targetRow = document.createElement('div');
  targetRow.className = 'field-row';
  targetRow.style.display = 'flex';
  targetRow.style.alignItems = 'center';
  targetRow.style.gap = '6px';
  const targetLabel = document.createElement('label');
  targetLabel.textContent = 'Target';
  targetLabel.style.cssText = 'width:44px;font-size:12px;color:#6b7280;flex-shrink:0;';
  const picker = createSectionPicker(hs.target, id => {
    updateHotspot(figId, idx, { target: id }, true);
    // Update the badge in-place without re-rendering the whole list
    const badgeEl = row.querySelector('.badge');
    if (badgeEl) {
      badgeEl.className = id ? 'badge badge-matched' : 'badge badge-unmatched';
      badgeEl.textContent = id ? 'Matched' : 'Unmatched';
    }
  });
  picker.style.flex = '1';
  targetRow.appendChild(targetLabel);
  targetRow.appendChild(picker);
  row.appendChild(targetRow);

  return row;
}

function buildFieldRow(labelText, value, onChange, placeholder) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const lbl = document.createElement('label');
  lbl.textContent = labelText;
  lbl.style.cssText = 'width:44px;font-size:12px;color:#6b7280;flex-shrink:0;';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = value;
  inp.placeholder = placeholder || '';
  inp.style.flex = '1';
  // Use 'input' so state stays live while typing; never triggers a re-render
  inp.addEventListener('input', e => onChange(e.target.value));
  row.appendChild(lbl);
  row.appendChild(inp);
  return row;
}

/* ── RENDER: APPROVAL PANEL ──────────────────────────────────────────────── */
function renderApprovalPanel() {
  const panel = document.getElementById('approval-panel');
  const list  = document.getElementById('approval-list');
  const acts  = document.getElementById('approval-actions');

  const figsWithHotspots = state.figures.filter(f => (state.hotspots[f.id] || []).length > 0);

  if (!state.docId || figsWithHotspots.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  list.innerHTML = '';

  const allApproved = figsWithHotspots.length > 0 &&
    figsWithHotspots.every(f => state.approval[f.id]);

  figsWithHotspots.forEach(fig => {
    const count    = (state.hotspots[fig.id] || []).length;
    const approved = state.approval[fig.id] || false;

    const item = document.createElement('div');
    item.className = 'approval-item' + (approved ? ' approved' : '');

    const info = document.createElement('div');
    info.className = 'approval-item-info';
    info.innerHTML = `<span class="fig-num">Fig ${fig.number}</span><span style="color:#6b7280;font-size:11px;"> ${fig.title}</span><span class="fig-count">(${count})</span>`;

    const btn = document.createElement('button');
    btn.style.cssText = `font-size:11px;padding:3px 8px;${approved ? 'background:#16a34a;color:#fff;' : 'background:#e5e7eb;color:#374151;'}`;
    btn.textContent = approved ? 'Approved' : 'Approve';
    btn.addEventListener('click', () => {
      state.approval[fig.id] = !state.approval[fig.id];
      renderApprovalPanel();
    });

    item.appendChild(info);
    item.appendChild(btn);
    list.appendChild(item);
  });

  acts.innerHTML = '';

  const approveAllBtn = document.createElement('button');
  approveAllBtn.className = 'btn-green';
  approveAllBtn.style.cssText = 'width:100%;margin-bottom:8px;padding:7px 0;';
  approveAllBtn.textContent = allApproved ? 'All Approved' : 'Approve All';
  approveAllBtn.disabled = allApproved;
  approveAllBtn.addEventListener('click', () => {
    figsWithHotspots.forEach(f => { state.approval[f.id] = true; });
    renderApprovalPanel();
  });
  acts.appendChild(approveAllBtn);

  const writeAllBtn = document.createElement('button');
  writeAllBtn.className = 'btn-blue';
  writeAllBtn.style.cssText = 'width:100%;padding:7px 0;';
  writeAllBtn.textContent = 'Write All to XML';
  writeAllBtn.disabled = !allApproved;
  writeAllBtn.addEventListener('click', () => handleWriteAll(writeAllBtn));
  acts.appendChild(writeAllBtn);

  if (!allApproved) {
    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:11px;color:#9ca3af;text-align:center;margin-top:6px;';
    hint.textContent = 'Approve all figures with hotspots before writing.';
    acts.appendChild(hint);
  }
}

/* ── HOTSPOT MUTATION HELPERS ────────────────────────────────────────────── */
function updateHotspot(figId, idx, updates, skipRender) {
  const hs = state.hotspots[figId];
  if (!hs || !hs[idx]) return;
  Object.assign(hs[idx], updates);
  state.approval[figId] = false;
  if (skipRender) {
    // Just update approval panel buttons without destroying any focused inputs
    renderApprovalPanel();
    return;
  }
  // Full re-render (only used when structure changes, e.g. delete/add)
  renderHotspotList(figId);
  renderApprovalPanel();
}

function addHotspot(figId, hs) {
  if (!state.hotspots[figId]) state.hotspots[figId] = [];
  state.hotspots[figId].push(hs || { x: 0, y: 0, w: 0, h: 0, label: '', desc: '', target: '' });
  state.approval[figId] = false;
  renderHotspotList(figId);
  renderApprovalPanel();
}

/* ── HANDLERS: PER-FIGURE ────────────────────────────────────────────────── */
async function handleAiDetect(figId, btn) {
  if (!state.docId) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Detecting...';

  try {
    const result = await apiAiDetect(state.docId, figId);
    if (result.hotspots.length === 0) {
      toast('No matching hotspots detected on this image.', 'info');
      return;
    }
    state.hotspots[figId] = result.hotspots;
    state.approval[figId] = false;
    renderHotspotList(figId);
    renderApprovalPanel();
    toast(`AI detected ${result.count} hotspot${result.count !== 1 ? 's' : ''} — review and adjust.`, 'success');
  } catch (err) {
    toast(`AI Detect failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleRematch(figId, btn) {
  if (!state.docId) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Rematching...';
  try {
    const result = await apiRematch(state.docId, figId);
    state.hotspots[figId] = result.hotspots;
    state.approval[figId] = false;
    renderHotspotList(figId);
    renderApprovalPanel();
    toast(`Re-matched ${result.rematched} hotspot${result.rematched !== 1 ? 's' : ''}.`, 'success');
  } catch (err) {
    toast(`Re-match failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleClearRedetect(figId, btn) {
  if (!state.docId) return;
  state.hotspots[figId] = [];
  state.approval[figId] = false;
  renderHotspotList(figId);
  renderApprovalPanel();
  await handleAiDetect(figId, btn);
}

async function handleWriteFigure(figId, btn) {
  if (!state.docId) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await apiWriteFigure(state.docId, figId, state.hotspots[figId] || []);
    toast('Hotspots saved to XML.', 'success');
  } catch (err) {
    toast(`Write failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleRemoveUnmatched(figId) {
  if (!state.docId) return;
  const all = state.hotspots[figId] || [];
  const matched = all.filter(h => h.target !== '');
  const removed = all.length - matched.length;
  state.hotspots[figId] = matched;
  state.approval[figId] = false;
  renderHotspotList(figId);
  renderApprovalPanel();
  try {
    await apiWriteFigure(state.docId, figId, matched);
    toast(`Removed ${removed} unmatched hotspot${removed !== 1 ? 's' : ''}.`, 'success');
  } catch (err) {
    toast(`Failed to sync: ${err.message}`, 'error');
  }
}

function handleAddHotspot(figId) {
  addHotspot(figId);
}

async function handleDeleteHotspot(figId, idx) {
  const remaining = (state.hotspots[figId] || []).filter((_, i) => i !== idx);
  state.hotspots[figId] = remaining;
  state.approval[figId] = false;
  renderHotspotList(figId);
  renderApprovalPanel();
  if (state.docId) {
    try {
      await apiWriteFigure(state.docId, figId, remaining);
      toast('Hotspot deleted.', 'success');
    } catch (err) {
      toast(`Failed to sync deletion: ${err.message}`, 'error');
    }
  }
}

/* ── HANDLERS: GLOBAL ────────────────────────────────────────────────────── */
async function handleAiDetectAll() {
  if (!state.docId || state.figures.length === 0) return;
  const btn = document.getElementById('btn-ai-detect-all');
  btn.disabled = true;
  btn.textContent = 'Detecting...';

  let detected = 0;
  for (let i = 0; i < state.figures.length; i++) {
    const fig = state.figures[i];
    toast(`AI detecting figure ${i + 1}/${state.figures.length}...`, 'info');
    try {
      const result = await apiAiDetect(state.docId, fig.id);
      if (result.hotspots.length > 0) {
        state.hotspots[fig.id] = result.hotspots;
        state.approval[fig.id] = false;
        renderHotspotList(fig.id);
        detected++;
      }
    } catch { /* skip */ }
  }
  renderApprovalPanel();
  toast(`Done — detected hotspots on ${detected} of ${state.figures.length} figures.`, 'success');
  btn.disabled = false;
  btn.textContent = 'AI Detect All';
}

async function handleRematchAll() {
  if (!state.docId) return;
  const btn = document.getElementById('btn-rematch-all');
  btn.disabled = true;
  btn.textContent = 'Rematching...';
  try {
    const result = await apiRematchAll(state.docId);
    // merge result into state
    for (const [figId, hotspots] of Object.entries(result.figures || {})) {
      state.hotspots[figId] = hotspots;
      state.approval[figId] = false;
      renderHotspotList(figId);
    }
    renderApprovalPanel();
    toast(`Re-matched ${result.totalRematched} hotspot${result.totalRematched !== 1 ? 's' : ''} across all figures.`, 'success');
  } catch (err) {
    toast(`Re-match all failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Re-match All Unmatched';
  }
}

async function handleRemoveAllUnmatched() {
  if (!state.docId) return;
  const btn = document.getElementById('btn-remove-unmatched-all');
  btn.disabled = true;
  btn.textContent = 'Removing...';
  try {
    let totalRemoved = 0;
    const payload = {};
    for (const fig of state.figures) {
      const all = state.hotspots[fig.id] || [];
      const matched = all.filter(h => h.target !== '');
      totalRemoved += all.length - matched.length;
      state.hotspots[fig.id] = matched;
      state.approval[fig.id] = false;
      payload[fig.id] = matched;
      renderHotspotList(fig.id);
    }
    await apiWriteAll(state.docId, payload);
    renderApprovalPanel();
    toast(`Removed ${totalRemoved} unmatched hotspot${totalRemoved !== 1 ? 's' : ''} across all figures.`, 'success');
  } catch (err) {
    toast(`Failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remove All Unmatched';
  }
}

async function handleRemoveAll() {
  if (!state.docId) return;
  const btn = document.getElementById('btn-remove-all');
  btn.disabled = true;
  btn.textContent = 'Removing...';
  try {
    await apiRemoveAll(state.docId);
    for (const fig of state.figures) {
      state.hotspots[fig.id] = [];
      state.approval[fig.id] = false;
    }
    renderFigures();
    toast('All hotspots removed from document.', 'success');
  } catch (err) {
    toast(`Failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Remove All Hotspots';
  }
}

async function handleWriteAll(btn) {
  if (!state.docId) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Writing...';
  try {
    const payload = {};
    for (const fig of state.figures) {
      if ((state.hotspots[fig.id] || []).length > 0) {
        payload[fig.id] = state.hotspots[fig.id];
      }
    }
    const result = await apiWriteAll(state.docId, payload);
    toast(result.message || 'All hotspots written to XML.', 'success');
  } catch (err) {
    toast(`Write failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

/* ── FULLSCREEN VIEWER ───────────────────────────────────────────────────── */
function openFullscreen(figId) {
  const fig = state.figures.find(f => f.id === figId);
  if (!fig) return;

  state.fsFigId = figId;
  state.fsSelectedIdx = null;
  state.fsDrawing = false;
  state.fsDrawRect = null;
  state.fsOcrPending = false;
  state.fsPanelVisible = true;

  document.getElementById('fs-title').textContent = `Figure ${fig.number}: ${fig.title}`;
  document.getElementById('fs-image').src = imageUrl(state.docId, fig.graphicSrc);
  document.getElementById('fs-panel').style.display = 'block';
  document.getElementById('fs-toggle-panel').textContent = 'Hide Panel';

  document.getElementById('screen-fullscreen').classList.add('active');

  renderFullscreenHotspots();
  renderFsPanel();
}

function closeFullscreen() {
  document.getElementById('screen-fullscreen').classList.remove('active');
  state.fsFigId = null;
  // clean up draw rect
  const existing = document.getElementById('fs-draw-rect-el');
  if (existing) existing.remove();
}

function renderFullscreenHotspots() {
  const wrap = document.getElementById('fs-image-wrap');
  // remove old hotspot boxes
  wrap.querySelectorAll('.fs-hotspot-box').forEach(el => el.remove());

  const figId = state.fsFigId;
  if (!figId) return;
  const hotspots = state.hotspots[figId] || [];
  const img = document.getElementById('fs-image');
  const iw = img.offsetWidth;
  const ih = img.offsetHeight;
  if (!iw || !ih) return;

  hotspots.forEach((hs, idx) => {
    if (!hs.w && !hs.h) return;
    const box = document.createElement('div');
    box.className = 'fs-hotspot-box' +
      (hs.target ? '' : ' unmatched') +
      (state.fsSelectedIdx === idx ? ' selected' : '');
    box.style.left   = `${(hs.x / 100) * iw}px`;
    box.style.top    = `${(hs.y / 100) * ih}px`;
    box.style.width  = `${(hs.w / 100) * iw}px`;
    box.style.height = `${(hs.h / 100) * ih}px`;

    const lbl = document.createElement('div');
    lbl.className = 'fs-hotspot-label';
    lbl.textContent = hs.label || `#${idx + 1}`;
    box.appendChild(lbl);

    box.addEventListener('click', e => {
      e.stopPropagation();
      state.fsSelectedIdx = idx;
      renderFullscreenHotspots();
      renderFsPanel();
    });

    wrap.appendChild(box);
  });
}

function renderFsPanel() {
  const figId = state.fsFigId;
  const hotspots = state.hotspots[figId] || [];

  document.getElementById('fs-panel-title').textContent = `Hotspots (${hotspots.length})`;

  const list = document.getElementById('fs-hotspot-list');
  list.innerHTML = '';

  if (hotspots.length === 0) {
    list.innerHTML = '<p style="font-size:12px;color:#6b7280;">Draw on the image to create hotspots.</p>';
    return;
  }

  hotspots.forEach((hs, idx) => {
    const item = document.createElement('div');
    item.className = 'fs-hs-item' + (state.fsSelectedIdx === idx ? ' selected' : '');
    item.addEventListener('click', (e) => {
      // Don't re-render if user clicked an input/button inside an already-selected item
      if (state.fsSelectedIdx === idx && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
      state.fsSelectedIdx = idx;
      renderFullscreenHotspots();
      renderFsPanel();
    });

    const header = document.createElement('div');
    header.className = 'fs-hs-item-header';

    const numSpan = document.createElement('span');
    numSpan.className = 'fs-hs-num';
    numSpan.textContent = `#${idx + 1}`;

    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'background:none;color:#f87171;font-size:11px;padding:1px 5px;border:1px solid #f87171;border-radius:3px;';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      handleDeleteHotspot(figId, idx);
      if (state.fsSelectedIdx === idx) state.fsSelectedIdx = null;
      renderFullscreenHotspots();
      renderFsPanel();
    });

    header.appendChild(numSpan);
    header.appendChild(delBtn);
    item.appendChild(header);

    if (state.fsSelectedIdx === idx) {
      // Coords row
      const coordsRow = document.createElement('div');
      coordsRow.className = 'fs-coords-row';
      ['x', 'y', 'w', 'h'].forEach(f => {
        const fd = document.createElement('div');
        fd.className = 'fs-field';
        const lbl = document.createElement('label');
        lbl.textContent = f;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = hs[f];
        inp.addEventListener('input', e => {
          updateHotspot(figId, idx, { [f]: parseFloat(e.target.value) || 0 }, true);
          renderFullscreenHotspots();
        });
        fd.appendChild(lbl);
        fd.appendChild(inp);
        coordsRow.appendChild(fd);
      });
      item.appendChild(coordsRow);

      // Label
      const labelF = document.createElement('div');
      labelF.className = 'fs-field';
      labelF.innerHTML = '<label>Label</label>';
      const labelInp = document.createElement('input');
      labelInp.type = 'text';
      labelInp.value = hs.label;
      labelInp.addEventListener('input', e => updateHotspot(figId, idx, { label: e.target.value }, true));
      labelF.appendChild(labelInp);
      item.appendChild(labelF);

      // Desc
      const descF = document.createElement('div');
      descF.className = 'fs-field';
      descF.innerHTML = '<label>Description</label>';
      const descInp = document.createElement('input');
      descInp.type = 'text';
      descInp.value = hs.desc;
      descInp.addEventListener('input', e => updateHotspot(figId, idx, { desc: e.target.value }, true));
      descF.appendChild(descInp);
      item.appendChild(descF);

      // Target section picker
      const targetF = document.createElement('div');
      targetF.className = 'fs-field';
      targetF.innerHTML = '<label>Target Section</label>';
      const picker = createSectionPicker(hs.target, id => {
        updateHotspot(figId, idx, { target: id }, true);
        renderFullscreenHotspots();
      }, true);
      targetF.appendChild(picker);
      item.appendChild(targetF);
    } else {
      const preview = document.createElement('div');
      preview.style.cssText = 'font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:5px;margin-top:3px;';
      const dot = document.createElement('span');
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${hs.target ? '#22c55e' : '#f59e0b'};flex-shrink:0;display:inline-block;`;
      preview.appendChild(dot);
      preview.appendChild(document.createTextNode(`${hs.label || '(no label)'} — ${hs.x},${hs.y} ${hs.w}×${hs.h}`));
      item.appendChild(preview);
    }

    list.appendChild(item);
  });
}

/* ── FULLSCREEN MOUSE DRAW ───────────────────────────────────────────────── */
function fsGetImageRect() {
  return document.getElementById('fs-image').getBoundingClientRect();
}

function onFsMouseDown(e) {
  if (state.fsOcrPending) return;
  if (e.target.closest('.fs-hotspot-box, .fs-hs-item, [data-panel]')) return;
  const img = document.getElementById('fs-image');
  const rect = img.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  state.fsDrawing = true;
  state.fsDrawStart = { x, y };
  state.fsDrawRect = { x, y, w: 0, h: 0 };
  updateDrawRect();
}

function onFsMouseMove(e) {
  if (!state.fsDrawing) return;
  const img = document.getElementById('fs-image');
  const rect = img.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const w = cx - state.fsDrawStart.x;
  const h = cy - state.fsDrawStart.y;
  state.fsDrawRect = {
    x: w < 0 ? cx : state.fsDrawStart.x,
    y: h < 0 ? cy : state.fsDrawStart.y,
    w: Math.abs(w),
    h: Math.abs(h),
  };
  updateDrawRect();
}

async function onFsMouseUp() {
  if (!state.fsDrawing) return;
  state.fsDrawing = false;

  const dr = state.fsDrawRect;
  state.fsDrawRect = null;
  removeDrawRect();

  if (!dr || dr.w < 5 || dr.h < 5) return;

  const img = document.getElementById('fs-image');
  const rect = img.getBoundingClientRect();
  const xPct = Math.round((dr.x / rect.width) * 100);
  const yPct = Math.round((dr.y / rect.height) * 100);
  const wPct = Math.round((dr.w / rect.width) * 100);
  const hPct = Math.round((dr.h / rect.height) * 100);

  if (wPct < 1 || hPct < 1) return;

  const figId = state.fsFigId;
  const coords = { x: xPct, y: yPct, w: wPct, h: hPct };

  // show OCR pending overlay
  state.fsOcrPending = true;
  showFsOcrOverlay(true);

  try {
    const ocr = await apiOcrRegion(state.docId, figId, xPct, yPct, wPct, hPct);
    addHotspot(figId, { ...coords, label: ocr.label || '', desc: ocr.label || '', target: ocr.target || '' });
    state.fsSelectedIdx = (state.hotspots[figId] || []).length - 1;
    renderFullscreenHotspots();
    renderFsPanel();
  } catch {
    addHotspot(figId, { ...coords, label: '', desc: '', target: '' });
    renderFullscreenHotspots();
    renderFsPanel();
  } finally {
    state.fsOcrPending = false;
    showFsOcrOverlay(false);
  }
}

function updateDrawRect() {
  const wrap = document.getElementById('fs-image-wrap');
  let el = document.getElementById('fs-draw-rect-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fs-draw-rect-el';
    el.className = 'fs-draw-rect';
    const lbl = document.createElement('div');
    lbl.className = 'fs-draw-label';
    lbl.id = 'fs-draw-label-el';
    el.appendChild(lbl);
    wrap.appendChild(el);
  }
  const dr = state.fsDrawRect;
  if (!dr) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left   = `${dr.x}px`;
  el.style.top    = `${dr.y}px`;
  el.style.width  = `${dr.w}px`;
  el.style.height = `${dr.h}px`;

  const img = document.getElementById('fs-image');
  const rect = img.getBoundingClientRect();
  const lbl = document.getElementById('fs-draw-label-el');
  if (lbl && rect.width && rect.height) {
    lbl.textContent = `${Math.round((dr.x / rect.width) * 100)}%, ${Math.round((dr.y / rect.height) * 100)}%, ${Math.round((dr.w / rect.width) * 100)}%, ${Math.round((dr.h / rect.height) * 100)}%`;
  }
}

function removeDrawRect() {
  const el = document.getElementById('fs-draw-rect-el');
  if (el) el.remove();
}

function showFsOcrOverlay(show) {
  const wrap = document.getElementById('fs-image-wrap');
  let overlay = document.getElementById('fs-ocr-overlay-el');
  if (show) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fs-ocr-overlay-el';
      overlay.className = 'fs-ocr-overlay';
      overlay.innerHTML = `<div class="fs-ocr-spinner"><div class="spinner"></div>Detecting text...</div>`;
      wrap.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

/* ── DOCUMENT LOADING ────────────────────────────────────────────────────── */
async function selectDocument(docId) {
  state.docId = docId;
  state.figures = [];
  state.sections = [];
  state.hotspots = {};
  state.approval = {};
  renderFigures();

  if (!docId) {
    document.getElementById('doc-buttons').style.display = 'none';
    document.getElementById('confidence-row').style.display = 'none';
    return;
  }

  document.getElementById('doc-loading').style.display = 'inline';
  try {
    const { figures, sections } = await loadDocument(docId);
    state.figures = figures;
    state.sections = sections;

    // init hotspots from existing XML data
    for (const fig of figures) {
      state.hotspots[fig.id] = fig.hotspots.length > 0 ? [...fig.hotspots] : [];
    }

    document.getElementById('doc-buttons').style.display = 'flex';
    document.getElementById('confidence-row').style.display = 'flex';
    renderFigures();
  } catch (err) {
    toast(`Failed to load document: ${err.message}`, 'error');
  } finally {
    document.getElementById('doc-loading').style.display = 'none';
  }
}

/* ── INIT ────────────────────────────────────────────────────────────────── */
async function init() {
  // confidence slider
  const slider = document.getElementById('confidence-slider');
  const valLabel = document.getElementById('confidence-val');
  slider.value = state.ocrConfidence;
  valLabel.textContent = `${state.ocrConfidence}%`;
  slider.addEventListener('input', () => {
    state.ocrConfidence = parseInt(slider.value, 10);
    valLabel.textContent = `${state.ocrConfidence}%`;
    localStorage.setItem('ocrConfidence', String(state.ocrConfidence));
  });

  // export zip
  document.getElementById('export-zip-btn').href = `${API}/api/export-zip`;

  // change folder
  document.getElementById('change-folder-btn').addEventListener('click', () => {
    state.docId = '';
    state.figures = [];
    state.sections = [];
    state.hotspots = {};
    state.approval = {};
    document.getElementById('doc-select').innerHTML = '<option value="">— Select a document —</option>';
    document.getElementById('doc-buttons').style.display = 'none';
    document.getElementById('confidence-row').style.display = 'none';
    renderFigures();
    showScreen('screen-folder');
  });

  // folder open
  document.getElementById('folder-btn').addEventListener('click', handleFolderOpen);
  document.getElementById('folder-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleFolderOpen();
  });

  // doc select
  document.getElementById('doc-select').addEventListener('change', e => {
    selectDocument(e.target.value);
  });

  // global toolbar buttons
  document.getElementById('btn-ai-detect-all').addEventListener('click', handleAiDetectAll);
  document.getElementById('btn-rematch-all').addEventListener('click', handleRematchAll);
  document.getElementById('btn-remove-unmatched-all').addEventListener('click', handleRemoveAllUnmatched);
  document.getElementById('btn-remove-all').addEventListener('click', handleRemoveAll);

  // fullscreen controls
  document.getElementById('fs-close').addEventListener('click', closeFullscreen);
  document.getElementById('fs-toggle-panel').addEventListener('click', () => {
    state.fsPanelVisible = !state.fsPanelVisible;
    const panel = document.getElementById('fs-panel');
    panel.style.display = state.fsPanelVisible ? 'block' : 'none';
    document.getElementById('fs-toggle-panel').textContent = state.fsPanelVisible ? 'Hide Panel' : 'Show Panel';
  });

  // fullscreen drawing
  const imageArea = document.getElementById('fs-image-area');
  imageArea.addEventListener('mousedown', onFsMouseDown);
  imageArea.addEventListener('mousemove', onFsMouseMove);
  imageArea.addEventListener('mouseup', onFsMouseUp);
  imageArea.addEventListener('mouseleave', () => { if (state.fsDrawing) onFsMouseUp(); });

  // re-render fullscreen hotspots when image loads
  document.getElementById('fs-image').addEventListener('load', () => {
    renderFullscreenHotspots();
  });

  // ── Startup checks ────────────────────────────────────────────────────────
  try {
    // 1. Check expiry
    const expiry = await apiFetch(`${API}/api/expiry`);
    if (expiry.expired) {
      const d = new Date(expiry.expiryDate).toLocaleDateString();
      document.getElementById('expired-msg').textContent =
        `This trial version expired on ${d}. Contact the developer for a licensed version.`;
      showScreen('screen-expired');
      return;
    }

    // 2. Check docs root
    const root = await apiFetch(`${API}/api/docs-root`);
    if (root.configured) {
      await loadDocsAndShow();
    } else {
      showScreen('screen-folder');
    }
  } catch (err) {
    // Server not running — show folder screen anyway
    showScreen('screen-folder');
  }

  // 3. Check AI (Ollama) status in background — updates badge, no blocking
  pollAiStatus();
}

function updateAiStatusBadge(ready) {
  const badge = document.getElementById('ai-status-badge');
  if (!badge) return;
  if (ready) {
    badge.textContent = 'AI: ready';
    badge.style.background = '#14532d';
    badge.style.color = '#86efac';
  } else {
    badge.textContent = 'AI: starting…';
    badge.style.background = '#451a03';
    badge.style.color = '#fdba74';
  }
}

async function pollAiStatus() {
  // Poll every 2 seconds until ready (up to 3 minutes)
  for (let i = 0; i < 90; i++) {
    try {
      const status = await apiFetch(`${API}/api/ai-status`);
      updateAiStatusBadge(status.ready);
      if (status.ready) return;
    } catch {
      // server not reachable yet, keep polling
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function loadDocsAndShow() {
  try {
    const docs = await loadDocuments();
    const sel = document.getElementById('doc-select');
    sel.innerHTML = '<option value="">— Select a document —</option>';
    docs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.docId;
      opt.textContent = `${d.docId} — ${d.title}`;
      sel.appendChild(opt);
    });
    showScreen('screen-main');
  } catch (err) {
    toast(`Failed to load documents: ${err.message}`, 'error');
    showScreen('screen-folder');
  }
}

async function handleFolderOpen() {
  const input = document.getElementById('folder-input');
  const errEl = document.getElementById('folder-error');
  const btn   = document.getElementById('folder-btn');
  let path  = input.value.trim();

  // ── Electron native folder picker ──────────────────────────────────────
  if (window.electronAPI) {
    const selectedPath = await window.electronAPI.selectFolder();
    if (!selectedPath) return; // Cancelled
    path = selectedPath;
    input.value = path;
  }

  if (!path) return;

  btn.disabled = true;
  btn.textContent = 'Loading...';
  errEl.textContent = '';

  try {
    await apiPost(`${API}/api/set-docs-root`, { path });
    await loadDocsAndShow();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Open';
  }
}

/* ── BOOT ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
