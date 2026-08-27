import './styles.css';

import { UGP_PROTOCOL_VERSION } from '@ui-grounding/protocol';

import { createBiLab } from './app.js';

document.documentElement.dataset.ugpExample = 'bi-dashboard';
const buildCommit = import.meta.env.VITE_BUILD_COMMIT || 'development';
const debugEnabled = import.meta.env.VITE_UGP_DEBUG === 'true';

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">U</span><span>UGP BI Lab</span></div>
    <div class="topbar-actions">
      <span class="status"><i></i> Deterministic scenario</span>
      <button class="role-switch" data-action="role" type="button">Analyst <span>⌄</span></button>
    </div>
  </header>
  <main class="shell">
    <section class="page-head">
      <div><p class="eyebrow">OPERATING REVIEW · Q2 2026</p><h1>Revenue intelligence</h1><p class="subtitle">Select anything visible to inspect its authoritative business meaning.</p></div>
      <div class="selection-mode" data-ugp-overlay-ui="true" aria-label="Selection mode"><button class="active" data-mode="point" type="button">↖ Point</button><button data-mode="region" type="button">▱ Region</button><button data-mode="text" type="button">T Text</button></div>
    </section>
    <section class="filters" aria-label="Dashboard filters"><span class="filter-label">Filters</span><button class="filter-chip" data-action="filter" type="button">All regions <b>×</b></button><button class="filter-chip" type="button">24 months <b>×</b></button><button class="filter-add" type="button">＋ Add filter</button><span class="revision">UGP <b>${UGP_PROTOCOL_VERSION}</b> · build <b>${buildCommit}</b> · query <strong>q-001</strong></span></section>
    <section class="kpis" aria-label="Key performance indicators">
      <article class="kpi selected" data-metric-id="revenue"><div class="kpi-top"><span>Revenue</span><em>Authoritative</em></div><strong data-metric-value="revenue">$8.42M</strong><p class="positive">↗ 12.4% <span>vs prior period</span></p><div class="sparkline s1"></div></article>
      <article class="kpi" data-metric-id="orders"><div class="kpi-top"><span>Orders</span><em>Authoritative</em></div><strong data-metric-value="orders">12,840</strong><p class="positive">↗ 8.1% <span>vs prior period</span></p><div class="sparkline s2"></div></article>
      <article class="kpi" data-metric-id="conversion_rate"><div class="kpi-top"><span>Conversion rate</span><em>Authoritative</em></div><strong data-metric-value="conversion_rate">3.84%</strong><p class="negative">↘ 1.7% <span>vs prior period</span></p><div class="sparkline s3"></div></article>
      <article class="kpi" data-metric-id="refund_rate"><div class="kpi-top"><span>Refund rate</span><em>Authoritative</em></div><strong data-metric-value="refund_rate">2.16%</strong><p class="positive">↘ 0.4% <span>vs prior period</span></p><div class="sparkline s4"></div></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel trend-panel"><div class="panel-head"><div><p class="eyebrow">TIME SERIES</p><h2>Revenue trend</h2></div><span class="legend"><i></i> Revenue</span></div><div class="chart-wrap"><canvas id="trend-chart" width="760" height="280" aria-label="Revenue trend canvas chart"></canvas><div class="chart-anomaly">Inventory constraint</div></div></article>
      <article class="panel region-panel"><div class="panel-head"><div><p class="eyebrow">BREAKDOWN</p><h2>Revenue by region</h2></div><button class="ghost" type="button">•••</button></div><svg class="bar-chart" viewBox="0 0 430 280" role="img" aria-label="Revenue by region SVG chart"><g class="grid-lines"><path d="M70 20V240M160 20V240M250 20V240M340 20V240" /></g><g class="bars"><text x="8" y="41">East</text><rect id="bar-east" data-region-id="east" x="70" y="24" width="278" height="22" rx="4" /><text x="8" y="76">West</text><rect id="bar-west" data-region-id="west" x="70" y="59" width="234" height="22" rx="4" /><text x="8" y="111">North</text><rect id="bar-north" data-region-id="north" x="70" y="94" width="192" height="22" rx="4" /><text x="8" y="146">South</text><rect id="bar-south" data-region-id="south" x="70" y="129" width="168" height="22" rx="4" /><text x="8" y="181">Central</text><rect id="bar-central" data-region-id="central" x="70" y="164" width="142" height="22" rx="4" /><text x="8" y="216">Intl.</text><rect id="bar-international" data-region-id="international" x="70" y="199" width="112" height="22" rx="4" /></g><g class="axis"><text x="65" y="252">$0</text><text x="242" y="252">$1M</text><text x="332" y="252">$2M</text></g></svg></article>
      <article class="panel records-panel"><div class="panel-head"><div><p class="eyebrow">DETAIL</p><h2>Order records</h2></div><button class="record-count" data-action="sort" type="button">10,000 logical rows · sort</button></div><div class="table-head"><span>Order</span><span>Region</span><span>Segment</span><span>Revenue</span><span>Margin</span></div><div class="virtual-viewport" tabindex="0"><div class="virtual-spacer"><div class="virtual-rows"></div></div></div></article>
      <article class="panel insight-panel"><div class="panel-head"><div><p class="eyebrow">NARRATIVE INSIGHT</p><h2>What changed?</h2></div><span class="ai-badge">Deterministic</span></div><p data-insight-id="revenue-drop"><mark>Revenue softened in the East region between March and May</mark>, driven by inventory constraints in the Enterprise segment. Conversion recovered after the June restock.</p><button class="explain" type="button">Explain this insight →</button></article>
    </section>
  </main>
  <aside class="inspector" data-ugp-overlay-ui="true">
    <div class="inspector-head"><div><p class="eyebrow">GROUNDING INSPECTOR</p><h2>Resolved referent</h2></div><button type="button">×</button></div>
    <div class="selection-preview"><span class="crosshair">⌖</span><div><small>POINT SELECTION</small><strong>x 184 · y 236</strong></div><b>1.8ms</b></div>
    <div class="referent-card"><span class="authority">AUTHORITATIVE</span><h3>Revenue</h3><code>org.ugp.demo.bi.metric</code><dl><div><dt>entityRef</dt><dd>metrics/revenue</dd></div><div><dt>relation</dt><dd>contains-selection</dd></div><div><dt>confidence</dt><dd>1.00</dd></div><div><dt>revision</dt><dd>q-001</dd></div></dl></div>
    <div class="evidence"><h3>Evidence <span>2</span></h3><div><i>01</i><p><strong>anchor-hit</strong><small>DOM · visible ratio 1.00</small></p></div><div><i>02</i><p><strong>semantic-selector</strong><small>Declared by application</small></p></div></div>
    <button class="bundle-button" data-action="bundle" type="button"${debugEnabled ? '' : ' hidden'}>View GroundingBundle <span>{ }</span></button><pre class="bundle-json" hidden></pre>
  </aside>`;

const canvas = document.querySelector<HTMLCanvasElement>('#trend-chart')!;
const context = canvas.getContext('2d')!;
const values = [
  126, 142, 134, 167, 181, 176, 204, 218, 211, 239, 252, 246, 271, 286, 259,
  221, 214, 252, 279, 294, 306, 318, 337, 354,
];
context.scale(2, 2);
context.strokeStyle = '#e2e8f0';
context.lineWidth = 0.5;
for (let y = 25; y < 130; y += 26) {
  context.beginPath();
  context.moveTo(36, y);
  context.lineTo(372, y);
  context.stroke();
}
context.beginPath();
values.forEach((value, index) => {
  const x = 36 + index * (336 / (values.length - 1));
  const y = 140 - value * 0.32;
  if (index === 0) context.moveTo(x, y);
  else context.lineTo(x, y);
});
context.strokeStyle = '#2563eb';
context.lineWidth = 2;
context.stroke();
context.fillStyle = '#2563eb';
values.forEach((value, index) => {
  const x = 36 + index * (336 / (values.length - 1));
  const y = 140 - value * 0.32;
  context.beginPath();
  context.arc(x, y, 2.2, 0, Math.PI * 2);
  context.fill();
});

createBiLab(document.querySelector<HTMLElement>('#app')!);
