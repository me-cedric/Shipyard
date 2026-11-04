import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { TerminalScreen } from "./terminal";
import { linksIn } from "./use-terminal";

const fake = vi.hoisted(() => ({
	exit: undefined as undefined | ((e: { payload: string }) => void),
	focus: vi.fn(),
	provider: undefined as
		| undefined
		| {
				provideLinks: (
					y: number,
					done: (l: { text: string; activate: () => void }[]) => void,
				) => void;
		  },
}));

vi.mock("@tauri-apps/api/core", async (orig) => ({
	...(await orig<typeof import("@tauri-apps/api/core")>()),
	isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: async (name: string, f: (e: { payload: string }) => void) => {
		if (name === "terminal-exit") fake.exit = f;
		return () => {};
	},
}));
vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		buffer = {
			active: { getLine: () => ({ translateToString: () => "see https://example.com/a." }) },
		};
		loadAddon() {}
		open() {}
		focus() {
			fake.focus();
		}
		write() {}
		writeln() {}
		registerLinkProvider(p: NonNullable<typeof fake.provider>) {
			fake.provider = p;
			return { dispose() {} };
		}
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

describe("Terminal restart and links", () => {
	it("finds http and https links and drops a trailing mark", () => {
		expect(linksIn("go https://a.io/x, or http://b.io). ftp://c.io")).toEqual([
			{ url: "https://a.io/x", start: 3, end: 17 },
			{ url: "http://b.io", start: 22, end: 33 },
		]);
	});

	it("shows Restart when the shell ends and starts a new shell", async () => {
		const user = userEvent.setup();
		const open = vi.spyOn(commands, "terminalOpen");
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		render(
			<I18nProvider>
				<TerminalScreen />
			</I18nProvider>,
		);
		await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
		const id = open.mock.calls[0]?.[0] ?? "";
		act(() => fake.exit?.({ payload: id }));
		await user.click(await screen.findByRole("button", { name: "Restart" }));
		await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
		expect(open.mock.calls[1]?.[0]).not.toBe(id);
		// The new shell takes the focus: the Restart button is gone.
		await waitFor(() => expect(fake.focus).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Restart" })).toBeNull());
		open.mockRestore();
	});

	it("opens a link of the output in the browser", async () => {
		const open = vi.spyOn(commands, "openLink").mockResolvedValue({ status: "ok", data: null });
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		render(
			<I18nProvider>
				<TerminalScreen />
			</I18nProvider>,
		);
		await waitFor(() => expect(fake.provider).toBeDefined());
		let links: { text: string; activate: () => void }[] = [];
		fake.provider?.provideLinks(1, (l) => {
			links = l;
		});
		expect(links.map((l) => l.text)).toEqual(["https://example.com/a"]);
		links[0]?.activate();
		expect(open).toHaveBeenCalledWith("https://example.com/a");
	});
});
