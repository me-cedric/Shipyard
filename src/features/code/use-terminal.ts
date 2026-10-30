import { listen } from "@tauri-apps/api/event";
import { type RefObject, useEffect } from "react";
import { commands, isTauri, type TerminalOutput, unwrap } from "@/lib/ipc";
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

/**
 * Starts a shell in `folder` and draws it with xterm in `host`. Closing the panel ends the shell
 * (REQ-035). One shell
 * for each panel and no WebGL or link addon (ADR 0012).
 */
export function useTerminal(
	host: RefObject<HTMLElement | null>,
	folder: string | null,
	onError: (message: string) => void,
	/** The line that shows when the shell exits. */
	ended: string,
) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: onError is a state setter and the text only shows at an exit
	useEffect(() => {
		const node = host.current;
		if (!node) return;
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
				fit.fit();
				const off = await onOutput((e) => {
					if (e.id === id) term.write(e.data);
				});
				// The mock has no exit event: its shell lives until the panel closes.
				const exit = isTauri()
					? await listen<string>("terminal-exit", (e) => {
							if (e.payload === id) term.writeln(`\r\n${ended}`);
						})
					: () => {};
				const data = term.onData((d) => void commands.terminalWrite(id, d));
				const size = term.onResize(
					({ cols, rows }) => void commands.terminalResize(id, cols, rows),
				);
				const resize = () => fit.fit();
				window.addEventListener("resize", resize);
				teardown = () => {
					window.removeEventListener("resize", resize);
					data.dispose();
					size.dispose();
					off();
					exit();
					commands.terminalClose(id).catch(() => {});
					term.dispose();
				};
				await closeOldShells();
				const out = await commands.terminalOpen(id, folder, term.cols, term.rows);
				if (out.status === "error") onError(out.error);
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
	}, [host, folder]);
}
