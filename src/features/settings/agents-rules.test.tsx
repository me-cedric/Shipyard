import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const row = (name: string) => screen.findByRole("group", { name });

describe("Settings / Agents and rules: model tiers", () => {
	it("shows the five runners: a picker for a detected tool, free text for the others", async () => {
		mountApp("/settings/agents-rules");
		expect(await screen.findByRole("heading", { name: "Model tiers (5)" })).toBeInTheDocument();
		const claude = await row("claude");
		expect(await within(claude).findByRole("combobox", { name: "claude Top" })).toHaveTextContent(
			"opus",
		);
		expect(within(claude).getByRole("combobox", { name: "claude Mid" })).toHaveTextContent(
			"sonnet",
		);
		expect(within(claude).getByRole("combobox", { name: "claude Small" })).toHaveTextContent(
			"haiku",
		);
		for (const id of ["copilot", "gemini", "opencode"])
			expect(within(await row(id)).getByRole("textbox", { name: `${id} Top` })).toBeInTheDocument();
	});

	it("shows an effort only for a model that accepts one", async () => {
		mountApp("/settings/agents-rules");
		const claude = await row("claude");
		expect(
			await within(claude).findByRole("combobox", { name: "claude Top Effort" }),
		).toHaveTextContent("Default");
		expect(within(claude).getByRole("combobox", { name: "claude Mid Effort" })).toBeInTheDocument();
		// Haiku takes no effort.
		expect(within(claude).queryByRole("combobox", { name: "claude Small Effort" })).toBeNull();
		// The default model of Codex takes the levels of the tool.
		const codex = await row("codex");
		await within(codex).findByRole("combobox", { name: "codex Top" });
		expect(within(codex).getByRole("combobox", { name: "codex Top Effort" })).toBeInTheDocument();
	});

	it("saves a model and an effort that a person picks, and drops an effort the new model refuses", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const claude = await row("claude");
		await user.click(await within(claude).findByRole("combobox", { name: "claude Top Effort" }));
		await user.click(await screen.findByRole("option", { name: "high" }));
		const claudeRow = async () =>
			(await unwrap(commands.tiersGet())).find((r) => r.runner === "claude");
		await waitFor(async () => expect((await claudeRow())?.topEffort).toBe("high"));
		await user.click(within(claude).getByRole("combobox", { name: "claude Top" }));
		await user.click(await screen.findByRole("option", { name: "haiku" }));
		await waitFor(async () => expect((await claudeRow())?.top).toBe("haiku"));
		expect((await claudeRow())?.topEffort).toBe("");
		expect(within(claude).queryByRole("combobox", { name: "claude Top Effort" })).toBeNull();
	});

	it("saves a typed tier when the field loses focus", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const field = within(await row("copilot")).getByRole("textbox", { name: "copilot Top" });
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
		const group = await row("copilot");
		await user.type(within(group).getByRole("textbox", { name: "copilot Mid" }), "has space");
		await user.tab();
		expect(await screen.findByRole("alert")).toHaveTextContent("is not a model id");
		expect((await unwrap(commands.tiersGet()))[2]?.mid).toBe("");
	});
});
