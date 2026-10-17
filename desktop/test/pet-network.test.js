import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { internalEndpoint, modeConfig, chatMessages, localResource } from '../src/network-mode.js';
import { restrictSession, restrictFetch } from '../src/pet-security.js';
import { readNetworkConfig } from '../src/network-window.js';
import { intranetChat } from '../src/intranet-chat.js';
test('restricted resource policy blocks Internet, websockets and UNC file shares', async () => {
  let before, calls = [];
  restrictSession({ setSpellCheckerEnabled() {}, webRequest: { onBeforeRequest: (callback) => { before = callback; } } });
  const guard = restrictFetch(async (url) => { calls.push(url); return 'local bytes'; });
  for (const url of ['https://example.com', 'http://127.0.0.1:47823/status', 'ws://localhost:9000', 'file://server/share/a.png', 'file:////server/share/a.png']) {
    // Four-slash network paths also resolve to UNC on Windows.
    assert.equal(localResource(url), false, url);
    let result; before({ url }, (r) => { result = r; }); assert.equal(result.cancel, true);
    await assert.rejects(guard.netFetch(url)); await assert.rejects(guard.fetch(url));
  }
  assert.equal(await guard.netFetch('file:///C:/pets/idle.png'), 'local bytes');
  assert.equal(localResource('pet-asset://local/hachi/idle'), true);
  assert.deepEqual(calls, ['file:///C:/pets/idle.png']);
});
test('internal endpoints reject public IPs, public DNS, redirects, credentials and bad modes', () => {
  for (const url of ['https://api.openai.com/v1', 'https://8.8.8.8/v1', 'http://169.254.169.254', 'file:///tmp/x', 'http://user:pass@10.0.0.2/v1', 'http://10.0.0.2/v1?x=1', 'http://[::ffff:8.8.8.8]/v1']) assert.throws(() => internalEndpoint(url), url);
  assert.equal(internalEndpoint('http://localhost:11434/v1/'), 'http://127.0.0.1:11434/v1');
  assert.equal(internalEndpoint('https://192.168.0.2:8443/v1'), 'https://192.168.0.2:8443/v1');
  assert.throws(() => modeConfig({ mode: 'typo' }));
  assert.throws(() => chatMessages([{ role: 'system', content: 'bad' }]));
  assert.equal(readNetworkConfig('none', () => '{broken').mode, 'offline');
  assert.equal(readNetworkConfig('none', () => '{}').mode, 'offline');
  assert.equal(readNetworkConfig('none', () => { throw Object.assign(new Error(), { code: 'ENOENT' }); }, 'offline').mode, 'offline');
});
test('real local model transport sends only configured request, handles no-key, rejects redirects without following', async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (chunk) => { body += chunk; }); req.on('end', () => {
      requests.push({ path: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
      if (req.url.startsWith('/redirect')) { res.writeHead(302, { location: 'https://example.com' }); res.end(); }
      else res.end(JSON.stringify({ choices: [{ message: { content: '안녕!' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = { mode: 'intranet', endpoint: `${endpoint}/v1`, model: 'local-pet' }, messages = [{ role: 'user', content: 'hi' }];
    assert.equal(await intranetChat(config, 'local-secret', messages), '안녕!');
    assert.equal(requests[0].path, '/v1/chat/completions'); assert.equal(requests[0].authorization, 'Bearer local-secret'); assert.equal(requests[0].body.model, 'local-pet');
    await intranetChat(config, '', messages); assert.equal(requests[1].authorization, undefined);
    await assert.rejects(intranetChat({ ...config, endpoint: `${endpoint}/redirect` }, '', messages), /HTTP 302/);
    await assert.rejects(intranetChat({ ...config, mode: 'offline' }, '', messages));
    assert.equal(requests.length, 3, 'no redirect or external fallback request');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
