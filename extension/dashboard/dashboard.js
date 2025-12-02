import dbManager from '../lib/db-manager.js';

let allCookies = [];
let allClassifications = [];

async function init() {
  await dbManager.init();
  await loadData();
  renderDashboard();
  setupEventListeners();
}

async function loadData() {
  allCookies = await dbManager.getAllCookies(5000);

  allClassifications = await Promise.all(
    allCookies.map(cookie => dbManager.getClassification(cookie.id))
  );
}

function renderDashboard() {
  updateOverviewStats();
  renderPieChart();
  renderBarChart();
  renderTimeline();
  renderTable();
}

function updateOverviewStats() {
  const total = allCookies.length;
  document.getElementById('overview-total').textContent = total;

  const uniqueDomains = new Set(allCookies.map(c => c.domain)).size;
  document.getElementById('overview-domains').textContent = uniqueDomains;

  const trackers = allClassifications.filter(c =>
    c && (c.category === 'advertising' || c.category === 'analytics')
  ).length;
  document.getElementById('overview-trackers').textContent = trackers;

  const score = calculatePrivacyScore();
  document.getElementById('overview-score').textContent = score;
}

function calculatePrivacyScore() {
  if (allClassifications.length === 0) return '--';

  const categoryCounts = allClassifications.reduce((acc, c) => {
    if (c) acc[c.category] = (acc[c.category] || 0) + 1;
    return acc;
  }, {});

  const total = allClassifications.length;
  const score = 100 -
    ((categoryCounts.advertising || 0) / total * 40) -
    ((categoryCounts.social || 0) / total * 30) -
    ((categoryCounts.analytics || 0) / total * 20) -
    ((categoryCounts.functional || 0) / total * 5);

  return Math.max(0, Math.round(score));
}

function renderPieChart() {
  const categoryCounts = allClassifications.reduce((acc, c) => {
    if (c) acc[c.category] = (acc[c.category] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count
  }));

  const width = 400;
  const height = 300;
  const radius = Math.min(width, height) / 2 - 40;

  const color = d3.scaleOrdinal()
    .domain(['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown'])
    .range(['#28a745', '#17a2b8', '#ffc107', '#dc3545', '#6f42c1', '#6c757d']);

  const svg = d3.select('#pie-chart')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(${width / 2},${height / 2})`);

  const pie = d3.pie()
    .value(d => d.count)
    .sort(null);

  const arc = d3.arc()
    .innerRadius(radius * 0.5)
    .outerRadius(radius);

  const arcs = svg.selectAll('arc')
    .data(pie(data))
    .enter()
    .append('g')
    .attr('class', 'arc');

  arcs.append('path')
    .attr('d', arc)
    .attr('fill', d => color(d.data.category))
    .attr('stroke', 'white')
    .attr('stroke-width', 2)
    .on('mouseover', function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('transform', 'scale(1.05)');
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('transform', 'scale(1)');
    });

  arcs.append('text')
    .attr('transform', d => `translate(${arc.centroid(d)})`)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('fill', 'white')
    .attr('font-weight', 'bold')
    .text(d => d.data.count);

  const legend = svg.append('g')
    .attr('transform', `translate(${radius + 20}, ${-radius})`);

  data.forEach((d, i) => {
    const legendRow = legend.append('g')
      .attr('transform', `translate(0, ${i * 25})`);

    legendRow.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', color(d.category));

    legendRow.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .attr('font-size', '12px')
      .text(`${d.category} (${d.count})`);
  });
}

function renderBarChart() {
  const domainCounts = allCookies.reduce((acc, cookie) => {
    acc[cookie.domain] = (acc[cookie.domain] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const margin = { top: 20, right: 20, bottom: 100, left: 50 };
  const width = 400 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  const svg = d3.select('#bar-chart')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .range([0, width])
    .domain(data.map(d => d.domain))
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count)])
    .range([height, 0]);

  svg.selectAll('rect')
    .data(data)
    .enter()
    .append('rect')
    .attr('x', d => x(d.domain))
    .attr('y', d => y(d.count))
    .attr('width', x.bandwidth())
    .attr('height', d => height - y(d.count))
    .attr('fill', '#667eea')
    .on('mouseover', function() {
      d3.select(this).attr('fill', '#764ba2');
    })
    .on('mouseout', function() {
      d3.select(this).attr('fill', '#667eea');
    });

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end')
    .style('font-size', '10px');

  svg.append('g')
    .call(d3.axisLeft(y));
}

function renderTimeline() {
  const hourlyData = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));

  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  allCookies.forEach(cookie => {
    if (cookie.timestamp > oneDayAgo) {
      const hour = new Date(cookie.timestamp).getHours();
      hourlyData[hour].count++;
    }
  });

  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const width = 1000 - margin.left - margin.right;
  const height = 200 - margin.top - margin.bottom;

  const svg = d3.select('#timeline-chart')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, 23])
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(hourlyData, d => d.count)])
    .range([height, 0]);

  const line = d3.line()
    .x(d => x(d.hour))
    .y(d => y(d.count))
    .curve(d3.curveMonotoneX);

  svg.append('path')
    .datum(hourlyData)
    .attr('fill', 'none')
    .attr('stroke', '#667eea')
    .attr('stroke-width', 2)
    .attr('d', line);

  svg.selectAll('circle')
    .data(hourlyData)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.hour))
    .attr('cy', d => y(d.count))
    .attr('r', 4)
    .attr('fill', '#764ba2');

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(24));

  svg.append('g')
    .call(d3.axisLeft(y));
}

function renderTable(searchTerm = '', categoryFilter = '') {
  const filteredData = allCookies
    .map((cookie, idx) => ({
      ...cookie,
      classification: allClassifications[idx]
    }))
    .filter(item => {
      const matchesSearch = !searchTerm ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.domain.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = !categoryFilter ||
        item.classification?.category === categoryFilter;

      return matchesSearch && matchesCategory;
    })
    .slice(0, 100);

  const table = d3.select('#cookie-table');
  table.selectAll('*').remove();

  const tableEl = table.append('table');
  const thead = tableEl.append('thead');
  const tbody = tableEl.append('tbody');

  thead.append('tr')
    .selectAll('th')
    .data(['Name', 'Domain', 'Category', 'Confidence', 'Secure', 'Expires'])
    .enter()
    .append('th')
    .text(d => d);

  const rows = tbody.selectAll('tr')
    .data(filteredData)
    .enter()
    .append('tr');

  rows.append('td').text(d => d.name);
  rows.append('td').attr('class', 'domain-cell').text(d => d.domain);
  rows.append('td').html(d =>
    `<span class="category-badge ${d.classification?.category || 'unknown'}">
      ${d.classification?.category || 'unknown'}
    </span>`
  );
  rows.append('td').html(d =>
    `<span class="confidence">${Math.round((d.classification?.confidence || 0) * 100)}%</span>`
  );
  rows.append('td').text(d => d.secure ? 'Yes' : 'No');
  rows.append('td').text(d => {
    if (!d.expirationDate) return 'Session';
    const date = new Date(d.expirationDate * 1000);
    return date.toLocaleDateString();
  });
}

function setupEventListeners() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    const categoryFilter = document.getElementById('category-filter').value;
    renderTable(searchTerm, categoryFilter);
  });

  document.getElementById('category-filter').addEventListener('change', (e) => {
    const categoryFilter = e.target.value;
    const searchTerm = document.getElementById('search-input').value;
    renderTable(searchTerm, categoryFilter);
  });
}

init();
