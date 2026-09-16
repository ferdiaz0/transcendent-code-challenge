import { htmlToPlainText } from './textCleaner.js';
import { splitIntoChunks } from './chunker.js';

/**
 * A "document" is one voice from the community: a story post or a single comment.
 *
 * @typedef {Object} CommunityDocument
 * @property {string} id           Hacker News item id
 * @property {string} storyId      id of the story the document belongs to
 * @property {string} storyTitle   gives comments context ("what thread was this in?")
 * @property {number} storyPoints  upvotes of the story: how much the community cared
 * @property {number} storyCommentCount
 * @property {'story'|'comment'} kind
 * @property {string} author
 * @property {string} createdAt    ISO date
 * @property {string} permalink    link back to the item on news.ycombinator.com
 * @property {string} text         cleaned plain text
 */

const HN_ITEM_URL = 'https://news.ycombinator.com/item?id=';

/**
 * Turns one Hacker News item tree (story + nested comments) into flat documents.
 */
export function storyToDocuments(storyTree, { maxCommentsPerStory }) {
  const storyDocument = buildStoryDocument(storyTree);
  const commentDocuments = collectComments(storyTree, maxCommentsPerStory).map((comment) =>
    buildCommentDocument(comment, storyTree)
  );
  return [storyDocument, ...commentDocuments];
}

/**
 * Splits each document into embedding-sized chunks, copying the metadata onto every chunk.
 */
export function documentToChunks(document, chunkingOptions) {
  return splitIntoChunks(document.text, chunkingOptions).map((chunkText, index) => ({
    ...document,
    id: `${document.id}#${index}`,
    documentId: document.id,
    text: chunkText,
  }));
}

function buildStoryDocument(storyTree) {
  const body = htmlToPlainText(storyTree.text);
  const linkLine = storyTree.url ? `Link: ${storyTree.url}` : '';
  return {
    id: String(storyTree.id),
    ...storyContext(storyTree),
    kind: 'story',
    author: storyTree.author,
    createdAt: toIsoDate(storyTree.created_at),
    permalink: HN_ITEM_URL + storyTree.id,
    text: [storyTree.title, body, linkLine].filter(Boolean).join('\n\n'),
  };
}

function buildCommentDocument(comment, storyTree) {
  return {
    id: String(comment.id),
    ...storyContext(storyTree),
    kind: 'comment',
    author: comment.author,
    createdAt: toIsoDate(comment.created_at),
    permalink: HN_ITEM_URL + comment.id,
    text: htmlToPlainText(comment.text),
  };
}

// Fields every document shares with the story it belongs to.
function storyContext(storyTree) {
  return {
    storyId: String(storyTree.id),
    storyTitle: storyTree.title,
    storyPoints: storyTree.points ?? 0,
    storyCommentCount: storyTree.num_comments ?? 0,
  };
}

/**
 * The API mixes "…:10Z" (stories) and "…:10.000Z" (comments). One format lets
 * the database compare dates as plain strings.
 */
function toIsoDate(dateString) {
  return new Date(dateString).toISOString();
}

/**
 * Walks the comment tree breadth-first, so top-level comments (the main reactions
 * to a story) are kept before deep reply chains. Deleted comments have no text and are skipped.
 */
function collectComments(storyTree, maxComments) {
  const collected = [];
  const queue = [...(storyTree.children ?? [])];
  while (queue.length > 0 && collected.length < maxComments) {
    const comment = queue.shift();
    if (comment.text) collected.push(comment);
    queue.push(...(comment.children ?? []));
  }
  return collected;
}
