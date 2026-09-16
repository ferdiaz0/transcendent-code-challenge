import { createStepList, applyProgress, completeAllSteps, failCurrentStep } from '../utils/stepTracker.js';

/**
 * Ingest and report generation take a minute or more, far longer than an HTTP
 * request should wait. So the API starts them as background "jobs" and the page
 * polls /api/status to show a live checklist of their steps.
 */
export class JobRunner {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Starts `work` in the background unless a job with that name is already running.
   *
   * @param {string} name
   * @param {(onProgress: Function) => Promise<any>} work  calls onProgress({ step, detail, current, total })
   * @param {{ steps: Array<{id: string, label: string}> }} options  every step the job will go through, in order
   * @returns {boolean} whether the job was started
   */
  start(name, work, { steps }) {
    if (this.isRunning(name)) return false;

    const job = {
      name,
      running: true,
      steps: createStepList(steps),
      error: null,
      result: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(name, job);

    const onProgress = (update) => applyProgress(job.steps, update);

    // `new Promise` runs `work` right away and turns a synchronous throw into a rejection.
    job.promise = new Promise((resolve) => resolve(work(onProgress)))
      .then((result) => {
        completeAllSteps(job.steps);
        job.result = result ?? null;
      })
      .catch((error) => {
        failCurrentStep(job.steps);
        job.error = error.message;
      })
      .finally(() => {
        job.running = false;
        job.finishedAt = new Date().toISOString();
      });
    return true;
  }

  isRunning(name) {
    return this.jobs.get(name)?.running === true;
  }

  /** A JSON-safe snapshot of the job (without the internal promise), or null. */
  getStatus(name) {
    const job = this.jobs.get(name);
    if (!job) return null;
    const { promise, ...status } = job;
    return status;
  }

  /** Resolves when the job finishes. Handy in tests and CLI scripts. */
  async waitFor(name) {
    await this.jobs.get(name)?.promise;
  }
}
