import { listen } from "@tauri-apps/api/event";
import { type RefObject, useEffect, useState } from "react";
import { commands, isTauri, type TerminalOutput, toFailure, unwrap } from "@/lib/ipc";
import { CODE_FONTS } from "@/lib/prefs";

type Output = TerminalOutput;
// The page load that ran before this one may have left shells: close them once, before the first open.
let cleared: Promise<unknown> | undefined;
const closeOldShells = () => {
	cleared ??= commands.terminalCloseAll().catch(() => {});
	return cleared;
};

/**
 * The output of a shell, by id. This is the one place to switch to the typed terminal events:
 * the app sends `terminal-output`, the mock calls `onMockTerminalOutput`.
 */
async function onOutput(listener: (e: Output) => void): Promise<() => void> {
	if (isTauri()) {
		const off = await listen<Output>("terminal-output", (e) => listener(e.payload));
		return off;
	}
	const { onMockTerminalOutput } = await import("@/lib/ipc/mock");
	return onMockTerminalOutput((id, data) => listener({ id, data }));
}

const LINK = /https?:\/\/[^\s<>"'`]+/g;

/** The http and https links of one line of output, with their columns (from 0). A trailing mark is not part of a link. */
export function linksIn(line: string) {
	return [...line.matchAll(LINK)].map((m) => {
		const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
		return { url, start: m.index ?? 0, end: (m.index ?? 0) + url.length };
	});
}

/**
 * Starts a shell in `folder` and draws it with xterm in `host`. Closing the panel ends the shell
 * (REQ-035). One shell
 * for each panel and no WebGL or link addon (ADR 0012). A link in the output opens in the browser
 * (shortcut: a link that wraps over two lines is cut at the line end, use the xterm link addon to join them).
 * When the shell ends, `ended` is true and `restart` starts a new one in the same panel.
 */
export function useTerminal(
	host: RefObject<HTMLElement | null>,
	folder: string | null,
	onError: (message: string) => void,
	/** The line that shows when the shell exits. */
	endedLine: string,
) {
	const [ended, setEnded] = useState(false);
	const [round, setRound] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: onError is a state setter and the text only shows at an exit
	useEffect(() => {
		const node = host.current;
		if (!node) return;
		setEnded(false);
		const id = `shipyard-${crypto.randomUUID()}`;
		let stop = false;
		let teardown = () => {};
		void (async () => {
			try {
				const [{ Terminal }, { FitAddon }] = await Promise.all([
					import("@xterm/xterm"),
					import("@xterm/addon-fit"),
					import("@xterm/xterm/css/xterm.css"),
				]);
				if (stop) return;
				// The font and the size of Settings / Me, read once for each shell.
				const prefs = await unwrap(commands.prefsGet()).catch(() => null);
				const stack = CODE_FONTS[prefs?.codeFont ?? ""] ?? CODE_FONTS.system;
				const term = new Terminal({
					cursorBlink: true,
					scrollback: 10000,
					fontSize: prefs?.terminalFontSize ?? 13,
					fontFamily: prefs?.terminalFont ? `${prefs.terminalFont}, ${stack}` : stack,
				});
				const fit = new FitAddon();
				term.loadAddon(fit);
				term.open(node);
				const links = term.registerLinkProvider({
					provideLinks: (y, done) => {
						const line = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? "";
						done(
							linksIn(line).map(({ url, start, end }) => ({
								text: url,
								range: { start: { x: start + 1, y }, end: { x: end, y } },
								activate: () => void commands.openLink(url),
							})),
						);
					},
				});
				fit.fit();
				const off = await onOutput((e) => {
					if (e.id === id) term.write(e.data);
				});
				// The mock has no exit event: its shell lives until the panel closes.
				const exit = isTauri()
					? await listen<string>("terminal-exit", (e) => {
							if (e.payload !== id) return;
							term.writeln(`\r\n${endedLine}`);
							setEnded(true);
						})
					: () => {};
				const data = term.onData((d) => void commands.terminalWrite(id, d));
				const size = term.onResize(
					({ cols, rows }) => void commands.terminalResize(id, cols, rows),
				);
				// The host changes size with the window, the drawer splitter and the dock.
				const resize = () => fit.fit();
				const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
				watch?.observe(node);
				teardown = () => {
					watch?.disconnect();
					links.dispose();
					data.dispose();
					size.dispose();
					off();
					exit();
					commands.terminalClose(id).catch(() => {});
					term.dispose();
				};
				await closeOldShells();
				const out = await commands.terminalOpen(id, folder, term.cols, term.rows);
				if (out.status === "error") onError(toFailure(out.error).message);
				if (stop) teardown();
				else term.focus();
			} catch (e) {
				onError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			stop = true;
			teardown();
		};
	}, [host, folder, round]);
	return { ended, restart: () => setRound((n) => n + 1) };
}
