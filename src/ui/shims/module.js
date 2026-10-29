import bufferMod from "node:buffer";
import eventsMod from "node:events";
import pathMod from "node:path";
import streamMod from "node:stream";
import urlMod from "node:url";
import utilMod from "node:util";
import cryptoMod from "./crypto.js";
import fsMod from "./fs.js";
import fsPromisesMod from "./fs-promises.js";
import osMod from "./os.js";
import processMod from "./process.js";

/**
 * `createRequire` for the browser.
 *
 * `likec4` bundles `langium`, which bundles the `vscode-languageserver` Node
 * transport, and that transport calls `createRequire()(…)` at module scope for
 * several Node builtins. The imports run on every launch; the code behind them
 * never does, because Legacy parses LikeC4 in the browser with no language
 * server to talk to.
 */
const REGISTRY = {
	util: utilMod,
	path: pathMod,
	events: eventsMod,
	stream: streamMod,
	buffer: bufferMod,
	url: urlMod,
	crypto: cryptoMod,
	os: osMod,
	process: processMod,
	fs: fsMod,
	"fs/promises": fsPromisesMod,
};

/**
 * Builtins a browser cannot have, and why that is fine.
 *
 * These are the ones with no web equivalent at all. `{}` is the honest answer
 * and the reason is worth carrying, because the alternative is a bare warning on
 * every launch — which is how a person learns to stop reading the console.
 *
 * A builtin that is *not* on this list and not in `REGISTRY` still warns. That
 * is the signal: it means a dependency reached for something new, and somebody
 * has to decide which of the two lists it belongs in.
 */
const KNOWN_ABSENT = {
	net: "vscode-jsonrpc's socket transport. No language server here, so no socket.",
	child_process: "vscode-languageserver resolving a module through npm or yarn.",
	tls: "no socket, so no TLS over one.",
	worker_threads: "the browser has Web Workers, and nothing here asks for either.",
};

/** Said once per id, so a module evaluated twice does not double the noise. */
const said = new Set();

function note(id, key) {
	if (said.has(key)) return;
	said.add(key);
	const why = KNOWN_ABSENT[key];
	if (why) {
		// Expected. Kept at `debug` so it is there when somebody looks for it and
		// not in the way when they are looking for something else.
		console.debug(`[legacy] require(${id}) → {} in the browser. ${why}`);
	} else {
		console.warn(
			`[legacy] require(${id}) is stubbed as {} in the browser and nothing provides it. ` +
				`Add it to REGISTRY in src/shims/module.js if it is used, or to KNOWN_ABSENT if it is not.`,
		);
	}
}

export function createRequire() {
	return function require(id) {
		const key = typeof id === "string" ? id.replace(/^node:/, "") : id;
		if (key in REGISTRY) return REGISTRY[key];
		note(id, key);
		return {};
	};
}
export const builtinModules = Object.keys(REGISTRY);
export default { createRequire, builtinModules };
