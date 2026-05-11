/**
 * IETM Level 4 Viewer — JS for HTMX-driven Django templates.
 *
 * Handles: sidebar toggle, tree expand/collapse, panel visibility (3 modes),
 * xref click handling (same-topic scroll+highlight vs cross-topic navigate+scroll),
 * figure caption → image sync, local search, note panel, fullscreen overlay.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── Sidebar toggle + localStorage persistence ──────────────────────────
  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');

  // Restore sidebar state from localStorage
  if (sidebar && localStorage.getItem('sidebarCollapsed') === 'true') {
    sidebar.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
      // Reset panel widths to default on sidebar toggle (matches frontend uiHelpers.js)
      const tp = document.getElementById('textContentArea');
      const ip = document.querySelector('.image-panel');
      if (tp) { tp.style.width = ''; tp.style.flex = ''; }
      if (ip) { ip.style.width = ''; ip.style.flex = ''; }
    });
  }

  // ── Auto-expand first manual root on load ───────────────────────────────
  const firstManualChildren = document.querySelector('#toc > .toc-item > .toc-children');
  const firstManualCaret = document.querySelector('#toc > .toc-item .toc-caret');
  if (firstManualChildren) firstManualChildren.style.display = 'block';
  if (firstManualCaret) firstManualCaret.classList.add('expanded');

  // ── Tree expand/collapse ────────────────────────────────────────────────
  document.body.addEventListener('click', (e) => {
    const toggle = e.target.closest('.toc-toggle');
    if (!toggle) return;

    // Don't toggle if clicking a link inside the toggle area
    if (e.target.closest('.toc-link')) return;

    const li = toggle.closest('.toc-item');
    if (!li) return;
    const childUl = li.querySelector('.toc-children');
    if (!childUl) return;

    const caret = toggle.querySelector('.toc-caret');
    if (childUl.style.display === 'none' || !childUl.style.display) {
      childUl.style.display = 'block';
      if (caret) caret.classList.add('expanded');
    } else {
      childUl.style.display = 'none';
      if (caret) caret.classList.remove('expanded');
    }
  });

  // ── Panel visibility + highlight active TOC ─────────────────────────────
  document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'content-pane') {
      applyPanelVisibility();
      highlightActiveToc();
      // Scroll to pending anchor (set before cross-topic xref navigation)
      if (window.__pendingAnchorScroll) {
        const target = window.__pendingAnchorScroll;
        window.__pendingAnchorScroll = null;
        setTimeout(() => scrollToAnchor(target), 350);
      }
    }
  });

  // Apply on initial load too (for full page loads with topic content)
  applyPanelVisibility();

  // ── Section dropdown toggle ─────────────────────────────────────────────
  document.body.addEventListener('click', (e) => {
    const tocBtn = e.target.closest('#tocBtn');
    if (tocBtn) {
      const menu = document.getElementById('tocMenu');
      if (menu) menu.classList.toggle('show');
      return;
    }
    // Close dropdown on outside click
    const menu = document.getElementById('tocMenu');
    if (menu && !e.target.closest('.toc-dropdown')) {
      menu.classList.remove('show');
    }
  });

  // ── XRef click handler ────────────────────────────────────────────────
  document.body.addEventListener('click', (e) => {
    const xref = e.target.closest('a.xref');
    if (!xref) return;
    e.preventDefault();
    const target = xref.dataset.target;
    if (!target) return;

    // 1. Check if target is a figure/media item in the current media panel
    const mediaItem = document.querySelector(
      '[data-media-id="' + target + '"], [data-figure-id="' + target + '"]'
    );
    if (mediaItem) {
      activateSyncHighlight(mediaItem);
      return;
    }

    // 2. Check for an anchor element within the current page
    const anchor = document.getElementById(target);
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Apply section highlight, matching frontend behavior
      const targetEl = anchor.closest('.section-group') || anchor.closest('.media-item') || anchor;
      targetEl.classList.add('section-highlight');
      setTimeout(() => targetEl.classList.remove('section-highlight'), 3000);
      return;
    }

    // 3. Cross-topic: store pending anchor scroll, then HTMX navigate
    window.__pendingAnchorScroll = target;
    htmx.ajax('GET', '/topic/by-xml-id/' + encodeURIComponent(target) + '/', {
      target: '#content-pane',
      swap: 'innerHTML'
    });
    history.pushState({}, '', '/topic/by-xml-id/' + encodeURIComponent(target) + '/');
  });

  // ── Figure caption click → scroll to image in media panel ─────────────
  document.body.addEventListener('click', (e) => {
    const caption = e.target.closest('.figure-caption[data-img-ref]');
    if (!caption) return;
    e.preventDefault();

    const targetId = caption.dataset.imgRef;
    if (!targetId) return;

    const mediaItem = document.querySelector(
      '[data-media-id="' + targetId + '"]'
    );
    if (mediaItem) {
      activateSyncHighlight(mediaItem);
    }
  });

  // ── Local in-page search ──────────────────────────────────────────────
  let localMatches = [];
  let localIdx = -1;

  document.body.addEventListener('click', (e) => {
    if (e.target.closest('.local-searchBTN')) {
      performLocalSearch();
    }
    if (e.target.closest('#localSearchNext')) {
      navigateLocalSearch(1);
    }
    if (e.target.closest('#localSearchPrev')) {
      navigateLocalSearch(-1);
    }
  });

  document.body.addEventListener('keyup', (e) => {
    if (e.target.id === 'localSearchInput' && e.key === 'Enter') {
      performLocalSearch();
    }
  });

  function performLocalSearch() {
    const input = document.getElementById('localSearchInput');
    const body = document.getElementById('textContentBody');
    const counter = document.getElementById('localSearchCount');
    if (!input || !body) return;

    // Clear previous highlights
    body.querySelectorAll('.local-highlight').forEach(el => {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });

    const query = input.value.trim();
    if (!query) {
      if (counter) counter.textContent = '0';
      localMatches = [];
      localIdx = -1;
      return;
    }

    // Walk text nodes and wrap matches
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    localMatches = [];
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    for (const node of nodes) {
      const text = node.textContent;
      if (!re.test(text)) continue;
      re.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        if (match.index > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
        }
        const mark = document.createElement('mark');
        mark.className = 'local-highlight';
        mark.textContent = match[0];
        frag.appendChild(mark);
        localMatches.push(mark);
        lastIdx = re.lastIndex;
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }
      node.parentNode.replaceChild(frag, node);
    }

    if (counter) counter.textContent = String(localMatches.length);
    localIdx = localMatches.length > 0 ? 0 : -1;
    if (localIdx >= 0) {
      localMatches[0].classList.add('current');
      localMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function navigateLocalSearch(dir) {
    if (localMatches.length === 0) return;
    localMatches[localIdx]?.classList.remove('current');
    localIdx = (localIdx + dir + localMatches.length) % localMatches.length;
    localMatches[localIdx].classList.add('current');
    localMatches[localIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Note panel — full CRUD ──────────────────────────────────────────────
  const notePanel = document.getElementById('notePanel');
  const noteText = document.getElementById('noteText');
  let currentNoteTopicId = null;

  function getCSRF() {
    return document.querySelector('meta[name="csrf-token"]')?.content
        || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  }

  function getCurrentTopicId() {
    const match = window.location.pathname.match(/\/topic\/(\d+)\//);
    return match ? match[1] : null;
  }

  document.getElementById('noteBtn')?.addEventListener('click', async () => {
    if (!notePanel) return;
    notePanel.classList.toggle('open');
    if (notePanel.classList.contains('open')) {
      currentNoteTopicId = getCurrentTopicId();
      if (currentNoteTopicId && noteText) {
        try {
          const res = await fetch('/api/topic-notes/' + currentNoteTopicId, { credentials: 'same-origin' });
          if (res.ok) {
            const data = await res.json();
            noteText.value = data.content || '';
          } else {
            noteText.value = '';
          }
        } catch (e) { noteText.value = ''; }
      }
    }
  });

  document.getElementById('closeNote')?.addEventListener('click', () => {
    if (notePanel) notePanel.classList.remove('open');
  });

  document.getElementById('saveNote')?.addEventListener('click', async () => {
    if (!currentNoteTopicId || !noteText) return;
    try {
      const res = await fetch('/api/topic-notes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRF() },
        body: JSON.stringify({ topicId: currentNoteTopicId, content: noteText.value })
      });
      if (res.ok) {
        const btn = document.getElementById('saveNote');
        if (btn) { btn.style.color = '#16a34a'; setTimeout(() => btn.style.color = '', 1500); }
      }
    } catch (e) { console.error('Save note error:', e); }
  });

  document.getElementById('eraseNote')?.addEventListener('click', async () => {
    if (!currentNoteTopicId) return;
    if (!confirm('Delete this note?')) return;
    try {
      await fetch('/api/topic-notes/' + currentNoteTopicId, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCSRF() }
      });
      if (noteText) noteText.value = '';
    } catch (e) { console.error('Erase note error:', e); }
  });

  document.getElementById('printNote')?.addEventListener('click', () => {
    if (!noteText) return;
    const printWin = window.open('', '_blank');
    printWin.document.write('<html><head><title>Note</title></head><body style="font-family:Segoe UI,sans-serif;padding:20px;"><h2>Topic Note</h2><pre style="white-space:pre-wrap;">' + noteText.value.replace(/</g, '&lt;') + '</pre></body></html>');
    printWin.document.close();
    printWin.print();
  });

  // ── Fullscreen overlay ──────────────────────────────────────────────────
  const overlay = document.getElementById('fullscreenOverlay');
  document.getElementById('exitFullscreenBtn')?.addEventListener('click', () => {
    if (overlay) overlay.classList.remove('active');
  });

  // Double-click images to fullscreen with zoom/pan
  document.body.addEventListener('dblclick', (e) => {
    const img = e.target.closest('.media-image');
    if (!img || !overlay) return;
    const content = document.getElementById('fullscreenContent');
    if (!content) return;

    content.innerHTML = '';
    const clone = img.cloneNode(true);
    clone.style.maxWidth = '100%';
    clone.style.maxHeight = '90vh';
    clone.style.transformOrigin = '0 0';
    clone.style.cursor = 'grab';
    content.appendChild(clone);

    // Zoom controls
    const controls = document.createElement('div');
    controls.className = 'zoom-controls';
    controls.innerHTML =
      '<button id="zoomOut" title="Zoom Out">&#x2796;</button>' +
      '<button id="zoomIn" title="Zoom In">&#x2795;</button>' +
      '<button id="zoomReset" title="Reset">&#x21BA;</button>';
    content.appendChild(controls);

    let scale = 1, translateX = 0, translateY = 0;
    let isDragging = false, startX = 0, startY = 0;

    function applyTransform() {
      clone.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
    }

    document.getElementById('zoomIn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      scale = Math.min(5, scale + 0.25);
      applyTransform();
    });
    document.getElementById('zoomOut').addEventListener('click', (ev) => {
      ev.stopPropagation();
      scale = Math.max(0.5, scale - 0.25);
      applyTransform();
    });
    document.getElementById('zoomReset').addEventListener('click', (ev) => {
      ev.stopPropagation();
      scale = 1; translateX = 0; translateY = 0;
      applyTransform();
    });

    // Mouse wheel zoom
    content.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      scale += ev.deltaY < 0 ? 0.15 : -0.15;
      scale = Math.max(0.5, Math.min(5, scale));
      applyTransform();
    }, { passive: false });

    // Drag to pan
    content.addEventListener('mousedown', (ev) => {
      if (ev.target.closest('.zoom-controls')) return;
      isDragging = true;
      startX = ev.clientX - translateX;
      startY = ev.clientY - translateY;
      content.classList.add('grabbing');
      clone.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', function onMove(ev) {
      if (!isDragging) return;
      translateX = ev.clientX - startX;
      translateY = ev.clientY - startY;
      applyTransform();
    });
    document.addEventListener('mouseup', function onUp() {
      isDragging = false;
      content.classList.remove('grabbing');
      clone.style.cursor = 'grab';
    });

    overlay.classList.add('active');
  });

  // ── Search box toggle (sidebar search mode) ───────────────────────────
  const toggleSearch = document.getElementById('toggleSidebarMode');
  if (toggleSearch && sidebar) {
    toggleSearch.addEventListener('click', () => {
      const tree = document.getElementById('treeView');
      const box = document.getElementById('searchBox');
      const input = document.getElementById('searchInput');
      const results = document.getElementById('searchResults');

      if (box.style.display === 'none' || !box.style.display) {
        if (tree) tree.style.display = 'none';
        box.style.display = 'block';
        toggleSearch.className = 'fa-solid fa-folder sidebar-icon';
        if (input) input.focus();
      } else {
        if (tree) tree.style.display = '';
        box.style.display = 'none';
        toggleSearch.className = 'fa-solid fa-magnifying-glass sidebar-icon';
        if (results) results.innerHTML = '';
      }
    });
  }

  // ── TOC up/down scroll ─────────────────────────────────────────────────
  const treeView = document.getElementById('treeView');
  document.getElementById('tocUpBtn')?.addEventListener('click', () => {
    if (treeView) treeView.scrollBy({ top: -200, behavior: 'smooth' });
  });
  document.getElementById('tocDownBtn')?.addEventListener('click', () => {
    if (treeView) treeView.scrollBy({ top: 200, behavior: 'smooth' });
  });

  // ── Bookmark toggle ──────────────────────────────────────────────────────
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', async () => {
      const topicLink = document.querySelector('.toc-link.active');
      if (!topicLink) { alert('Navigate to a topic first.'); return; }

      const topicPath = topicLink.getAttribute('href');
      const topicTitle = topicLink.textContent.trim();

      try {
        const res = await fetch('/api/bookmarks/', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRF() },
          body: JSON.stringify({ topic_title: topicTitle, topic_path: topicPath })
        });
        if (res.ok) {
          bookmarkBtn.classList.toggle('bookmarked');
          const icon = bookmarkBtn.querySelector('i');
          if (icon) icon.style.color = bookmarkBtn.classList.contains('bookmarked') ? '#facc15' : '';
        }
      } catch (e) { console.error('Bookmark error:', e); }
    });
  }

  // ── Print button — formatted print ────────────────────────────────────────
  document.getElementById('printBtn')?.addEventListener('click', () => {
    const textBody = document.getElementById('textContentBody');
    const mediaPanel = document.querySelector('.image-panel');
    if (!textBody) { window.print(); return; }

    const title = textBody.querySelector('.section-title')?.textContent || 'IETM Content';
    const now = new Date().toLocaleString();

    const printWin = window.open('', '_blank');
    printWin.document.write('<html><head><title>' + title + '</title>' +
      '<style>body{font-family:"Segoe UI",sans-serif;padding:30px;color:#222}' +
      'h2{border-bottom:2px solid #333;padding-bottom:8px}' +
      'img{max-width:100%;height:auto;margin:10px 0}' +
      'table{border-collapse:collapse;width:100%;margin:10px 0}' +
      'th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}' +
      '.footer{margin-top:30px;border-top:1px solid #ccc;padding-top:10px;font-size:12px;color:#666}' +
      '</style></head><body>');
    printWin.document.write('<h2>' + title + '</h2>');
    printWin.document.write(textBody.innerHTML);
    if (mediaPanel && mediaPanel.style.display !== 'none') {
      printWin.document.write('<hr>' + mediaPanel.innerHTML);
    }
    printWin.document.write('<div class="footer">Printed: ' + now + '</div>');
    printWin.document.write('</body></html>');
    printWin.document.close();
    printWin.print();

    // Log print event
    fetch('/api/printLogs', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRF() },
      body: JSON.stringify({ topicTitle: title, printedAt: now, details: 'Printed topic: ' + title })
    }).catch(() => {});
  });

  // ── Help button ──────────────────────────────────────────────────────────
  document.getElementById('helpBtn')?.addEventListener('click', () => {
    const pane = document.getElementById('content-pane');
    if (!pane) return;
    pane.innerHTML = '<div style="padding:30px;max-width:800px;">' +
      '<h2>IETM Help</h2>' +
      '<h3>Navigation</h3>' +
      '<ul>' +
      '<li><b>Table of Contents:</b> Click topics in the sidebar to navigate</li>' +
      '<li><b>Search:</b> Click the magnifying glass icon to search all topics</li>' +
      '<li><b>Previous/Next:</b> Use arrow buttons to go sequentially</li>' +
      '<li><b>Breadcrumb:</b> Click breadcrumb links to navigate up</li>' +
      '</ul>' +
      '<h3>Features</h3>' +
      '<ul>' +
      '<li><b>Bookmarks:</b> Click the bookmark icon to save current topic</li>' +
      '<li><b>Notes:</b> Click the note icon to write notes for current topic</li>' +
      '<li><b>Print:</b> Click print icon to generate printable version</li>' +
      '<li><b>Local Search:</b> Use the search bar in the text panel to find text within the current topic</li>' +
      '<li><b>Fullscreen:</b> Double-click images to view fullscreen</li>' +
      '<li><b>Panel Resize:</b> Drag the divider between text and media panels</li>' +
      '</ul>' +
      '</div>';
  });

  // ── Abbreviation table ───────────────────────────────────────────────────
  document.getElementById('abbrBtn')?.addEventListener('click', () => {
    const pane = document.getElementById('content-pane');
    if (!pane) return;
    const abbrs = [
      ['BOT','Beginning of Tape'],['V','Volts'],['Amp','Ampere'],['AH','Ampere Hour'],
      ['Hz','Hertz'],['M','Metre'],['mm','Millimetre'],['PTO','Power Take Off'],
      ['AC','Alternating Current'],['DC','Direct Current'],['Kg','Kilogram'],
      ['SAE','Society of Automotive Engineers'],['FW','Firmware'],['JE','Job Element']
    ];
    const rows = abbrs.map(a => '<tr><td><b>' + a[0] + '</b></td><td>' + a[1] + '</td></tr>').join('');
    pane.innerHTML = '<div style="padding:30px;max-width:600px;">' +
      '<h2>Abbreviations</h2>' +
      '<table class="cals-table"><thead><tr><th>Abbreviation</th><th>Full Form</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '</div>';
  });

  // ── Table → Image hover sync (delegated, survives HTMX swaps) ─────────
  document.body.addEventListener('mouseover', (e) => {
    const tr = e.target.closest('tr[data-pos]');
    if (!tr) return;
    const pos = tr.dataset.pos;
    document.querySelectorAll(`.image-hotspot[data-pos="${pos}"]`).forEach(h => h.classList.add('active'));
  });
  document.body.addEventListener('mouseout', (e) => {
    const tr = e.target.closest('tr[data-pos]');
    if (!tr) return;
    const pos = tr.dataset.pos;
    document.querySelectorAll(`.image-hotspot[data-pos="${pos}"]`).forEach(h => h.classList.remove('active'));
  });

  // ── Responsive sidebar auto-uncollapse (matches frontend sidebar.js) ──
  window.addEventListener('resize', () => {
    if (!sidebar) return;
    if (window.innerWidth <= 900) {
      sidebar.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
    } else if (localStorage.getItem('sidebarCollapsed') === 'true') {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    }
  });
});


// ── Panel visibility (3 modes) ──────────────────────────────────────────────

function applyPanelVisibility() {
  const panels = document.querySelector('.topic-panels');
  if (!panels) return;

  const textPanel = document.getElementById('textContentArea');
  const mediaPanel = document.querySelector('.image-panel');
  const resizer = document.getElementById('panelResizer');

  if (!textPanel || !mediaPanel) return;

  // Cross-check: data attribute AND actual rendered media items must both confirm
  const hasMediaAttr = panels.dataset.hasMedia === 'true';
  const hasRenderedMedia = mediaPanel.querySelector('.media-item') !== null;
  const hasMedia = hasMediaAttr && hasRenderedMedia;
  const hasText = panels.dataset.hasText === 'true';
  const hasTable = panels.dataset.hasTable === 'true';

  if (hasMedia && !hasText && !hasTable) {
    // Image-only: hide text panel, media takes full width
    textPanel.style.display = 'none';
    mediaPanel.style.display = 'flex';
    mediaPanel.style.width = '100%';
    mediaPanel.style.flex = '1';
    mediaPanel.style.overflowY = 'auto';
    if (resizer) resizer.style.display = 'none';
  } else if (hasMedia) {
    // Split layout: 60% text / 40% media
    textPanel.style.display = 'block';
    textPanel.style.width = '60%';
    textPanel.style.flex = '0 0 60%';

    mediaPanel.style.display = 'flex';
    mediaPanel.style.width = 'calc(40% - 10px)';
    mediaPanel.style.flex = '1';
    mediaPanel.style.overflowY = 'auto';

    if (resizer) resizer.style.display = 'block';
  } else {
    // Text-only: hide media panel
    textPanel.style.display = 'block';
    textPanel.style.width = '100%';
    textPanel.style.flex = '1';
    mediaPanel.style.display = 'none';
    if (resizer) resizer.style.display = 'none';
  }

  textPanel.scrollTop = 0;
  mediaPanel.scrollTop = 0;
}


// ── Scroll to anchor + highlight (mirrors frontend scrollToAnchor) ──────────

function scrollToAnchor(anchorId) {
  if (!anchorId) return;

  const normalizedId = anchorId.toLowerCase().trim();
  const originalId = anchorId.trim();

  // Try multiple ID variants (matching frontend pattern)
  const el = document.getElementById(originalId)
          || document.getElementById(normalizedId)
          || document.getElementById('render-' + originalId)
          || document.getElementById('render-' + normalizedId);

  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight the nearest semantic container, matching frontend behavior
    const targetEl = el.closest('.section-group')
                  || el.closest('.media-item')
                  || el.closest('.image-item')
                  || el;
    targetEl.classList.add('section-highlight');
    setTimeout(() => targetEl.classList.remove('section-highlight'), 3000);
  }

  // Also check media panel by data-media-id
  const mediaItem = document.querySelector('[data-media-id="' + originalId + '"]');
  if (mediaItem && !el) {
    activateSyncHighlight(mediaItem);
  }
}


// ── Sync highlight (figure caption ↔ media panel image) ─────────────────────

let currentActiveContainer = null;

function activateSyncHighlight(mediaItem) {
  // Remove previous highlight
  if (currentActiveContainer) {
    currentActiveContainer.classList.remove('active-image-container');
    currentActiveContainer = null;
  }

  // Scroll to and highlight the media item
  mediaItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  mediaItem.classList.add('active-image-container');
  currentActiveContainer = mediaItem;

  // Auto-remove highlight after 3 seconds
  setTimeout(() => {
    mediaItem.classList.remove('active-image-container');
    if (currentActiveContainer === mediaItem) {
      currentActiveContainer = null;
    }
  }, 3000);
}


// ── Highlight active TOC item ───────────────────────────────────────────────

function highlightActiveToc() {
  // Remove previous active
  document.querySelectorAll('.toc-link.active').forEach(el => el.classList.remove('active'));

  // Find and mark current
  const url = window.location.pathname;
  document.querySelectorAll('.toc-link').forEach(link => {
    if (link.getAttribute('href') === url) {
      link.classList.add('active');
      // Expand parent tree nodes
      let parent = link.closest('.toc-children');
      while (parent) {
        parent.style.display = 'block';
        const caret = parent.previousElementSibling?.querySelector('.toc-caret') ||
                      parent.closest('.toc-item')?.querySelector('.toc-caret');
        if (caret) caret.classList.add('expanded');
        parent = parent.parentElement?.closest('.toc-children');
      }
    }
  });
}
