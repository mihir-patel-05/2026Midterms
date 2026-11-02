import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { parseStreamInput, publicStreams, setPanelShown, StreamInputError, updateStream } from './live-streams.service.js';

const video = 'dQw4w9WgXcQ';
const channel = 'UC' + 'a'.repeat(22);

test('pasted YouTube links and ids become a video or a channel', () => {
  for (const input of [video, `https://www.youtube.com/watch?v=${video}&t=3`, `https://youtu.be/${video}`, `youtube.com/live/${video}?si=x`, `https://www.youtube-nocookie.com/embed/${video}`, `https://m.youtube.com/watch?v=${video}`]) {
    assert.deepEqual(parseStreamInput(input), { videoId: video }, input);
  }
  for (const input of [channel, `https://www.youtube.com/channel/${channel}`, `https://www.youtube.com/channel/${channel}/live`, `https://www.youtube-nocookie.com/embed/live_stream?channel=${channel}`]) {
    assert.deepEqual(parseStreamInput(input), { channelId: channel }, input);
  }
  assert.throws(() => parseStreamInput('https://www.youtube.com/@ABCNews/live'), /handle/);
  assert.throws(() => parseStreamInput('https://vimeo.com/123'), StreamInputError);
  assert.throws(() => parseStreamInput('not a link at all'), StreamInputError);
});

test('the public list is alphabetical, enabled outlets only, and an admin can hide the panel', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const before = await publicStreams(db);
    assert(before.streams.length >= 7, 'the migration seeds the outlets');
    assert.deepEqual(before.streams.map((stream) => stream.name), [...before.streams.map((stream) => stream.name)].sort((a, b) => a.localeCompare(b)));
    assert(!before.streams.some((stream) => stream.key === 'reuters'), 'Reuters is seeded off');

    await updateStream(db, 'abc-news', { input: `https://youtu.be/${video}` });
    const set = (await publicStreams(db)).streams.find((stream) => stream.key === 'abc-news');
    assert.deepEqual(set?.embed, { videoId: video });
    assert.equal(set?.watchUrl, `https://www.youtube.com/watch?v=${video}`);
    await updateStream(db, 'abc-news', { input: '' });
    assert.equal((await publicStreams(db)).streams.find((stream) => stream.key === 'abc-news')?.embed, null);
    assert.equal(await updateStream(db, 'no-such-outlet', { isEnabled: false }), null);

    await setPanelShown(db, false);
    assert.equal((await publicStreams(db)).shown, false);
    await setPanelShown(db, true);
    assert.equal((await publicStreams(db)).shown, true);
  } finally {
    await db.$disconnect();
  }
});
