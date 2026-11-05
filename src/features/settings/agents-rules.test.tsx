import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		loadAddon() {}
		open() {}
		focus() {}
		write() {}
		writeln() {}
		registerLinkProvider() {
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

// The tier row and the sign-in row of a tool share its name: the tier row holds the pickers.
const groups = async (name: string) => {
	await screen.findAllByRole("group", { name });
	return screen.getAllByRole("group", { name });
};
const has = (g: HTMLElement) => g.querySelector("[role=combobox], input") !== null;
const row = async (name: string) => (await groups(name)).find((g) => !has(g)) as HTMLElement;
const tier = async (name: string) => (await groups(name)).find(has) as HTMLElement;

describe("Settings / Agents and rules: model tiers", () => {
	it("shows the five runners: a picker for a detected tool, free text for the others", async () => {
		mountApp("/settings/agents-rules");
		expect(await screen.findByRole("heading", { name: "Model tiers (5)" })).toBeInTheDocument();
		const claude = await tier("Claude Code");
		expect(
			await within(claude).findByRole("combobox", { name: "Claude Code Top" }),
		).toHaveTextContent("opus");
		expect(within(claude).getByRole("combobox", { name: "Claude Code Mid" })).toHaveTextContent(
			"sonnet",
		);
		expect(within(claude).getByRole("combobox", { name: "Claude Code Small" })).toHaveTextContent(
			"haiku",
		);
		for (const id of ["GitHub Copilot", "Gemini CLI", "OpenCode"])
			expect(
				within(await tier(id)).getByRole("textbox", { name: `${id} Top` }),
			).toBeInTheDocument();
	});

	it("shows an effort only for a model that accepts one", async () => {
		mountApp("/settings/agents-rules");
		const claude = await tier("Claude Code");
		expect(
			await within(claude).findByRole("combobox", { name: "Claude Code Top Effort" }),
		).toHaveTextContent("Default");
		expect(
			within(claude).getByRole("combobox", { name: "Claude Code Mid Effort" }),
		).toBeInTheDocument();
		// Haiku takes no effort.
		expect(within(claude).queryByRole("combobox", { name: "Claude Code Small Effort" })).toBeNull();
		// The default model of Codex takes the levels of the tool.
		const codex = await tier("Codex");
		await within(codex).findByRole("combobox", { name: "Codex Top" });
		expect(within(codex).getByRole("combobox", { name: "Codex Top Effort" })).toBeInTheDocument();
	});

	it("saves a model and an effort that a person picks, and drops an effort the new model refuses", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const claude = await tier("Claude Code");
		await user.click(
			await within(claude).findByRole("combobox", { name: "Claude Code Top Effort" }),
		);
		await user.click(await screen.findByRole("option", { name: "high" }));
		const claudeRow = async () =>
			(await unwrap(commands.tiersGet())).find((r) => r.runner === "claude");
		await waitFor(async () => expect((await claudeRow())?.topEffort).toBe("high"));
		await user.click(within(claude).getByRole("combobox", { name: "Claude Code Top" }));
		await user.click(await screen.findByRole("option", { name: "haiku" }));
		await waitFor(async () => expect((await claudeRow())?.top).toBe("haiku"));
		expect((await claudeRow())?.topEffort).toBe("");
		expect(within(claude).queryByRole("combobox", { name: "Claude Code Top Effort" })).toBeNull();
	});

	it("saves a typed tier when the field loses focus", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const field = within(await tier("GitHub Copilot")).getByRole("textbox", {
			name: "GitHub Copilot Top",
		});
		await user.type(field, "gpt-5");
		await user.tab();
		await waitFor(async () =>
			expect((await unwrap(commands.tiersGet())).find((r) => r.runner === "copilot")?.top).toBe(
				"gpt-5",
			),
		);
	});

	it("shows the refusal of a bad model id", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const group = await tier("GitHub Copilot");
		await user.type(
			within(group).getByRole("textbox", { name: "GitHub Copilot Mid" }),
			"has space",
		);
		await user.tab();
		expect(await screen.findByRole("alert")).toHaveTextContent("is not a model id");
		expect((await unwrap(commands.tiersGet()))[2]?.mid).toBe("");
	});

	it("shows an effort that the tool no longer accepts as not supported and lets a person pick another", async () => {
		const user = userEvent.setup();
		const saved = mockState().factory.tiers.find((r) => r.runner === "codex");
		if (saved) saved.midEffort = "minimal";
		mountApp("/settings/agents-rules");
		const codex = await tier("Codex");
		const mid = await within(codex).findByRole("combobox", { name: "Codex Mid Effort" });
		expect(mid).toHaveTextContent("minimal (not supported)");
		await user.click(mid);
		await user.click(await screen.findByRole("option", { name: "high" }));
		await waitFor(async () =>
			expect((await unwrap(commands.tiersGet())).find((r) => r.runner === "codex")?.midEffort).toBe(
				"high",
			),
		);
		expect(within(codex).getByRole("combobox", { name: "Codex Mid Effort" })).toHaveTextContent(
			"high",
		);
	});
});

describe("Settings / Agents and rules: tool sign-in", () => {
	it("shows one row for each tool with its state and one action", async () => {
		mountApp("/settings/agents-rules");
		const claude = await row("Claude Code");
		expect(within(claude).getAllByText("Signed in").length).toBeGreaterThan(0);
		expect(within(claude).queryByRole("button")).toBeNull();
		const codex = await row("Codex");
		expect(within(codex).getAllByText("Signed out").length).toBeGreaterThan(0);
		expect(within(codex).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
		expect(within(codex).getByRole("button", { name: "Use a code instead" })).toBeInTheDocument();
		// A missing tool offers its install.
		const gemini = await row("Gemini CLI");
		expect(within(gemini).getByRole("button", { name: "Install Gemini CLI" })).toBeInTheDocument();
	});

	it("signs in from the keyboard and shows the new state", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const codex = await row("Codex");
		within(codex).getByRole("button", { name: "Sign in" }).focus();
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(within(codex).queryByRole("button", { name: "Sign in" })).toBeNull(),
		);
		expect(within(codex).getAllByText("Signed in").length).toBeGreaterThan(0);
	});

	it("opens the terminal with no project open", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const codex = await row("Codex");
		await user.click(within(codex).getByRole("button", { name: "Sign in" }));
		const drawer = await screen.findByRole("region", { name: "Terminals" });
		await waitFor(() => expect(drawer).toBeVisible());
		expect(within(drawer).getAllByRole("tab")).toHaveLength(1);
	});

	it("saves a Codex API key, then keeps no key in the view", async () => {
		const user = userEvent.setup();
		const save = vi.spyOn(commands, "runnerCodexApiKey");
		mountApp("/settings/agents-rules");
		const codex = await row("Codex");
		await user.click(within(codex).getByRole("button", { name: "Use an API key" }));
		const field = within(codex).getByLabelText("Codex API key");
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "sk-secret-1");
		await user.click(within(codex).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(save).toHaveBeenCalledWith("sk-secret-1", true));
		await waitFor(() => expect(within(codex).queryByLabelText("Codex API key")).toBeNull());
		expect(document.body.innerHTML).not.toContain("sk-secret-1");
		// The form opens again with an empty field.
		await user.click(within(codex).getByRole("button", { name: "Use an API key" }));
		expect(within(codex).getByLabelText("Codex API key")).toHaveValue("");
		save.mockRestore();
	});

	it("clears the key and shows the error when the save fails", async () => {
		const user = userEvent.setup();
		const save = vi
			.spyOn(commands, "runnerCodexApiKey")
			.mockResolvedValueOnce({ status: "error", error: "The key is not valid." } as never);
		mountApp("/settings/agents-rules");
		const codex = await row("Codex");
		await user.click(within(codex).getByRole("button", { name: "Use an API key" }));
		await user.type(within(codex).getByLabelText("Codex API key"), "sk-bad-2");
		await user.click(within(codex).getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Check the fields, then try again.");
		expect(within(codex).getByLabelText("Codex API key")).toHaveValue("");
		expect(document.body.innerHTML).not.toContain("sk-bad-2");
		save.mockRestore();
	});
});
