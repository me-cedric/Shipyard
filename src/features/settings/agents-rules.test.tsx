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
// The tier controls have their own names ("Claude Code Top"): the whole page holds them. The
// default tool shows in the card, the others under "Other AI tools".
const tier = async (_name: string) => {
	await screen.findByRole("combobox", { name: "Claude Code Top" });
	return screen.getByRole("main");
};

describe("Settings / Agents and rules: model tiers", () => {
	it("shows the five runners: a picker for a detected tool, free text for the others", async () => {
		mountApp("/setup/computer?page=models");
		expect(await screen.findByRole("region", { name: "Models" })).toBeInTheDocument();
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
		mountApp("/setup/computer?page=models");
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
		mountApp("/setup/computer?page=models");
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
		mountApp("/setup/computer?page=models");
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
		mountApp("/setup/computer?page=models");
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
		mountApp("/setup/computer?page=models");
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
		mountApp("/setup/computer?page=models");
		const claude = await row("Claude Code");
		expect(within(claude).getAllByText("Signed in").length).toBeGreaterThan(0);
		expect(within(claude).queryByRole("button")).toBeNull();
		const codex = await row("Codex");
		expect(within(codex).getAllByText("Signed out").length).toBeGreaterThan(0);
		expect(within(codex).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Use a code instead" })).toBeInTheDocument();
		// A missing tool shows its state only: the install is on AI tools and connections.
		const gemini = await row("Gemini CLI");
		expect(within(gemini).getAllByText("Not installed").length).toBeGreaterThan(0);
		expect(within(gemini).queryByRole("button")).toBeNull();
	});

	it("asks before it installs a missing tool, and names the tool", async () => {
		const user = userEvent.setup();
		mountApp("/setup/computer");
		const gemini = await row("Gemini CLI");
		await user.click(within(gemini).getByRole("button", { name: "Install Gemini CLI" }));
		await user.click(
			await within(gemini).findByRole("button", { name: /to install Gemini CLI\?$/ }),
		);
		await waitFor(() =>
			expect(within(gemini).queryByRole("button", { name: /Install/ })).toBeNull(),
		);
	});

	it("signs in from the keyboard and shows the new state", async () => {
		const user = userEvent.setup();
		mountApp("/setup/computer?page=models");
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
		mountApp("/setup/computer?page=models");
		const codex = await row("Codex");
		await user.click(within(codex).getByRole("button", { name: "Sign in" }));
		const drawer = await screen.findByRole("region", { name: "Terminals" });
		await waitFor(() => expect(drawer).toBeVisible());
		expect(within(drawer).getAllByRole("tab")).toHaveLength(1);
	});

	it("saves a Codex API key, then keeps no key in the view", async () => {
		const user = userEvent.setup();
		const save = vi.spyOn(commands, "runnerCodexApiKey");
		mountApp("/setup/computer?page=models");
		await user.click(await screen.findByRole("button", { name: "Use an API key" }));
		const field = screen.getByLabelText("Codex API key");
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "sk-secret-1");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(save).toHaveBeenCalledWith("sk-secret-1", true));
		await waitFor(() => expect(screen.queryByLabelText("Codex API key")).toBeNull());
		expect(document.body.innerHTML).not.toContain("sk-secret-1");
		// The form opens again with an empty field.
		await user.click(await screen.findByRole("button", { name: "Use an API key" }));
		expect(screen.getByLabelText("Codex API key")).toHaveValue("");
		save.mockRestore();
	});

	it("clears the key and shows the error when the save fails", async () => {
		const user = userEvent.setup();
		const save = vi
			.spyOn(commands, "runnerCodexApiKey")
			.mockResolvedValueOnce({ status: "error", error: "The key is not valid." } as never);
		mountApp("/setup/computer?page=models");
		await user.click(await screen.findByRole("button", { name: "Use an API key" }));
		await user.type(screen.getByLabelText("Codex API key"), "sk-bad-2");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Check the fields, then try again.");
		expect(screen.getByLabelText("Codex API key")).toHaveValue("");
		expect(document.body.innerHTML).not.toContain("sk-bad-2");
		save.mockRestore();
	});
});

// spec:shell-setup-rights#REQ-006: each role shows its description and its model tier, and a person changes the tier.
describe("Settings / Agents and rules: a model for each agent role", () => {
	it("shows the tier of each role and writes the project file of a bundled role on a change", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		delete mockState().factory.roles.scout;
		expect(mockState().factory.roles.scout).toBeUndefined();
		mountApp("/setup/computer?page=models");
		const scout = await screen.findByRole("combobox", { name: "Model of Scout" });
		expect(scout).toHaveTextContent("Fast");
		expect(await screen.findByRole("combobox", { name: "Model of Worker" })).toHaveTextContent(
			"Standard",
		);
		await user.click(scout);
		await user.click(await screen.findByRole("option", { name: "Standard" }));
		await waitFor(() => expect(mockState().factory.roles.scout).toContain("model: mid"));
		// The description of the bundled role stays in the file.
		expect(mockState().factory.roles.scout).toContain("description:");
		await waitFor(() =>
			expect(screen.getByRole("combobox", { name: "Model of Scout" })).toHaveTextContent(
				"Standard",
			),
		);
	});

	it("is off without the right to change the settings of the project", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		mountApp("/setup/computer?page=models");
		const worker = await screen.findByRole("combobox", { name: "Model of Worker" });
		await waitFor(() => expect(worker.closest("fieldset")).toBeDisabled());
		await expect(unwrap(commands.roleModelSet("worker", "top"))).rejects.toBeDefined();
		expect(mockState().factory.roles.worker).toBeUndefined();
	});

	it("refuses a tier that does not exist and a role file that is not a name", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await expect(unwrap(commands.roleModelSet("worker", "huge"))).rejects.toBeDefined();
		await expect(unwrap(commands.roleModelSet("../x", "mid"))).rejects.toBeDefined();
	});
});
