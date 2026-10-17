import { localResource } from './network-mode.js';
export function restrictSession(session) {
  session.setSpellCheckerEnabled(false);
  session.webRequest.onBeforeRequest((details, done) => done({ cancel: !localResource(details.url) }));
  session.setPermissionRequestHandler?.((_contents, _permission, callback) => callback(false));
}
// Native http(s) is used only by the validated intranet transport. Node fetch has no exception.
export function restrictFetch(fetchLocal) {
  const deny = async () => { throw new Error('제한 모드에서는 네트워크 요청을 허용하지 않습니다.'); };
  return { fetch: deny, netFetch: (url, options) => localResource(String(url)) ? fetchLocal(url, options) : deny() };
}
