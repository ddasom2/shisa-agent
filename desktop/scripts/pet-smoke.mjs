// Real Electron/CDP smoke test. Runs on Windows CI and locally on macOS.
// It tests rendering/IPC/persistence; it does not certify the Windows compositor or Explorer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const executable = process.argv[2] || require('electron');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shisa-pet-smoke-'));
console.log('Smoke: reserving loopback port');
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; await new Promise((resolve) => server.close(resolve));
console.log(`Smoke: debug port ${port}`);
const sockets = [], errors = []; let child;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); sockets.push(ws);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(n, (data) => { clearTimeout(timer); data.error ? reject(new Error(data.error.message)) : resolve(data.result); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await call('Runtime.enable');
  return async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
}
let stderr = '';
try {
  const dev = process.argv[2] ? [] : [path.resolve(import.meta.dirname, '..')];
  console.log(`Smoke: launching ${executable}`);
  const env = { ...process.env, CY_DESKTOP_DATA: path.join(root, 'data'), CY_AGENT_HOME: path.join(root, 'agent') };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(executable, [...dev, '--offline-pets', `--remote-debugging-port=${port}`], {
    env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false,
  });
  child.stderr.on('data', (b) => { stderr += b; process.stderr.write(b); });
  child.on('error', (error) => errors.push(error.message));
  let targets;
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw new Error(`Electron exited ${child.exitCode}: ${stderr}`);
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json(); } catch { /* start */ }
    if (targets?.filter((t) => t.url.includes('/pet.html')).length >= 5 && targets.some((t) => t.url.includes('/pet-settings.html'))) break;
    await sleep(500);
  }
  assert.ok(Array.isArray(targets), `Electron debug endpoint did not start: ${stderr}`);
  const settings = targets.find((t) => t.url.includes('/pet-settings.html')); assert.ok(settings, stderr);
  const evaluate = await connect(settings);
  let state = await evaluate('window.petSettings.get()'); assert.equal(state.instances.length, 5);
  await evaluate('window.petSettings.command("configure", {paused:true})');
  const pets = targets.filter((t) => t.url.includes('/pet.html'));
  for (const target of pets) {
    const check = await connect(target);
    let loaded;
    for (let i = 0; i < 20; i++) {
      loaded = await check('document.getElementById("pet").naturalWidth > 0 || document.getElementById("video").readyState >= 2');
      if (loaded) break; await sleep(250);
    }
    assert.equal(loaded, true, `asset not loaded: ${target.url}`);
    assert.equal(await check('fetch("https://example.com/").then(()=>false,()=>true)'), true);
    assert.equal(await check('typeof window.cy'), 'undefined');
  }
  assert.equal((await evaluate('window.petSettings.command("spawn", [{character:"hachi",count:2}])')).ok, true);
  state = await evaluate('window.petSettings.get()'); assert.equal(state.instances.length, 7);
  // Wait for newly spawned windows too; do not quit while their local files are loading.
  let seven;
  for (let i = 0; i < 40; i++) {
    seven = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
    if (seven.filter((t) => t.url.includes('/pet.html')).length === 7) break;
    await sleep(250);
  }
  assert.equal(seven.filter((t) => t.url.includes('/pet.html')).length, 7);
  for (const target of seven.filter((t) => t.url.includes('/pet.html'))) {
    const check = await connect(target);
    let loaded = false;
    for (let i = 0; i < 20; i++) {
      loaded = await check('document.getElementById("pet").naturalWidth > 0 || document.getElementById("video").readyState >= 2');
      if (loaded) break;
      await sleep(250);
    }
    assert.equal(loaded, true, `spawned asset not loaded: ${target.url}`);
  }
  const id = state.instances.at(-1).id;
  assert.equal((await evaluate(`window.petSettings.command("update", {id:${JSON.stringify(id)},patch:{size:160,speed:1.5,frequency:2}})`)).ok, true);
  state = await evaluate('window.petSettings.get()'); assert.equal(state.instances.at(-1).size, 160);
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'state.json'), 'utf8'));
  assert.equal(saved.pets.instances.length, 7); assert.equal(saved.pets.paused, true);
  assert.deepEqual(errors, []);
  console.log('PASS: actual Electron windows, seven loaded local assets and instances, isolated IPC, renderer network denial, settings and disk persistence.');
  await evaluate('window.petSettings.command("quit")').catch(() => {});
} finally {
  for (const ws of sockets) ws.close();
  if (child && child.exitCode === null) child.kill('SIGKILL');
  fs.rmSync(root, { recursive: true, force: true });
}
