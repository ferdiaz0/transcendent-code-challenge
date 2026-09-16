import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Saves generated reports as JSON files (one per run) and finds the newest one.
 * Plain files are enough here: reports are written rarely and read whole.
 */
export class ReportRepository {
  constructor({ reportsDirectory, sampleReportPath }) {
    this.reportsDirectory = reportsDirectory;
    this.sampleReportPath = sampleReportPath;
  }

  save(report) {
    mkdirSync(this.reportsDirectory, { recursive: true });
    const filePath = join(this.reportsDirectory, `${report.id}.json`);
    writeFileSync(filePath, JSON.stringify(report, null, 2));
    return filePath;
  }

  /**
   * The newest generated report. Falls back to the committed sample (flagged
   * with `isSample: true`) so a fresh clone still has something to show.
   */
  loadLatest() {
    const newestFile = this.listReportFiles().at(-1);
    if (newestFile) return readJson(join(this.reportsDirectory, newestFile));
    if (this.sampleReportPath && existsSync(this.sampleReportPath)) {
      return { ...readJson(this.sampleReportPath), isSample: true };
    }
    return null;
  }

  // Report ids are ISO timestamps, so alphabetical order is chronological order.
  listReportFiles() {
    if (!existsSync(this.reportsDirectory)) return [];
    return readdirSync(this.reportsDirectory).filter((name) => name.endsWith('.json')).sort();
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
