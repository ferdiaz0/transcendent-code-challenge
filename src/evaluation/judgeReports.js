/**
 * "LLM as a judge": a second Claude call grades both documents against the
 * week's real top threads. It complements the code-based metrics with a
 * quality judgment that code can't make (is this specific? plausible?).
 *
 * Two precautions against bias:
 *  - the judge doesn't know which document used RAG (they're called One and Two)
 *  - the order is randomized, because LLMs tend to favor whichever they read first
 */

const score = { type: 'integer', enum: [1, 2, 3, 4, 5] };

const documentScores = {
  type: 'object',
  additionalProperties: false,
  required: ['groundedness', 'specificity', 'coverage', 'predictionQuality'],
  properties: { groundedness: score, specificity: score, coverage: score, predictionQuality: score },
};

export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['documentOne', 'documentTwo', 'winner', 'rationale'],
  properties: {
    documentOne: documentScores,
    documentTwo: documentScores,
    winner: { type: 'string', enum: ['documentOne', 'documentTwo', 'tie'] },
    rationale: { type: 'string' },
  },
};

export const JUDGE_SYSTEM_PROMPT = `You evaluate weekly "Community Voices" documents that summarize an online community's past week and predict the next one. You are given the community's actual most-engaged threads for that week as ground truth, and two documents to compare.

Score each document from 1 (poor) to 5 (excellent) on:
- groundedness: claims are consistent with what actually happened this week, with no fabricated events
- specificity: concrete names, projects and arguments rather than generic statements
- coverage: the week's most-engaged threads are represented
- predictionQuality: predictions are plausible and justified by this week's signals

Then pick the better document overall and explain why in a short paragraph.`;

export async function judgeReports({ llm, communityName, week, topStories, baselineDocument, ragDocument, random = Math.random }) {
  const baselineIsFirst = random() < 0.5;
  const [documentOne, documentTwo] = baselineIsFirst ? [baselineDocument, ragDocument] : [ragDocument, baselineDocument];

  const { data, usage, latencyMs } = await llm.generateJson({
    system: JUDGE_SYSTEM_PROMPT,
    userMessage: buildJudgeMessage({ communityName, week, topStories, documentOne, documentTwo }),
    schema: JUDGE_SCHEMA,
  });

  return { ...mapVerdictToVariants(data, baselineIsFirst), baselineShownFirst: baselineIsFirst, usage, latencyMs };
}

/** Translates "documentOne / documentTwo" back into "baseline / rag". */
export function mapVerdictToVariants(verdict, baselineIsFirst) {
  const variantOf = { documentOne: baselineIsFirst ? 'baseline' : 'rag', documentTwo: baselineIsFirst ? 'rag' : 'baseline' };
  return {
    scores: {
      [variantOf.documentOne]: verdict.documentOne,
      [variantOf.documentTwo]: verdict.documentTwo,
    },
    winner: verdict.winner === 'tie' ? 'tie' : variantOf[verdict.winner],
    rationale: verdict.rationale,
  };
}

function buildJudgeMessage({ communityName, week, topStories, documentOne, documentTwo }) {
  const threads = topStories
    .map((story, index) => `${index + 1}. "${story.title}" (${story.points} points, ${story.commentCount} comments)`)
    .join('\n');

  return `Community: ${communityName}
Week: ${week.label}

## Ground truth: the most-engaged threads this week
${threads}

## Document One
${JSON.stringify(withoutSourceIds(documentOne), null, 2)}

## Document Two
${JSON.stringify(withoutSourceIds(documentTwo), null, 2)}`;
}

// Source ids would reveal which document had RAG, so the judge doesn't see them.
function withoutSourceIds(document) {
  return {
    ...document,
    themes: document.themes.map(({ sourceIds, ...theme }) => ({
      ...theme,
      notableVoices: theme.notableVoices.map((voice) => voice.quote),
    })),
    predictions: document.predictions.map(({ sourceIds, ...prediction }) => prediction),
  };
}
