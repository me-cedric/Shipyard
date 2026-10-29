import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { onMockTerminalOutput } from "@/lib/ipc/mock";
import { TerminalPanel } from "./terminal";

const fake = vi.hoisted(() => ({
	written: [] as string[],
	typed: undefined as undefined | ((d: string) => void),
	disposed: false,
}));

vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		loadAddon() {}
		open() {}
		focus() {}
		write(d: string) {
			fake.written.push(d);
		}
		onData(f: (d: string) => void) {
			fake.typed = f;
			return { dispose() {} };
		}
		onResize() {
			return { dispose() {} };
		}
		dispose() {
			fake.disposed = true;
		}
	},
}));
vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit() {}
	},
}));

const view = (folder?: string) =>
	render(
		<I18nProvider>
			<TerminalPanel folder={folder} />
		</I18nProvider>,
	);

describe("Code / Terminal", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		fake.written = [];
		fake.typed = undefined;
		fake.disposed = false;
	});

	it("starts the shell at the project root and draws its output", async () => {
		view();
		expect(screen.getByRole("region", { name: "Terminal" })).toBeInTheDocument();
		await waitFor(() => expect(fake.written.join("")).toContain("/project $ "));
		fake.typed?.("ls\r");
		await waitFor(() => expect(fake.written.join("")).toContain("ls\r\n"));
	});

	it("starts the shell in a folder of the project", async () => {
		view("src/lib");
		await waitFor(() => expect(fake.written.join("")).toContain("/project/src/lib $ "));
	});

	it("shows the refusal for a folder outside the project", async () => {
		view("../x");
		expect(await screen.findByRole("alert")).toHaveTextContent("not a folder of the project");
	});

	it("ends the shell when the panel closes", async () => {
		let id = "";
		const off = onMockTerminalOutput((i) => {
			id = i;
		});
		const { unmount } = view();
		await waitFor(() => expect(id).not.toBe(""));
		unmount();
		off();
		await waitFor(() => expect(fake.disposed).toBe(true));
		const out = await commands.terminalWrite(id, "x");
		expect(out).toMatchObject({ status: "error", error: "that terminal is closed" });
	});
});
