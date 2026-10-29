import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const row = (name: string) => screen.findByRole("group", { name });

describe("Settings / Agents and rules: model tiers", () => {
	it("shows the five runners with their tiers and a count", async () => {
		mountApp("/settings/agents-rules");
		expect(await screen.findByRole("heading", { name: "Model tiers (5)" })).toBeInTheDocument();
		const claude = await row("claude");
		expect(within(claude).getByRole("textbox", { name: "claude Top" })).toHaveValue("opus");
		expect(within(claude).getByRole("textbox", { name: "claude Mid" })).toHaveValue("sonnet");
		expect(within(claude).getByRole("textbox", { name: "claude Small" })).toHaveValue("haiku");
		for (const id of ["codex", "copilot", "gemini", "opencode"]) await row(id);
	});

	it("saves a tier when the field loses focus", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const field = within(await row("codex")).getByRole("textbox", { name: "codex Top" });
		await user.type(field, "gpt-5");
		await user.tab();
		await waitFor(async () =>
			expect((await unwrap(commands.tiersGet())).find((r) => r.runner === "codex")?.top).toBe(
				"gpt-5",
			),
		);
	});

	it("shows the refusal of a bad model id", async () => {
		const user = userEvent.setup();
		mountApp("/settings/agents-rules");
		const group = await row("codex");
		await user.type(within(group).getByRole("textbox", { name: "codex Mid" }), "has space");
		await user.tab();
		expect(await screen.findByRole("alert")).toHaveTextContent("is not a model id");
		expect((await unwrap(commands.tiersGet()))[1]?.mid).toBe("");
	});
});
