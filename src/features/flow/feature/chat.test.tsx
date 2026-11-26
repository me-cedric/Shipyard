import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import type { FlowFeature_Serialize } from "@/lib/ipc/bindings";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// Chat of `spec:app-redesign#REQ-023` (picture 023).
const feature = (f: Partial<FlowFeature_Serialize> & { title: string }): FlowFeature_Serialize => ({
	stage: "build",
	mark: null,
	ticket: null,
	change: null,
	run: null,
	pr: null,
	who: null,
	runState: null,
	approvals: 0,
	questions: 0,
	checks: null,
	stop: null,
	...f,
});

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

afterEach(() => vi.restoreAllMocks());

describe("Chat (REQ-023)", () => {
	it("shows the Recipe, the composer with Send and Stop, and the three developer rows", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		if (!run) throw new Error("the demo has a run for ACME-2");
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				feature({
					title: "Add the health dot",
					ticket: "wi:ACME-2",
					run: `run:${run.id}`,
					runState: "Working",
				}),
			],
		});
		const router = mountApp("/flow/feature/wi%3AACME-2?section=chat");
		const panel = await screen.findByRole("tabpanel", { name: "Chat" });
		expect(await within(panel).findByText("Recipe")).toBeVisible();
		expect(within(panel).getByText("For developers")).toBeVisible();
		expect(
			within(panel).getByRole("button", { name: "Live terminal of this agent" }),
		).toBeVisible();
		expect(within(panel).getByRole("button", { name: "Requests and cost" })).toBeVisible();
		const message = within(panel).getByRole("textbox", { name: "Message to Builder" });
		expect(message).toBeVisible();
		// The open questions of the agent have their own Send: the composer is the form of the field.
		const composer = within(message.closest("form") as HTMLElement);
		expect(within(panel).getAllByRole("img", { name: "Done" }).length).toBeGreaterThan(0);
		expect(composer.getByRole("button", { name: "Send" })).toBeDisabled();
		expect(composer.getByRole("button", { name: "Stop" })).toBeVisible();
		// The composer sits in the flow, not pinned over the list.
		expect(message.closest("form")?.className).not.toContain("sticky");
		// With text the button is enabled; a working agent takes no note: the click says so.
		await user.type(message, "Add a test");
		expect(composer.getByRole("button", { name: "Send" })).toBeEnabled();
		await user.click(composer.getByRole("button", { name: "Send" }));
		expect(await composer.findByRole("alert")).toBeVisible();
		// Each row opens its panel.
		await user.click(within(panel).getByRole("button", { name: /^All \d+ events$/ }));
		expect(await within(panel).findByRole("region", { name: /^Events/ })).toBeVisible();
		await idle(router);
	});

	it("draws the words of the person as a bubble, an approval as a message, and Show the change in the bubble of the agent", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		if (!run) throw new Error("the demo has a run for ACME-2");
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				feature({
					title: "Add the health dot",
					ticket: "wi:ACME-2",
					run: `run:${run.id}`,
					runState: "Working",
				}),
			],
		});
		const router = mountApp("/flow/feature/wi%3AACME-2?section=chat");
		const panel = await screen.findByRole("tabpanel", { name: "Chat" });
		const said = await within(panel).findByText("Add a JSON example to the description first.");
		expect(said).toBeVisible();
		// The reply of the agent comes after the person, and holds the link to the change.
		const reply = within(panel).getByText("The description now has a JSON example.");
		expect(said.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		const bubble = reply.closest("div.rounded-xl") as HTMLElement;
		expect(within(bubble).getByRole("button", { name: "Show the change" })).toBeVisible();
		// An approval: the sentence first, then Reject and Approve in this order, and no Details for a comment of text.
		const approval = within(panel).getByRole("region", { name: "Move ACME-2 to In Progress" });
		const order = within(approval)
			.getAllByRole("button")
			.map((b) => b.textContent);
		expect(order).toEqual(["Reject", "Approve"]);
		expect(within(approval).queryByText("Details")).toBeNull();
		// The text of a pull request stays behind Details.
		const pull = within(panel).getByRole("region", { name: "Open a pull request for ACME-2" });
		expect(pull.querySelector("details")).not.toBeNull();
		expect(within(panel).getByText("Pull request")).toBeVisible();
		await idle(router);
	});

	it("is not blank for a ticket with no agent: the empty state with Start an agent", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [feature({ title: "An idea", stage: "idea", ticket: "wi:IDEA-1" })],
		});
		const router = mountApp("/flow/feature/wi%3AIDEA-1?section=chat");
		const panel = await screen.findByRole("tabpanel", { name: "Chat" });
		expect(await within(panel).findByText("Nothing to say yet")).toBeVisible();
		expect(within(panel).getByRole("button", { name: "Start an agent" })).toBeVisible();
		await idle(router);
	});
});
