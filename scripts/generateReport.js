/**
 * Usage: npm run report              saves to data/reports/
 *        npm run report -- --sample  also saves it as samples/sample-report.json (commit this)
 *
 * Generates the A/B report from the command line, without starting the web server.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServices } from '../src/createServices.js';
import { generateComparison, REPORT_STEPS } from '../src/generation/generateComparison.js';
import { createConsoleProgress } from '../src/utils/consoleProgress.js';

const services = createServices();
const { config } = services;

if (!services.llm) {
  console.error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

try {
  const onProgress = createConsoleProgress(REPORT_STEPS);
  const report = await generateComparison({ ...services, onProgress });

  onProgress({ step: 'save' });
  const savedPath = services.reportRepository.save(report);
  if (process.argv.includes('--sample')) {
    mkdirSync(dirname(config.storage.sampleReportPath), { recursive: true });
    writeFileSync(config.storage.sampleReportPath, JSON.stringify(report, null, 2));
  }
  console.log(`\n\nSaved ${savedPath}${process.argv.includes('--sample') ? ` and ${config.storage.sampleReportPath}` : ''}`);

  printSummary(report);
} finally {
  services.store.close();
}

function printSummary({ metrics, judge }) {
  console.table({ 'A: no RAG': flatten(metrics.baseline), 'B: RAG': flatten(metrics.rag) });
  if (judge.error) console.log(`Judge failed: ${judge.error}`);
  else console.log(`Judge winner: ${judge.winner}. ${judge.rationale}`);
}

function flatten({ topThreadCoverage, ...numbers }) {
  return { ...numbers, topThreadCoverage: `${topThreadCoverage.covered}/${topThreadCoverage.total}` };
}
