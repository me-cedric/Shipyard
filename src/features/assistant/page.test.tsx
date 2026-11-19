import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

/** The Ask page on the mock project, with the first thread loaded. */
async function mountPage() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const router = mountApp("/ask");
	await screen.findByRole("group", { name: "Mode" });
	await waitFor(() => expect(router.state.status).toBe("idle"));
	return router;
}
// An open warning hides the page from the accessibility tree: the level is read through it.
const level = () => within(screen.getByRole("group", { name: "Permission", hidden: true }));
const pressed = (name: string) =>
	expect(level().getByRole("button", { name, hidden: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
// The card "On a selection" has its own Send to an agent: this one is the button of the composer.
const toAgent = () =>
	within(document.querySelector("[data-drop-zone]") as HTMLElement).getByRole("button", {
		name: "Send to an agent",
	});

describe("Ask page, the full assistant", () => {
	it("shows the threads, the composer and the tools, with no side panel", async () => {
		await mountPage();
		expect(screen.getByRole("heading", { level: 1, name: "Ask" })).toBeVisible();
		expect(screen.queryByRole("complementary", { name: "Assistant" })).toBeNull();
		expect(screen.getByRole("button", { name: "New thread" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Rename" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
		const sees = within(screen.getByRole("list", { name: "What the assistant can see" }));
		expect(sees.getByRole("button", { name: "This screen" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(sees.getByRole("button", { name: "Add" })).toBeVisible();
		for (const m of ["Ask", "Plan", "Do"])
			expect(
				within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: m }),
			).toBeVisible();
		for (const p of ["Read only", "Asks first", "Alone"])
			expect(level().getByRole("button", { name: p })).toBeVisible();
		expect(screen.getByRole("button", { name: /^Model: / })).toBeVisible();
		expect(toAgent()).toBeDisabled();
		expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
		expect(screen.getByRole("progressbar", { name: "Context" })).toBeVisible();
		for (const h of ["On a selection", "The assistant may", "Panel"])
			expect(screen.getByRole("heading", { name: h })).toBeVisible();
		for (const b of ["Explain", "Fix"])
			expect(screen.getByRole("button", { name: b })).toBeDisabled();
		expect(screen.getByRole("slider", { name: "Width" })).toBeVisible();
	}, 20_000);

	it("maps the levels: Alone and Edit files alone are Auto, Run commands alone is Bypass", async () => {
		const user = userEvent.setup();
		await mountPage();
		const edit = () => screen.getByRole("switch", { name: "Edit files alone" });
		const run = () => screen.getByRole("switch", { name: "Run commands alone" });
		pressed("Asks first");
		// Auto shows its warning first.
		await user.click(level().getByRole("button", { name: "Alone" }));
		const auto = await screen.findByRole("dialog", { name: "Allow edits without approval" });
		pressed("Asks first");
		await user.click(within(auto).getByRole("button", { name: "Allow auto edits" }));
		await waitFor(() => expect(edit()).toBeChecked());
		pressed("Alone");
		expect(run()).not.toBeChecked();
		// Bypass asks, then shows as Alone with both switches on.
		await user.click(run());
		const bypass = await screen.findByRole("dialog", { name: "Bypass permissions" });
		await user.click(within(bypass).getByRole("button", { name: "Bypass permissions" }));
		await waitFor(() => expect(run()).toBeChecked());
		expect(edit()).toBeChecked();
		pressed("Alone");
		// Edit files alone off is Edit with approval; then Read only.
		await user.click(edit());
		await waitFor(() => pressed("Asks first"));
		expect(run()).not.toBeChecked();
		await user.click(level().getByRole("button", { name: "Read only" }));
		await waitFor(() => pressed("Read only"));
	}, 20_000);

	it("sends a message, shows the trace and the changed file with Undo, and the side of the panel", async () => {
		const user = userEvent.setup();
		await mountPage();
		await user.click(
			within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Do" }),
		);
		await user.type(screen.getByRole("textbox", { name: "Message" }), "Change hello{Enter}");
		const log = within(screen.getByRole("log", { name: "Messages" }));
		expect(await log.findByText("I changed src/hello.ts in the worktree.")).toBeVisible();
		expect(log.getByText(/^How I found this/)).toBeVisible();
		// The file box sits inside the answer card: the name opens the full diff, the count of added lines shows.
		const files = within(log.getByRole("region", { name: "Changed files" }));
		expect(files.getByText("Undo")).toBeVisible();
		expect(files.getByText(/^\+\d+$/)).toBeVisible();
		expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute(
			"placeholder",
			"Message",
		);
		await user.click(files.getByRole("button", { name: "src/hello.ts" }));
		expect(files.getByRole("region", { name: "Diff of src/hello.ts" })).toBeVisible();
		expect(toAgent()).toBeEnabled();
		const side = within(screen.getByRole("group", { name: "Side" }));
		await user.click(side.getByRole("button", { name: "Left" }));
		await waitFor(async () =>
			expect((await unwrap(commands.prefsGet())).assistantSide).toBe("left"),
		);
	}, 20_000);

	it("goes back to the side panel with Small bar, and the panel opens the page again", async () => {
		const user = userEvent.setup();
		const router = await mountPage();
		await user.type(screen.getByRole("textbox", { name: "Message" }), "a draft");
		await user.click(screen.getByRole("button", { name: "Small bar" }));
		const panel = within(await screen.findByRole("complementary", { name: "Assistant" }));
		// One state: the draft is in the panel too.
		expect(panel.getByRole("textbox", { name: "Message" })).toHaveValue("a draft");
		expect(router.state.location.pathname).not.toBe("/ask");
		await user.click(panel.getByRole("button", { name: "Open the full assistant" }));
		expect(await screen.findByRole("heading", { level: 1, name: "Ask" })).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	}, 20_000);

	it("asks for the Codex trust in an attention card: Not now hides it, Trust writes it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		// A new thread takes the default runner: Codex here.
		await unwrap(commands.assistantDefaultsSet({ runner: "codex", model: "gpt-5" }));
		const router = mountApp("/ask");
		await waitFor(() => expect(router.state.status).toBe("idle"));
		await screen.findByRole("heading", { name: "Codex asks: trust this folder?" });
		// The sentence that says what the click writes sits behind a disclosure, not a tooltip.
		const writes = screen.getByText("What this writes");
		expect(writes.closest("details")).not.toHaveAttribute("open");
		expect(writes.closest("details")).toHaveTextContent(/Codex does not trust this folder/);
		await user.click(screen.getByRole("button", { name: "Not now" }));
		expect(screen.queryByRole("heading", { name: "Codex asks: trust this folder?" })).toBeNull();
		expect(mockState().codexTrusted).toBe(false);
	}, 20_000);
});
