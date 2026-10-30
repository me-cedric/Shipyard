// Browser shim for `node:crypto`.
//
// Reached from `vscode-jsonrpc/node`, which `likec4` drags in through
// `langium`: its `generateRandomPipeName` names the pipe a language server
// talks to an editor over. the app parses LikeC4 in the browser with no such
// server, so nothing here has ever been called — but it used to resolve to `{}`,
// and `{}` fails on the *use* rather than on the import, which is the worst
// place to find out.
//
// The webview has Web Crypto, so the two functions that path needs are real.
// Everything else is deliberately absent: this is not `crypto-browserify`, and
// pulling 200 KB of cipher code in for an unreachable branch is not the trade.

const web = globalThis.crypto;

/** `crypto.randomBytes(n)`, as a `Uint8Array` rather than a Node `Buffer`. */
export function randomBytes(size) {
	const out = new Uint8Array(size);
	if (web?.getRandomValues) web.getRandomValues(out);
	return out;
}

export function randomUUID() {
	if (web?.randomUUID) return web.randomUUID();
	// A v4 shape from random bytes, for a webview without `randomUUID`.
	const b = randomBytes(16);
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getRandomValues(array) {
	return web?.getRandomValues ? web.getRandomValues(array) : array;
}

export const webcrypto = web;

export default { randomBytes, randomUUID, getRandomValues, webcrypto: web };
