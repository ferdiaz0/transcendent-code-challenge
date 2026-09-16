/**
 * Everything Claude reads when writing a Community Voices document.
 *
 * A/B fairness: both variants get the SAME system prompt and the SAME task message.
 * The only difference is that the RAG variant also receives the retrieved context.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const SYSTEM_PROMPT = `You are the editor of "Community Voices", a weekly document about an online community. Readers want to know what the community talked about during the past week and what it is likely to talk about next week.

Guidelines:
- Organize the past week into 4 to 7 themes, most discussed first. Be specific: name the projects, companies, people and disagreements involved.
- Represent the range of opinions in the community, not only the majority view.
- Make 3 to 5 predictions for next week. Each must follow from a signal in the past week (an ongoing debate, an announced release or event, a rising topic), and the rationale must name that signal.
- Source material, when provided, is labeled with ids like [S12]. List the ids that support each theme or prediction in sourceIds. Never invent ids.
- notableVoices must be quotes copied verbatim from the provided source material, each with the id of its source. If no source material is provided, leave notableVoices empty.
- Use caveats to state honestly what you could not know or verify.`;

/** "The past week" as concrete dates, e.g. { label: 'Sep 9 – Sep 16, 2026' }. */
export function describeWeek(now, lookbackDays) {
  const start = new Date(now.getTime() - lookbackDays * MS_PER_DAY);
  const format = (date, options) => date.toLocaleDateString('en-US', { timeZone: 'UTC', ...options });
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
    label: `${format(start, { month: 'short', day: 'numeric' })} – ${format(now, { month: 'short', day: 'numeric', year: 'numeric' })}`,
  };
}

export function buildTaskMessage({ communityName, week }) {
  return `Write this week's Community Voices document for the ${communityName} community.
Week covered: ${week.label} (${week.startDate} to ${week.endDate}).
Predictions are for the week after ${week.endDate}.`;
}

/**
 * Variant A (baseline): the task alone. Claude can only use what it learned in training.
 */
export function buildBaselineUserMessage({ communityName, week }) {
  return buildTaskMessage({ communityName, week });
}

/**
 * Variant B (RAG): the task plus the context we retrieved from our database.
 */
export function buildRagUserMessage({ communityName, week, contextText }) {
  return `${buildTaskMessage({ communityName, week })}

Use the source material below, retrieved from this week's ${communityName} discussions.

${contextText}`;
}

/**
 * Turns retrieval results into the text block Claude reads, and a lookup table
 * from short source ids ("S7") back to the original chunks (for links and verification).
 *
 * @returns {{ contextText: string, sources: Object<string, Object> }}
 */
export function buildRagContext({ topStories, retrievalGroups }) {
  const sources = {};
  let nextSourceNumber = 1;

  const excerptSections = retrievalGroups
    .filter((group) => group.results.length > 0)
    .map((group) => {
      const excerpts = group.results.map(({ chunk, score }) => {
        const sourceId = `S${nextSourceNumber++}`;
        sources[sourceId] = toSource(chunk, score, group.query);
        return formatExcerpt(sourceId, chunk);
      });
      return `### Retrieved for: "${group.query}"\n\n${excerpts.join('\n\n')}`;
    });

  const contextText = [
    '## Most-engaged threads this week',
    formatTopStories(topStories),
    '## Retrieved community excerpts',
    ...excerptSections,
  ].join('\n\n');

  return { contextText, sources };
}

function formatTopStories(topStories) {
  return topStories
    .map((story, index) =>
      `${index + 1}. "${story.title}" (${story.points} points, ${story.commentCount} comments, posted ${story.createdAt.slice(0, 10)})`
    )
    .join('\n');
}

function formatExcerpt(sourceId, chunk) {
  const who = chunk.kind === 'story' ? `story posted by ${chunk.author}` : `comment by ${chunk.author}`;
  return `[${sourceId}] ${who} in thread "${chunk.storyTitle}" (${chunk.createdAt.slice(0, 10)})\n${chunk.text}`;
}

function toSource(chunk, score, query) {
  return {
    chunkId: chunk.id,
    storyId: chunk.storyId,
    storyTitle: chunk.storyTitle,
    kind: chunk.kind,
    author: chunk.author,
    createdAt: chunk.createdAt,
    permalink: chunk.permalink,
    text: chunk.text,
    score: Number(score.toFixed(4)),
    query,
  };
}
