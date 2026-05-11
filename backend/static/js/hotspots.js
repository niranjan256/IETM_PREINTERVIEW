/**
 * IETM Image Hotspots — simplified for Django template + HTMX.
 *
 * Hotspot divs are pre-rendered server-side in topic.html with pixel coords
 * from the original image. This script:
 *   - Positions the hotspot overlay container over the rendered image
 *   - Scales hotspot coordinates proportionally to the rendered image size
 *   - Tracks resizes via ResizeObserver
 *   - HTMX navigation on hotspots via hx-get attributes (already in HTML)
 *   - Image-to-table hover sync via data-pos attribute
 */

document.addEventListener('DOMContentLoaded', () => {
  initHotspots();
  // Re-init after HTMX content swap
  document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'content-pane') {
      initHotspots();
    }
  });
});

function initHotspots() {
  document.querySelectorAll('.hotspot-container').forEach(container => {
    const figure = container.closest('.ietm-figure') || container.parentElement;
    const img = figure?.querySelector('img');
    if (!img) return;

    // Make the parent a positioning context for the overlay
    figure.style.position = 'relative';
    container.style.position = 'absolute';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2000';

    function updatePosition() {
      // Overlay the container exactly over the rendered image
      container.style.left = img.offsetLeft + 'px';
      container.style.top = img.offsetTop + 'px';
      container.style.width = img.clientWidth + 'px';
      container.style.height = img.clientHeight + 'px';

      // Scale individual hotspot coords from original image pixels → rendered size
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const scaleX = img.clientWidth / img.naturalWidth;
        const scaleY = img.clientHeight / img.naturalHeight;

        container.querySelectorAll('.hotspot').forEach(hs => {
          // Preserve original coords on first run using data attributes
          if (!hs.dataset.origX) {
            hs.dataset.origX = parseFloat(hs.style.left) || 0;
            hs.dataset.origY = parseFloat(hs.style.top) || 0;
            hs.dataset.origW = parseFloat(hs.style.width) || 0;
            hs.dataset.origH = parseFloat(hs.style.height) || 0;
          }
          hs.style.left   = (parseFloat(hs.dataset.origX) * scaleX) + 'px';
          hs.style.top    = (parseFloat(hs.dataset.origY) * scaleY) + 'px';
          hs.style.width  = (parseFloat(hs.dataset.origW) * scaleX) + 'px';
          hs.style.height = (parseFloat(hs.dataset.origH) * scaleY) + 'px';
        });
      }
    }

    // Wait for image to load, then position
    if (img.complete && img.naturalWidth > 0) {
      updatePosition();
    } else {
      img.addEventListener('load', updatePosition);
    }

    // Track image resizes (e.g. panel resize)
    const observer = new ResizeObserver(updatePosition);
    observer.observe(img);

    // Enable pointer events on individual hotspot divs
    container.querySelectorAll('.hotspot').forEach(hs => {
      hs.style.position = 'absolute';
      hs.style.pointerEvents = 'auto';
      hs.style.cursor = 'pointer';

      // Image hotspot → table row hover sync
      const pos = hs.dataset.pos;
      if (pos) {
        hs.addEventListener('mouseenter', () => {
          document.querySelectorAll(`tr[data-pos="${pos}"]`).forEach(tr => {
            tr.classList.add('active');
            tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
        hs.addEventListener('mouseleave', () => {
          document.querySelectorAll(`tr[data-pos="${pos}"]`).forEach(tr => {
            tr.classList.remove('active');
          });
        });
      }

      // Click popup for hotspots without navigation target
      if (hs.title && !hs.getAttribute('hx-get')) {
        hs.addEventListener('click', (e) => {
          e.stopPropagation();
          const existing = document.querySelector('.hotspot-popup');
          if (existing) existing.remove();

          const popup = document.createElement('div');
          popup.className = 'hotspot-popup';
          popup.innerHTML = '<div class="popup-label">' + hs.title + '</div>';
          popup.style.left = hs.style.left;
          popup.style.top = (parseInt(hs.style.top) + parseInt(hs.style.height) + 4) + 'px';
          const parent = hs.closest('.media-item') || hs.closest('.ietm-figure') || container;
          parent.appendChild(popup);

          document.addEventListener('click', function close() {
            popup.remove();
            document.removeEventListener('click', close);
          }, { once: true });
        });
      }
    });
  });
}
