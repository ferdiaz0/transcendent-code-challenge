/**
 * Prints step progress in a terminal:
 *
 *   [1/5] Find this week's popular stories: 100+ points in the last 7 days
 *   [2/5] Download comment threads: 87 of 150 threads
 *
 * In an interactive terminal (`inline: true`), updates within a step rewrite the
 * same line. Otherwise (e.g. server logs) only step changes are printed.
 */
export function createConsoleProgress(steps, { inline = Boolean(process.stdout.isTTY), write = (text) => process.stdout.write(text) } = {}) {
  let currentStepId = null;

  return ({ step, detail }) => {
    const index = steps.findIndex((candidate) => candidate.id === step);
    const line = `[${index + 1}/${steps.length}] ${steps[index].label}${detail ? `: ${detail}` : ''}`;
    const isNewStep = step !== currentStepId;
    currentStepId = step;

    if (!inline) {
      if (isNewStep) write(`${line}\n`);
      return;
    }
    // "\r\x1b[K" moves to the start of the line and clears it, so the line updates in place.
    write(isNewStep ? `${index === 0 ? '' : '\n'}${line}` : `\r\x1b[K${line}`);
  };
}
