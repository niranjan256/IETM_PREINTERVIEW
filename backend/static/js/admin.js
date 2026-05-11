/**
 * IETM Admin Panel — JS for Django template + HTMX admin.
 * Handles: menu active state, chart re-initialization after HTMX swap,
 * and dashboard card interaction.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initial menu highlight
  updateActiveMenu();

  // After every HTMX swap into contentRoot
  document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'contentRoot') {
      updateActiveMenu();
      // Re-init charts if dashboard was swapped in
      initCharts();
    }
  });

  // Also init charts on first full-page load
  initCharts();
});

function updateActiveMenu() {
  const path = window.location.pathname;
  document.querySelectorAll('.menu .menu-btn').forEach(btn => {
    btn.classList.remove('active');
    const href = btn.getAttribute('href');
    // Exact match or starts-with for sub-pages
    if (href === path || (href && href !== '/' && path.startsWith(href))) {
      btn.classList.add('active');
    }
  });
}

function initCharts() {
  const chartDataEl = document.getElementById('chart-data');
  if (!chartDataEl) return;

  try {
    const data = JSON.parse(chartDataEl.textContent);

    const ctx1 = document.getElementById('activeChart');
    if (ctx1) {
      // Destroy existing chart instance if any (prevents "canvas already in use" error)
      const existing1 = Chart.getChart(ctx1);
      if (existing1) existing1.destroy();

      new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Active', 'Inactive'],
          datasets: [{
            data: [data.active, data.inactive],
            backgroundColor: ['#4caf50', '#f44336']
          }]
        }
      });
    }

    const ctx2 = document.getElementById('deptChart');
    if (ctx2) {
      const existing2 = Chart.getChart(ctx2);
      if (existing2) existing2.destroy();

      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: data.departments.map(d => d.name),
          datasets: [{
            label: 'Users',
            data: data.departments.map(d => d.count),
            backgroundColor: '#2196f3'
          }]
        },
        options: {
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }
  } catch (e) {
    console.error('Chart init error:', e);
  }
}
