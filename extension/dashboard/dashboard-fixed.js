console.log('🍪 Dashboard loading...');
let allCookiesData = [];
async function loadDataFromBackground() {
  console.log('🔄 Loading cookie data...');
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll({}, (cookies) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting cookies:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      console.log('✓ Got', cookies.length, 'cookies from Chrome API');
      const enrichedCookies = cookies.map(cookie => ({
        ...cookie,
        classification: classifyCookie(cookie),
        timestamp: Date.now()
      }));
      resolve(enrichedCookies);
    });
  });
}
function classifyCookie(cookie) {
  const name = cookie.name.toLowerCase();
  const domain = cookie.domain.toLowerCase();
  if (/^(session|csrf|auth|token|sidcc|__secure-.*sidcc|nid|hsid|ssid|apisid|sapisid)/i.test(name)) {
    return { category: 'essential', confidence: 0.95 };
  }
  if (/google\.com|gstatic\.com|youtube\.com/.test(domain) && cookie.secure) {
    return { category: 'essential', confidence: 0.9 };
  }
  if (/^jsessionid/i.test(name)) {
    return { category: 'essential', confidence: 0.95 };
  }
  if (/^(_ga|_gid|_gat|__utm)/i.test(name)) {
    return { category: 'analytics', confidence: 0.9 };
  }
  if (/analytics/i.test(name) && !name.startsWith('lms_')) {
    return { category: 'analytics', confidence: 0.85 };
  }
  if (/^(_fbp|_fbc|fr|ide|test_cookie)/i.test(name)) {
    return { category: 'advertising', confidence: 0.9 };
  }
  if (/doubleclick|adsense|adservice/.test(domain)) {
    return { category: 'advertising', confidence: 0.9 };
  }
  if (/connect\.facebook\.net|platform\.twitter\.com|platform\.linkedin\.com|widgets\.pinterest\.com|embed\.reddit\.com/.test(domain)) {
    return { category: 'social', confidence: 0.85 };
  }
  if (cookie.hostOnly && !cookie.expirationDate) {
    return { category: 'functional', confidence: 0.7 };
  }
  const linkedInPatterns = /^(bcookie|bscookie|lang|lidc|li_at|li_theme|timezone|sdui_ver|li_sugr|aam_uuid|g_state|liap|lms_ads|lms_analytics|dfpfpt|fptctx2|_guid|_pxvid|UserMatchHistory|AnalyticsSyncHistory)/i;
  if (/linkedin\.com/.test(domain) && linkedInPatterns.test(name)) {
    return { category: 'functional', confidence: 0.85 };
  }
  if (/facebook\.com/.test(domain) && /^(c_user|xs|datr|locale|wd)/i.test(name)) {
    return { category: 'functional', confidence: 0.85 };
  }
  if (/^__cf_bm/i.test(name)) {
    return { category: 'functional', confidence: 0.8 };
  }
  if (/^(AMCV_|AMCVS_)/i.test(name)) {
    return { category: 'functional', confidence: 0.75 };
  }
  return { category: 'unknown', confidence: 0.5 };
}
async function getAdvancedStats() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_ADVANCED_STATS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting advanced stats:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response || { fingerprintCount: 0, cnameCount: 0, fingerprints: [], cnameDetections: [] });
    });
  });
}
async function init() {
  console.log('🔄 Initializing dashboard...');
  try {
    allCookiesData = await loadDataFromBackground();
    console.log('✓ Loaded', allCookiesData.length, 'cookies');
    if (allCookiesData.length === 0) {
      document.querySelector('.dashboard').innerHTML = `
        <div style="padding: 60px; text-align: center; max-width: 600px; margin: 0 auto;">
          <h1 style="font-size: 48px; margin-bottom: 20px;">🍪</h1>
          <h2 style="color: #667eea; margin-bottom: 16px;">No Cookies Yet</h2>
          <p style="color: #666; font-size: 16px; margin-bottom: 24px;">
            Visit some websites to start tracking cookies!
          </p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="font-weight: 600; margin-bottom: 12px;">Try visiting:</p>
            <ul style="list-style: none; padding: 0;">
              <li style="margin: 8px 0;"><a href="https://www.cnn.com" target="_blank" style="color: #667eea;">CNN</a></li>
              <li style="margin: 8px 0;"><a href="https://www.nytimes.com" target="_blank" style="color: #667eea;">NY Times</a></li>
              <li style="margin: 8px 0;"><a href="https://www.forbes.com" target="_blank" style="color: #667eea;">Forbes</a></li>
            </ul>
          </div>
          <button onclick="location.reload()" style="background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">
            Refresh Dashboard
          </button>
        </div>
      `;
      return;
    }
    renderDashboard();
    setupEventListeners();
    console.log('✓ Dashboard ready');
  } catch (error) {
    console.error('Dashboard init error:', error);
    document.querySelector('.dashboard').innerHTML = `
      <div style="padding: 60px; text-align: center;">
        <h1 style="font-size: 48px; margin-bottom: 20px;">⚠️</h1>
        <h2 style="color: #dc3545; margin-bottom: 16px;">Dashboard Error</h2>
        <p style="color: #666; margin-bottom: 24px;">${error.message || 'Unknown error occurred'}</p>
        <button onclick="location.reload()" style="background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">
          Retry
        </button>
      </div>
    `;
  }
}
async function renderDashboard() {
  const currentSearch = document.getElementById('search-input')?.value || '';
  const currentFilter = document.getElementById('category-filter')?.value || '';
  
  await updateOverviewStats();
  await renderDetectionAlerts();
  renderPieChart();
  renderBarChart();
  renderTimeline();
  renderTable(currentSearch, currentFilter);
}
async function updateOverviewStats() {
  const total = allCookiesData.length;
  document.getElementById('overview-total').textContent = total;
  const uniqueDomains = new Set(allCookiesData.map(c => c.domain)).size;
  document.getElementById('overview-domains').textContent = uniqueDomains;
  const trackers = allCookiesData.filter(c =>
    c.classification && (c.classification.category === 'advertising' || c.classification.category === 'analytics')
  ).length;
  document.getElementById('overview-trackers').textContent = trackers;
  try {
    const stats = await getAdvancedStats();
    console.log('🔍 updateOverviewStats received:', stats);
    document.getElementById('overview-fingerprints').textContent = stats.fingerprintCount || 0;
    document.getElementById('overview-cname').textContent = stats.cnameCount || 0;
  } catch (error) {
    console.error('Error fetching advanced stats:', error);
    document.getElementById('overview-fingerprints').textContent = '--';
    document.getElementById('overview-cname').textContent = '--';
  }
}
async function renderDetectionAlerts() {
  try {
    const stats = await getAdvancedStats();
    console.log('📊 Dashboard received stats:', stats);
    console.log('📊 CNAME detections:', stats.cnameDetections);
    
    const cnameAlertsSection = document.getElementById('cname-alerts');
    const cnameList = document.getElementById('cname-list');
    if (stats.cnameDetections && stats.cnameDetections.length > 0) {
      console.log(`✅ Showing ${stats.cnameDetections.length} CNAME detections`);
      cnameAlertsSection.style.display = 'block';
      cnameList.innerHTML = '';
      const groupedCNAME = stats.cnameDetections.reduce((acc, detection) => {
        const key = detection.domain;
        if (!acc[key]) {
          acc[key] = detection;
        }
        return acc;
      }, {});
      Object.values(groupedCNAME).forEach(detection => {
        const item = document.createElement('div');
        item.className = 'cname-item';
        item.innerHTML = `
          <strong>${detection.domain}</strong>
          <div class="cname-chain">
            ${detection.domain} → ${detection.cname} → ${detection.trackerDomain || 'tracker'}
          </div>
          <div style="margin-top: 6px; font-size: 11px; color: #721c24;">
            This first-party domain is actually a CNAME pointing to a third-party tracker
          </div>
        `;
        cnameList.appendChild(item);
      });
    } else {
      console.log('❌ No CNAME detections to show');
      cnameAlertsSection.style.display = 'none';
    }
    const fingerprintAlertsSection = document.getElementById('fingerprint-alerts');
    const fingerprintSummary = document.getElementById('fingerprint-summary');
    if (stats.fingerprints && stats.fingerprints.length > 0) {
      fingerprintAlertsSection.style.display = 'block';
      fingerprintSummary.innerHTML = '';
      const techniques = stats.fingerprints.reduce((acc, fp) => {
        acc[fp.technique] = (acc[fp.technique] || 0) + 1;
        return acc;
      }, {});
      const domains = [...new Set(stats.fingerprints.map(fp => fp.domain))];
      const item = document.createElement('div');
      item.className = 'fingerprint-item';
      item.innerHTML = `
        <strong>${domains.length} domain${domains.length !== 1 ? 's' : ''} detected using fingerprinting</strong>
        <div class="fingerprint-stats">
          ${Object.entries(techniques).map(([tech, count]) => `
            <div class="fingerprint-stat">
              <span class="count">${count}</span>
              <span class="label">${tech}</span>
            </div>
          `).join('')}
        </div>
        <div style="margin-top: 12px; font-size: 11px; color: #0c5460;">
          Top domains: ${domains.slice(0, 3).join(', ')}${domains.length > 3 ? '...' : ''}
        </div>
      `;
      fingerprintSummary.appendChild(item);
    } else {
      fingerprintAlertsSection.style.display = 'none';
    }
  } catch (error) {
    console.error('Error rendering detection alerts:', error);
  }
}
function calculatePrivacyScore() {
  if (allCookiesData.length === 0) return '--';
  const categoryCounts = allCookiesData.reduce((acc, c) => {
    const category = c.classification?.category || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const total = allCookiesData.length;
  const score = 100 -
    ((categoryCounts.advertising || 0) / total * 40) -
    ((categoryCounts.social || 0) / total * 30) -
    ((categoryCounts.analytics || 0) / total * 20) -
    ((categoryCounts.functional || 0) / total * 5);
  return Math.max(0, Math.round(score));
}
function renderPieChart() {
  const categoryCounts = allCookiesData.reduce((acc, c) => {
    const category = c.classification?.category || 'unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const data = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count
  }));
  if (data.length === 0) {
    document.getElementById('pie-chart').innerHTML = '<p style="text-align:center;color:#999;">No data yet</p>';
    return;
  }
  const width = 400;
  const height = 300;
  const radius = Math.min(width, height) / 2 - 40;
  const color = d3.scaleOrdinal()
    .domain(['essential', 'functional', 'analytics', 'advertising', 'social', 'unknown'])
    .range(['#10b981', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']);
  d3.select('#pie-chart').selectAll('*').remove();
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
    .attr('stroke', '#141414')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('transform', 'scale(1.08)');
      const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip-pie')
        .style('position', 'absolute')
        .style('background', '#1a1a1a')
        .style('color', 'white')
        .style('padding', '10px 14px')
        .style('border-radius', '8px')
        .style('font-size', '12px')
        .style('border', '1px solid #2a2a2a')
        .style('pointer-events', 'none')
        .style('z-index', '1000')
        .html(`<strong>${d.data.category}</strong><br>${d.data.count} cookies (${Math.round(d.data.count / data.reduce((s, x) => s + x.count, 0) * 100)}%)`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px')
        .style('opacity', 1);
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('transform', 'scale(1)');
      d3.selectAll('.tooltip-pie').remove();
    })
    .on('click', function(event, d) {
      const categoryFilter = document.getElementById('category-filter');
      categoryFilter.value = d.data.category;
      categoryFilter.dispatchEvent(new Event('change'));
      document.getElementById('cookie-table').scrollIntoView({ behavior: 'smooth' });
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
      .attr('fill', '#ccc')
      .style('cursor', 'pointer')
      .text(`${d.category} (${d.count})`)
      .on('click', function() {
        const categoryFilter = document.getElementById('category-filter');
        categoryFilter.value = d.category;
        categoryFilter.dispatchEvent(new Event('change'));
        document.getElementById('cookie-table').scrollIntoView({ behavior: 'smooth' });
      });
  });
}
function renderBarChart() {
  const domainCounts = allCookiesData.reduce((acc, cookie) => {
    acc[cookie.domain] = (acc[cookie.domain] || 0) + 1;
    return acc;
  }, {});
  const data = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  if (data.length === 0) {
    document.getElementById('bar-chart').innerHTML = '<p style="text-align:center;color:#999;">No data yet</p>';
    return;
  }
  const margin = { top: 20, right: 20, bottom: 100, left: 50 };
  const width = 400 - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;
  d3.select('#bar-chart').selectAll('*').remove();
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
    .attr('fill', '#3b82f6')
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('fill', '#2563eb');
      const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip-bar')
        .style('position', 'absolute')
        .style('background', '#1a1a1a')
        .style('color', 'white')
        .style('padding', '10px 14px')
        .style('border-radius', '8px')
        .style('font-size', '12px')
        .style('border', '1px solid #2a2a2a')
        .style('pointer-events', 'none')
        .style('z-index', '1000')
        .html(`<strong>${d.domain}</strong><br>${d.count} cookies`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px')
        .style('opacity', 1);
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('fill', '#3b82f6');
      d3.selectAll('.tooltip-bar').remove();
    })
    .on('click', function(event, d) {
      const searchInput = document.getElementById('search-input');
      searchInput.value = d.domain;
      searchInput.dispatchEvent(new Event('input'));
      document.getElementById('cookie-table').scrollIntoView({ behavior: 'smooth' });
    });
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end')
    .style('font-size', '10px')
    .style('fill', '#888');
  svg.append('g')
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('fill', '#888');
  svg.selectAll('.domain, .tick line')
    .style('stroke', '#2a2a2a');
}
function renderTimeline() {
  const hourlyData = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  allCookiesData.forEach(cookie => {
    const cookieTime = cookie.timestamp || now;
    if (cookieTime > oneDayAgo) {
      const hour = new Date(cookieTime).getHours();
      hourlyData[hour].count++;
    }
  });
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const width = 1000 - margin.left - margin.right;
  const height = 200 - margin.top - margin.bottom;
  d3.select('#timeline-chart').selectAll('*').remove();
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
    .domain([0, d3.max(hourlyData, d => d.count) || 10])
    .range([height, 0]);
  const line = d3.line()
    .x(d => x(d.hour))
    .y(d => y(d.count))
    .curve(d3.curveMonotoneX);
  svg.append('path')
    .datum(hourlyData)
    .attr('fill', 'none')
    .attr('stroke', '#3b82f6')
    .attr('stroke-width', 3)
    .attr('d', line);
  svg.selectAll('circle')
    .data(hourlyData)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.hour))
    .attr('cy', d => y(d.count))
    .attr('r', 5)
    .attr('fill', '#8b5cf6')
    .attr('stroke', '#ec4899')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', 8);
      const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip-timeline')
        .style('position', 'absolute')
        .style('background', '#1a1a1a')
        .style('color', 'white')
        .style('padding', '10px 14px')
        .style('border-radius', '8px')
        .style('font-size', '12px')
        .style('border', '1px solid #2a2a2a')
        .style('pointer-events', 'none')
        .style('z-index', '1000')
        .html(`<strong>Hour ${d.hour}:00</strong><br>${d.count} cookies`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px')
        .style('opacity', 1);
    })
    .on('mouseout', function() {
      d3.select(this)
        .transition()
        .duration(200)
        .attr('r', 5);
      d3.selectAll('.tooltip-timeline').remove();
    });
  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(24))
    .selectAll('text')
    .style('fill', '#888');
  svg.append('g')
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('fill', '#888');
  svg.selectAll('.domain, .tick line')
    .style('stroke', '#2a2a2a');
}
function renderTable(searchTerm = '', categoryFilter = '') {
  const filteredData = allCookiesData
    .filter(item => {
      const matchesSearch = !searchTerm ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.domain.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !categoryFilter ||
        item.classification?.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .slice(0, 100);
  d3.select('#cookie-table').selectAll('*').remove();
  const table = d3.select('#cookie-table');
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
    .append('tr')
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      const details = `
Cookie Details:
Name: ${d.name}
Domain: ${d.domain}
Path: ${d.path}
Category: ${d.classification?.category || 'unknown'}
Confidence: ${Math.round((d.classification?.confidence || 0) * 100)}%
Secure: ${d.secure ? 'Yes' : 'No'}
HttpOnly: ${d.httpOnly ? 'Yes' : 'No'}
SameSite: ${d.sameSite || 'None'}
Expires: ${d.expirationDate ? new Date(d.expirationDate * 1000).toLocaleString() : 'Session'}
      `;
      alert(details.trim());
    });
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
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '⟳ Refreshing...';
      refreshBtn.disabled = true;
      try {
        allCookiesData = await loadDataFromBackground();
        await renderDashboard();
      } catch (err) {
        console.error('Manual refresh failed:', err);
      }
      refreshBtn.textContent = '↻ Refresh Data';
      refreshBtn.disabled = false;
    });
  }
  setInterval(async () => {
    await loadDataFromBackground().then(data => {
      allCookiesData = data;
      renderDashboard();
    }).catch(err => console.error('Auto-refresh failed:', err));
  }, 10000);
}
if (typeof d3 !== 'undefined') {
  init();
} else {
  window.addEventListener('load', init);
}
console.log('✓ Dashboard script loaded');
