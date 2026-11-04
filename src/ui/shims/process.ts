// Browser shim for `node:process` named imports (likec4 imports { cwd }).
// The global `process` object is still injected by vite-plugin-node-polyfills;
// this only satisfies static named-import bindings.
type Proc = {
	cwd?: () => string;
	env?: Record<string, string | undefined>;
	platform?: string;
	argv?: string[];
	version?: string;
	versions?: Record<string, string>;
	nextTick?: (fn: (...a: unknown[]) => void, ...args: unknown[]) => void;
};
const proc: Proc =
	(typeof globalThis !== "undefined" && (globalThis as { process?: Proc }).process) || {};

export const cwd = typeof proc.cwd === "function" ? proc.cwd.bind(proc) : () => "/";
export const env = proc.env || {};
export const platform = proc.platform || "browser";
export const argv = proc.argv || [];
export const version = proc.version || "";
export const versions = proc.versions || {};
export const nextTick =
	typeof proc.nextTick === "function"
		? proc.nextTick.bind(proc)
		: (fn: (...a: unknown[]) => void, ...args: unknown[]) => {
				void Promise.resolve().then(() => fn(...args));
			};

export default { cwd, env, platform, argv, version, versions, nextTick };
