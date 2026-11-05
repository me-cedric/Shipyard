import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { ShellProvider, useShell } from "@/lib/shell";
import { TerminalDrawer } from "./terminal-drawer";

vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		loadAddon() {}
		registerLinkProvider() {
			return { dispose() {} };
		}
		open() {}
		focus() {}
		write() {}
		onData() {
			return { dispose() {} };
		}
		onResize() {
			return { dispose() {} };
		}
		dispose() {}
	},
}));
vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit() {}
	},
}));

function Harness() {
	const { runInTerminal, terminalOpen } = useShell();
	useEffect(() => runInTerminal("codex login"), [runInTerminal]);
	return <TerminalDrawer open={terminalOpen} onHide={() => {}} />;
}

describe("Terminal drawer job", () => {
	it("runs the command of runInTerminal in a new tab", async () => {
		const write = vi.spyOn(commands, "terminalWrite");
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		render(
			<Providers>
				<ShellProvider>
					<Harness />
				</ShellProvider>
			</Providers>,
		);
		await waitFor(() => expect(write).toHaveBeenCalledWith(expect.any(String), "codex login\r"));
		expect(screen.getAllByRole("tab")).toHaveLength(1);
		write.mockRestore();
	});
});
