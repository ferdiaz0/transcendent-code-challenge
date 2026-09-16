import { api } from '../api.js';
import { h, svg, formatNumber } from '../dom.js';

/**
 * The Embedding map page: every stored chunk as a dot, flattened from 384
 * dimensions to 2 with PCA (computed on the server). Dots that are close
 * together are about similar things.
 */

const WIDTH = 900;
const HEIGHT = 560;
const PADDING = 16;
const PALETTE = ['#e8590c', '#1c7ed6', '#2f9e44', '#9c36b5', '#e03131', '#0c8599', '#f08c00', '#5c7cfa', '#c2255c', '#66a80f'];
const OTHER_COLOR = '#adb5bd';

export async function renderMapView() {
  const map = await api.getEmbeddingMap();
  if (map.points.length === 0) {
    return h('section', { class: 'empty card' }, h('h2', {}, 'No embeddings yet'), h('p', {}, 'Refresh the data to fill the database.'));
  }

  const options = { sizeByRetrieval: false };
  const chart = h('div', { class: 'map-chart card' });
  const draw = () => chart.replaceChildren(renderScatterPlot(map.points, options));
  draw();

  return h('section', { class: 'map-page' },
    h('div', { class: 'intro' },
      h('h2', {}, 'Embedding map'),
      h('p', {}, `${formatNumber(map.points.length)} chunks. Each one is embedded as 384 numbers, then flattened to two with PCA (principal component analysis). `,
        'Nearby dots have similar meaning. Hover over a dot to read it, or click to open it on Hacker News.'),
      h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', onChange: (event) => { options.sizeByRetrieval = event.target.checked; draw(); } }),
        ' Size dots by how often RAG retrieved them'),
    ),
    h('div', { class: 'map-layout' }, chart, renderLegend(map.highlightedStories)),
  );
}

function renderScatterPlot(points, options) {
  const scale = makeScales(points);
  // Gray dots are drawn first so colored stories stay visible on top.
  const drawOrder = [...points.keys()].sort((a, b) => Number(points[a].colorIndex !== -1) - Number(points[b].colorIndex !== -1));

  const plot = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'scatter', role: 'img', 'aria-label': 'Scatter plot of chunk embeddings' },
    drawOrder.map((index) => renderDot(points[index], index, scale, options)),
  );
  attachTooltip(plot, points);
  return plot;
}

function renderDot(point, index, scale, options) {
  const radius = options.sizeByRetrieval ? 2 + Math.sqrt(point.retrievalCount) * 3 : 3;
  const faded = options.sizeByRetrieval && point.retrievalCount === 0;
  return svg('circle', {
    cx: scale.x(point.x).toFixed(1),
    cy: scale.y(point.y).toFixed(1),
    r: radius.toFixed(1),
    fill: point.colorIndex === -1 ? OTHER_COLOR : PALETTE[point.colorIndex % PALETTE.length],
    'fill-opacity': faded ? 0.15 : 0.75,
    'data-index': index,
  });
}

function makeScales(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return {
    x: (value) => PADDING + ((value - minX) / (maxX - minX || 1)) * (WIDTH - 2 * PADDING),
    y: (value) => HEIGHT - PADDING - ((value - minY) / (maxY - minY || 1)) * (HEIGHT - 2 * PADDING),
  };
}

/**
 * One set of listeners on the whole plot ("event delegation") instead of
 * thousands of listeners, one per dot.
 */
function attachTooltip(plot, points) {
  const tooltip = document.getElementById('tooltip');
  const pointUnderMouse = (event) => points[event.target.dataset?.index];

  plot.addEventListener('mousemove', (event) => {
    const point = pointUnderMouse(event);
    if (!point) return hideTooltip(tooltip);
    tooltip.replaceChildren(
      h('strong', {}, point.storyTitle),
      h('span', { class: 'muted' }, `${point.kind} by ${point.author} · retrieved ${point.retrievalCount}×`),
      h('p', {}, point.snippet),
    );
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
    tooltip.style.top = `${Math.min(event.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8)}px`;
  });
  plot.addEventListener('mouseleave', () => hideTooltip(tooltip));
  plot.addEventListener('click', (event) => {
    const point = pointUnderMouse(event);
    if (point) window.open(point.permalink, '_blank', 'noopener');
  });
}

function hideTooltip(tooltip) {
  tooltip.hidden = true;
}

function renderLegend(highlightedStories) {
  return h('aside', { class: 'legend card' },
    h('h4', {}, 'Most-upvoted stories'),
    h('ul', {},
      highlightedStories.map((story) =>
        h('li', {},
          h('span', { class: 'swatch', style: `background:${PALETTE[story.colorIndex % PALETTE.length]}` }),
          h('span', {}, story.storyTitle, h('span', { class: 'muted' }, ` · ${formatNumber(story.points)} pts`)))),
      h('li', {}, h('span', { class: 'swatch', style: `background:${OTHER_COLOR}` }), h('span', { class: 'muted' }, 'All other stories')),
    ),
  );
}
