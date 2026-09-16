import { storyToDocuments } from './storyToDocuments.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * Steps 1 and 2 of an ingest: pull last week's popular stories and their
 * comment threads, and flatten them into CommunityDocuments.
 *
 * `hackerNews` is passed in (instead of imported) so tests can hand in a fake API.
 */
export async function collectCommunityDocuments({ hackerNews, settings, now = new Date(), log = console.log, onProgress = () => {} }) {
  const sinceUnixSeconds = Math.floor(now.getTime() / 1000) - settings.lookbackDays * SECONDS_PER_DAY;

  onProgress({ step: 'stories', detail: `${settings.minStoryPoints}+ points in the last ${settings.lookbackDays} days` });
  const stories = await hackerNews.fetchPopularStoriesSince({
    sinceUnixSeconds,
    minPoints: settings.minStoryPoints,
    maxStories: settings.maxStories,
  });

  const storyTrees = await downloadThreads({ hackerNews, stories, concurrency: settings.fetchConcurrency, log, onProgress });

  return storyTrees
    .filter((tree) => tree !== null)
    .flatMap((tree) => storyToDocuments(tree, settings));
}

// Downloads comment trees a few at a time, reporting "n of total" as each one finishes.
async function downloadThreads({ hackerNews, stories, concurrency, log, onProgress }) {
  let downloadedCount = 0;
  const reportProgress = () =>
    onProgress({ step: 'threads', detail: `${downloadedCount} of ${stories.length} threads`, current: downloadedCount, total: stories.length });

  reportProgress();
  return mapWithConcurrency(stories, concurrency, async (story) => {
    const tree = await fetchTreeOrSkip(hackerNews, story, log);
    downloadedCount += 1;
    reportProgress();
    return tree;
  });
}

// One broken thread should not abort the whole weekly ingest.
async function fetchTreeOrSkip(hackerNews, story, log) {
  try {
    const tree = await hackerNews.fetchItemTree(story.objectID);
    // The comment-tree endpoint has no comment count, so we keep the search result's numbers.
    return { ...tree, points: story.points ?? tree.points, num_comments: story.num_comments };
  } catch (error) {
    log(`Skipping story ${story.objectID}: ${error.message}`);
    return null;
  }
}
