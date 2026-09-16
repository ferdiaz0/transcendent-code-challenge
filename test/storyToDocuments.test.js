import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyToDocuments, documentToChunks } from '../src/ingest/storyToDocuments.js';

function makeComment(id, text, children = []) {
  return { id, text, author: `user${id}`, created_at: '2026-09-15T10:00:00Z', children };
}

const storyTree = {
  id: 1,
  title: 'Show HN: A bird-drawing e-ink frame',
  url: 'https://example.com',
  text: null,
  author: 'maker',
  created_at: '2026-09-15T09:00:00Z',
  children: [
    makeComment(2, 'Top level A', [makeComment(4, 'Reply to A')]),
    makeComment(3, null), // deleted comment
    makeComment(5, 'Top level B'),
  ],
};

test('first document is the story, including title and link', () => {
  const [story] = storyToDocuments(storyTree, { maxCommentsPerStory: 10 });
  assert.equal(story.kind, 'story');
  assert.equal(story.text, 'Show HN: A bird-drawing e-ink frame\n\nLink: https://example.com');
  assert.equal(story.permalink, 'https://news.ycombinator.com/item?id=1');
});

test('comments are breadth-first, skip deleted ones, and carry the story title', () => {
  const comments = storyToDocuments(storyTree, { maxCommentsPerStory: 10 }).slice(1);
  assert.deepEqual(comments.map((c) => c.text), ['Top level A', 'Top level B', 'Reply to A']);
  assert.ok(comments.every((c) => c.storyTitle === storyTree.title && c.storyId === '1'));
});

test('respects maxCommentsPerStory', () => {
  const documents = storyToDocuments(storyTree, { maxCommentsPerStory: 1 });
  assert.equal(documents.length, 2);
});

test('documentToChunks gives each chunk a unique id and keeps metadata', () => {
  const document = { id: '9', storyId: '1', kind: 'comment', author: 'x', text: 'one two three four five six' };
  const chunks = documentToChunks(document, { maxChars: 12, overlapChars: 0 });

  assert.deepEqual(chunks.map((c) => c.id), ['9#0', '9#1', '9#2']);
  assert.ok(chunks.every((c) => c.documentId === '9' && c.author === 'x'));
});
