import { mockIPC } from "@tauri-apps/api/mocks";
import type { commands } from "./bindings";

type Handlers = {
	[K in keyof typeof commands]: () => Awaited<ReturnType<(typeof commands)[K]>>;
};

// A missing key fails `tsc`: each generated command needs a handler.
const handlers: Handlers = {
	appInfo: () => ({ name: "Shipyard", version: "0.1.0", os: "browser" }),
	projectsRecent: () => [],
	healthPing: () => "pong",
};

const camel = (s: string) => s.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

export function installMockIpc() {
	mockIPC((cmd) => {
		const handler = (handlers as Record<string, (() => unknown) | undefined>)[camel(cmd)];
		if (!handler) throw new Error(`No mock handler for command: ${cmd}`);
		return handler();
	});
}
