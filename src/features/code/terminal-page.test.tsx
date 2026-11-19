import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const fake = vi.hoisted(() => ({ written: [] as string[], cleared: 0 }));

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
		clear() {
			fake.cleared++;
		}
		write(d: string) {
			fake.written.push(d);
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

describe("Code / Terminal page", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		fake.written = [];
		fake.cleared = 0;
	});

	it("lists the files with a Changed pill, finds a file and enables the actions on a chosen one", async () => {
		const user = userEvent.setup();
		mountApp("/code/terminal");
		const files = await screen.findByRole("region", { name: "Files" });
		const srcRow = await within(files).findByRole("button", { name: /^src/ });
		expect(within(files).getByRole("button", { name: "Rename" })).toBeDisabled();
		await user.click(srcRow);
		const app = await within(files).findByRole("button", { name: /app\.ts/ });
		expect(app).toHaveTextContent("Changed");
		await user.click(app);
		expect(within(files).getByRole("button", { name: "Open in the editor" })).toBeEnabled();
		expect(within(files).getByRole("button", { name: "Show in the folder" })).toBeEnabled();
		await user.type(within(files).getByRole("searchbox", { name: "Find a file" }), "guide");
		expect(await within(files).findByRole("button", { name: /guide\.md/ })).toBeInTheDocument();
		expect(within(files).queryByRole("button", { name: /app\.ts/ })).toBeNull();
	}, 20_000);

	it("runs a command in the open shell, opens and closes tabs and clears the screen", async () => {
		const user = userEvent.setup();
		mountApp("/code/terminal");
		const tabs = await screen.findByRole("group", { name: "Terminal tabs" });
		await waitFor(() => expect(fake.written.join("")).toContain("$ "));
		await user.type(screen.getByRole("textbox", { name: "Command" }), "ls");
		await user.click(screen.getByRole("button", { name: "Run" }));
		await waitFor(() => expect(fake.written.join("")).toContain("ls\r\n"));
		expect(screen.getByRole("textbox", { name: "Command" })).toHaveValue("");
		await user.click(screen.getByRole("button", { name: "Clear" }));
		expect(fake.cleared).toBe(1);
		await user.click(within(tabs).getByRole("button", { name: "New terminal" }));
		expect(within(tabs).getByRole("button", { name: "Terminal 2", pressed: true })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Close the tab" }));
		expect(within(tabs).queryByRole("button", { name: "Terminal 2" })).toBeNull();
		expect(within(tabs).getByRole("button", { name: "Terminal 1" })).toBeInTheDocument();
	}, 20_000);

	it("hands the typed command to the assistant", async () => {
		const user = userEvent.setup();
		mountApp("/code/terminal");
		await user.type(await screen.findByRole("textbox", { name: "Command" }), "pnpm test");
		await user.click(screen.getByRole("button", { name: "Ask an agent to run it" }));
		expect(
			await screen.findByDisplayValue(/Run this command in the project.*pnpm test/),
		).toBeVisible();
	}, 20_000);
});
