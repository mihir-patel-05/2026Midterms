import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';
import { test } from 'node:test';
import axios from 'axios';
import { redactFecApiKey } from './fec-client.js';

test('redactFecApiKey removes the API key from a logged axios error', async () => {
  const server = createServer((_req, res) => res.writeHead(500).end('{}'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const client = axios.create({ baseURL: `http://127.0.0.1:${port}`, params: { api_key: 'SECRET-FEC-KEY' } });

  try {
    const error = await client.get('/candidates', { params: { cycle: 2026 } }).catch((caught) => caught);
    assert.match(inspect(error, { depth: 6 }), /SECRET-FEC-KEY/, 'the unredacted error carries the key');

    const logged = inspect(redactFecApiKey(error), { depth: 6 });
    assert.doesNotMatch(logged, /SECRET-FEC-KEY/);
    assert.equal(error.response.status, 500, 'callers still see the status');
    assert.equal(error.config.params.cycle, 2026, 'other params survive');
  } finally {
    server.close();
  }
});
