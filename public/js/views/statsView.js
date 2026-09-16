import { api } from '../api.js';
import { h, formatNumber, formatDate } from '../dom.js';

const ROWS_TO_SHOW = 50;

/**
 * The Retrieval stats page: which chunks RAG pulls into reports most often.
 * Chunks that keep getting retrieved are the week's most "central" voices.
 */
export async function renderStatsView() {
  const { summary, topChunks } = await api.getRetrievalStats(ROWS_TO_SHOW);
  const retrievedShare = summary.totalChunks ? Math.round((summary.retrievedChunks / summary.totalChunks) * 100) : 0;

  return h('section', { class: 'stats-page' },
    h('h2', {}, 'Retrieval stats'),
    h('p', { class: 'muted' }, 'Every time a report is generated, each retrieved chunk\'s counter goes up by one.'),
    h('div', { class: 'stat-cards' },
      statCard('Chunks stored', formatNumber(summary.totalChunks)),
      statCard('Chunks ever retrieved', `${formatNumber(summary.retrievedChunks)} (${retrievedShare}%)`),
      statCard('Total retrievals', formatNumber(summary.totalRetrievals)),
    ),
    topChunks.length === 0
      ? h('p', { class: 'card empty' }, 'Nothing has been retrieved yet. Generate a report to see stats here.')
      : renderTable(topChunks),
  );
}

function statCard(label, value) {
  return h('div', { class: 'stat card' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'muted' }, label));
}

function renderTable(chunks) {
  return h('div', { class: 'table-scroll card' },
    h('table', { class: 'stats-table' },
      h('thead', {}, h('tr', {}, ['#', 'Retrieved', 'Source', 'Excerpt', 'Last retrieved'].map((label) => h('th', {}, label)))),
      h('tbody', {}, chunks.map((chunk, index) =>
        h('tr', {},
          h('td', {}, index + 1),
          h('td', { class: 'count' }, `${chunk.retrievalCount}×`),
          h('td', {},
            h('a', { href: chunk.permalink, target: '_blank', rel: 'noopener' }, chunk.storyTitle),
            h('div', { class: 'muted' }, `${chunk.kind} by ${chunk.author}`)),
          h('td', { class: 'snippet' }, chunk.text.slice(0, 280)),
          h('td', { class: 'muted nowrap' }, formatDate(chunk.lastRetrievedAt)),
        ))),
    ),
  );
}
