// Panel resize — works for both direct page loads and HTMX navigation.
// mousemove/mouseup are attached once to document; only mousedown needs
// re-attachment after each HTMX swap (because #panelResizer is a new element).

let isDragging = false;
let _leftPanel = null;
let _rightPanel = null;
let _container = null;

document.addEventListener("mousemove", (e) => {
  if (!isDragging || !_leftPanel || !_rightPanel || !_container) return;

  const containerRect = _container.getBoundingClientRect();
  let offsetX = e.clientX - containerRect.left;

  const minLeft = 250;
  const minRight = 250;
  const resizer = document.getElementById("panelResizer");
  const resizerWidth = resizer ? resizer.offsetWidth : 6;
  const maxLeft = containerRect.width - minRight - resizerWidth;

  if (offsetX < minLeft) offsetX = minLeft;
  if (offsetX > maxLeft) offsetX = maxLeft;

  const leftWidthPercent = (offsetX / containerRect.width) * 100;
  const rightWidthPercent = ((containerRect.width - offsetX - resizerWidth) / containerRect.width) * 100;

  _leftPanel.style.flex = "none";
  _rightPanel.style.flex = "none";
  _leftPanel.style.width = leftWidthPercent + "%";
  _rightPanel.style.width = rightWidthPercent + "%";
});

document.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

function initPanelResize() {
  const resizer = document.getElementById("panelResizer");
  const leftPanel = document.getElementById("textContentArea");
  const rightPanel = document.querySelector(".image-panel");
  const container = document.querySelector(".topic-panels");

  if (!resizer || !leftPanel || !rightPanel || !container) return;

  // Update shared references for mousemove handler
  _leftPanel = leftPanel;
  _rightPanel = rightPanel;
  _container = container;

  resizer.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
}

// Init on direct page load (topic rendered server-side)
document.addEventListener("DOMContentLoaded", initPanelResize);

// Re-init after every HTMX swap into #content-pane (new resizer element)
document.addEventListener("htmx:afterSwap", (e) => {
  if (e.detail && e.detail.target && e.detail.target.id === "content-pane") {
    initPanelResize();
  }
});
