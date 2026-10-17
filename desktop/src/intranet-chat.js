import http from 'node:http';
import https from 'node:https';
import { internalEndpoint, chatMessages } from './network-mode.js';

// Only a configured private IP/loopback endpoint. No DNS, proxy, redirects or fallback.
export async function intranetChat(config, apiKey, messages, { request } = {}) {
  if (config.mode !== 'intranet') throw new Error('사내망 AI 모드에서만 대화할 수 있습니다.');
  const endpoint = internalEndpoint(config.endpoint);
  const url = new URL(`${endpoint}/chat/completions`);
  const body = JSON.stringify({ model: config.model, messages: chatMessages(messages), stream: false, max_tokens: 1024 });
  if (typeof apiKey !== 'string' || /[\r\n]/.test(apiKey)) throw new Error('API 키 형식을 확인하세요.');
  const send = request ?? (url.protocol === 'https:' ? https.request : http.request);
  return new Promise((resolve, reject) => {
    const req = send(url, { method: 'POST', agent: false, headers: {
      'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`사내망 모델 서버 오류 (HTTP ${res.statusCode}). 외부 서버로 전환하지 않습니다.`)); return; }
      let size = 0, data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (size > 1024 * 1024) { res.destroy(); reject(new Error('모델 응답이 너무 큽니다.')); return; }
        data += chunk;
      });
      res.on('error', () => reject(new Error('모델 응답 수신에 실패했습니다.')));
      res.on('end', () => {
        try {
          const text = JSON.parse(data)?.choices?.[0]?.message?.content;
          if (typeof text !== 'string' || !text.trim()) throw new Error();
          resolve(text);
        } catch { reject(new Error('Chat Completions 호환 응답이 아닙니다.')); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), 30000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => { clearTimeout(timer); reject(new Error('사내망 모델 서버에 연결하지 못했습니다. 주소·인증·TLS 인증서를 확인하세요.')); });
    req.end(body);
  });
}
