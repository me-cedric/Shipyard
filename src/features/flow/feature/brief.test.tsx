import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// Brief, Design and the files of the change of a feature (`spec:app-redesign#REQ-012`).
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const AUTH = "/flow/feature/change%3Aadd-auth";

afterEach(() => vi.restoreAllMocks());

describe("Feature page / Brief", () => {
	it("lists each requirement with the state of its test, and opens the files of the change", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp(`${AUTH}?section=brief`);
		const must = within(await screen.findByRole("region", { name: "What it must do" }));
		expect((await must.findByText("Refresh a token")).closest("li")).toHaveTextContent(
			"Test passes",
		);
		expect(must.getByText("Expire a token").closest("li")).toHaveTextContent("No test yet");
		expect(must.getByRole("button", { name: "Add a requirement" })).toBeVisible();
		expect(must.getByRole("button", { name: "Test plan" })).toBeVisible();
		const linked = within(screen.getByRole("region", { name: "Linked" }));
		expect(linked.getByRole("link", { name: "Files of the change" })).toBeVisible();
		await user.click(must.getByRole("button", { name: "Edit as text" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/flow/feature/change%3Aadd-auth/spec"),
		);
		expect(router.state.location.search).toEqual({ file: "spec", view: "text" });
		// The page opens the spec in the text editor, and its back link returns to Brief.
		expect(await screen.findByRole("textbox", { name: "Spec" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Next step: split into tickets" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Brief" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ section: "brief" }));
		await idle(router);
	});

	it("splits the change into more tickets from the Tickets card", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp(`${AUTH}?section=brief`);
		const tickets = within(await screen.findByRole("region", { name: "Tickets" }));
		await user.click(tickets.getByRole("button", { name: "Split into more tickets" }));
		expect(await screen.findByRole("dialog")).toBeVisible();
		await idle(router);
	});

	it("shows an open question of the specs of the change, and an answer folds into the spec", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/flow/feature/wi%3AACME-3?section=brief");
		expect(
			await screen.findByRole("heading", { name: "Which export formats ship first?" }),
		).toBeVisible();
		expect(screen.getByText("Open question")).toBeVisible();
		// A feature with a spec links it in the Linked card.
		expect(
			within(screen.getByRole("region", { name: "Linked" })).getByRole("button", {
				name: "Spec: export",
			}),
		).toBeVisible();
		const spec = "docs/openspec/changes/add-export/specs/export/spec.md";
		await user.type(
			await screen.findByRole("textbox", { name: "Another answer" }),
			"CSV first{Enter}",
		);
		await waitFor(() => expect(mockState().specs.files[spec]?.text).toContain("CSV first"));
		await idle(router);
	});

	it("shows the open question of the agent as a heading, and an option answers it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const answer = vi.spyOn(commands, "questionAnswer");
		const router = mountApp("/flow/feature/wi%3AACME-1?section=brief");
		const q = await screen.findByRole("heading", {
			name: "Where should the user land after the session expires?",
		});
		expect(q).toBeVisible();
		expect(screen.getByText("Open question")).toBeVisible();
		// With no spec: the empty state. The ticket fields are on the ticket page, one link away.
		expect(screen.getByRole("button", { name: "Write the spec" })).toBeVisible();
		expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "The home page" }));
		await waitFor(() => expect(answer).toHaveBeenCalled());
		expect(answer.mock.calls[0]?.[2]).toEqual({ kind: "option", n: 2 });
		// One way to the ticket fields: the ticket row of the Tickets card opens the ticket in the inspector.
		const tickets = within(screen.getByRole("region", { name: "Tickets" }));
		expect(tickets.queryByRole("button", { name: "Ticket fields" })).toBeNull();
		await user.click(tickets.getAllByRole("button")[0] as HTMLElement);
		expect(await screen.findByLabelText("Inspector", { selector: "aside" })).toBeVisible();
		await idle(router);
	});
});

describe("Feature page / Design", () => {
	it("shows the decision of the agent about a screen on Design only, and an option answers it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const answer = vi.spyOn(commands, "questionAnswer");
		const router = mountApp("/flow/feature/wi%3AACME-5?section=design");
		const title = "The code has no Settings screen yet";
		expect(await screen.findByRole("heading", { name: title })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Build it" }));
		await waitFor(() => expect(answer).toHaveBeenCalled());
		expect(answer.mock.calls[0]?.[2]).toEqual({ kind: "option", n: 2 });
		// Brief does not show it. The demo case of this ticket has a spec: Brief draws its requirements.
		await user.click(screen.getByRole("button", { name: "Brief" }));
		expect(await screen.findByRole("region", { name: "What it must do" })).toBeVisible();
		expect(screen.queryByRole("heading", { name: title })).toBeNull();
		await idle(router);
	});

	it("shows the demo case of the settings page: two screens, a diagram, token rows and a decision", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/flow/feature/wi%3AACME-5?section=design");
		const screens = within(await screen.findByRole("region", { name: "Screens" }));
		expect(await screens.findByRole("button", { name: "Home" })).toBeVisible();
		expect(screens.getByRole("button", { name: "Checkout" })).toBeVisible();
		expect(screens.getByRole("button", { name: "Design to code" })).toBeVisible();
		expect(
			within(screen.getByRole("region", { name: "Diagrams" })).getByRole("button", {
				name: "context",
			}),
		).toBeVisible();
		const tokens = within(screen.getByRole("region", { name: "Design tokens" }));
		expect(await tokens.findByText("Accent")).toBeVisible();
		expect(tokens.getByText("#2557e6")).toBeVisible();
		const decision = within(screen.getByRole("region", { name: "Decisions" }));
		expect(
			decision.getByRole("button", { name: /Polling sync with local mirror/ }),
		).toHaveTextContent("accepted");
		await idle(router);
	});

	it("shows the screens, the diagrams and the decisions that cite the feature, with their actions", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		vi.spyOn(commands, "refsBacklinks").mockImplementation(async (ref) => ({
			status: "ok",
			data:
				ref === "change:add-auth"
					? [
							{ kind: "screen", count: 1, items: [{ source: "screen:home", title: "Home" }] },
							{
								kind: "diagram",
								count: 1,
								items: [{ source: "diagram:context", title: "Context" }],
							},
							{ kind: "adr", count: 1, items: [{ source: "adr:0001", title: "Use SQLite" }] },
						]
					: [],
		}));
		// The demo design doc holds no token: the project of this test has two.
		vi.spyOn(commands, "designTokens").mockResolvedValue({
			status: "ok",
			data: [
				{
					path: "docs/design.md",
					tokens: [
						{ name: "--accent", value: "#2450d8" },
						{ name: "--text", value: "#151821" },
					],
				},
			],
		});
		const router = mountApp(`${AUTH}?section=design`);
		const screens = within(await screen.findByRole("region", { name: "Screens" }));
		expect(await screens.findByRole("button", { name: "Home" })).toBeVisible();
		expect(screens.getByRole("button", { name: "Open the screens" })).toBeVisible();
		expect(screens.getByRole("button", { name: "Design to code" })).toBeVisible();
		const diagrams = within(screen.getByRole("region", { name: "Diagrams" }));
		expect(diagrams.getByRole("button", { name: "Context" })).toBeVisible();
		expect(
			within(screen.getByRole("region", { name: "Decisions" })).getByRole("button", {
				name: /Use SQLite/,
			}),
		).toBeVisible();
		const tokens = within(screen.getByRole("region", { name: "Design tokens" }));
		expect(tokens.getByText("Accent")).toBeVisible();
		expect(tokens.getByText("#2450d8")).toBeVisible();
		expect(tokens.getByText("Text")).toBeVisible();
		await user.click(diagrams.getByRole("button", { name: "Open the diagrams" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/diagrams"));
		await idle(router);
	});
});
