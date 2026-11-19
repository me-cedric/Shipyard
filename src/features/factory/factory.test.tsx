import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errorMessages } from "@/lib/i18n/errors";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { spendStatus } from "@/ui/molecules/spend-meter";

let router: ReturnType<typeof mountApp> | undefined;
afterEach(() => waitFor(() => expect(router?.state.status ?? "idle").toBe("idle")));

/** The pick of Recipes is in the address: the page needs the router. */
async function renderRecipes() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	router = mountApp("/crew/recipes");
}

describe("Factory tabs", () => {
	// jsdom has no matchMedia: the graph reads the colour scheme and the motion preference.
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("Recipes: the list of the recipes, and the role files in More, from the mock", async () => {
		const user = userEvent.setup();
		await renderRecipes();
		const wf = await unwrap(commands.workflowsList());
		const roles = await unwrap(commands.rolesList());
		const list = within(await screen.findByRole("list", { name: "Recipes" }));
		await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(wf.length));
		expect(list.getByRole("button", { name: /^Bug/ })).toHaveTextContent("4 steps");
		await user.click(screen.getByRole("button", { name: "More" }));
		expect(await screen.findAllByRole("menuitem", { name: /^Role: / })).toHaveLength(roles.length);
	});

	it("Workflows: a validation error shows with its line, and blocks the save", async () => {
		const user = userEvent.setup();
		await renderRecipes();
		await user.click(await screen.findByRole("button", { name: /^Bug/ }));
		await user.click(await screen.findByRole("button", { name: "Edit as text" }));
		const editor = await screen.findByRole("textbox", { name: "bug" });
		fireEvent.change(editor, {
			target: { value: (editor as HTMLTextAreaElement).value.replace("id: bug", "id: other") },
		});
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Line 2");
		expect(alert).toHaveTextContent("differs from the file name");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("Workflows: save calls workflowWrite", async () => {
		const user = userEvent.setup();
		await renderRecipes();
		await user.click(await screen.findByRole("button", { name: /^Bug/ }));
		await user.click(await screen.findByRole("button", { name: "Edit as text" }));
		const editor = (await screen.findByRole("textbox", { name: "bug" })) as HTMLTextAreaElement;
		const next = `${editor.value}\n# note\n`;
		fireEvent.change(editor, { target: { value: next } });
		const save = screen.getByRole("button", { name: "Save" });
		await waitFor(() => expect(save).toBeEnabled());
		await user.click(save);
		await waitFor(async () => expect((await unwrap(commands.workflowGet("bug"))).text).toBe(next));
	});

	it("Workflows: text typed during a save stays and saves next", async () => {
		const user = userEvent.setup();
		await renderRecipes();
		await user.click(await screen.findByRole("button", { name: /^Bug/ }));
		await user.click(await screen.findByRole("button", { name: "Edit as text" }));
		const editor = (await screen.findByRole("textbox", { name: "bug" })) as HTMLTextAreaElement;
		const first = `${editor.value}\n# a\n`;
		const second = `${first}# b\n`;
		const real = commands.workflowWrite;
		let release = () => {};
		const spy = vi.spyOn(commands, "workflowWrite").mockImplementationOnce(async (...a) => {
			await new Promise<void>((r) => {
				release = r;
			});
			return real(...a);
		});
		try {
			fireEvent.change(editor, { target: { value: first } });
			const save = screen.getByRole("button", { name: "Save" });
			await waitFor(() => expect(save).toBeEnabled());
			await user.click(save);
			fireEvent.change(editor, { target: { value: second } });
			expect(save).toBeDisabled();
			release();
			await waitFor(async () =>
				expect((await unwrap(commands.workflowGet("bug"))).text).toBe(first),
			);
			await waitFor(() => expect(save).toBeEnabled());
			expect(editor.value).toBe(second);
			await user.click(save);
			await waitFor(async () =>
				expect((await unwrap(commands.workflowGet("bug"))).text).toBe(second),
			);
		} finally {
			spy.mockRestore();
		}
	});

	it("Workflows: a role saves with roleWrite", async () => {
		const user = userEvent.setup();
		await renderRecipes();
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Role: Scout" }));
		const editor = (await screen.findByRole("textbox", { name: "scout" })) as HTMLTextAreaElement;
		const next = `${editor.value}\nBe brief.\n`;
		fireEvent.change(editor, { target: { value: next } });
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () => expect((await unwrap(commands.roleGet("scout"))).text).toBe(next));
	});

	it("Sessions: lists the sessions, and the kill switch toggles", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const rows = await unwrap(commands.sessionsList());
		expect(rows.length).toBeGreaterThan(0);
		router = mountApp("/crew/sessions");
		const here = await screen.findByRole("region", { name: "On this machine" });
		const live = rows.filter((r) => r.state === "running" || r.state === "gate");
		if (live.length > 0)
			expect(await within(here).findAllByRole("button", { name: /\S/ })).not.toHaveLength(0);
		// The kill switch lives on Crew, not on Sessions.
		expect(screen.queryByRole("switch", { name: "Agents on" })).toBeNull();
		await router.navigate({ to: "/crew/crew" });
		const on = await screen.findByRole("switch", { name: "Agents on" });
		expect(on).toBeChecked();
		await user.click(on);
		await waitFor(async () => expect(await unwrap(commands.killSwitchGet())).toBe(true));
		const stopped = await screen.findByRole("switch", { name: "Agents stopped" });
		expect(stopped).not.toBeChecked();
		await user.click(stopped);
		await waitFor(async () => expect(await unwrap(commands.killSwitchGet())).toBe(false));
	});

	it("Sessions: run units show in Active and Previous, with a total row and no tiles", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const rows = await unwrap(commands.sessionsList());
		const live = rows.filter((r) => r.state === "running" || r.state === "gate");
		router = mountApp("/crew/sessions");
		// The table with its Total row is gone: the tokens and the cost of the shown session are in its panel.
		const panel = within(await screen.findByRole("region", { name: /^Live output of / }));
		const tokens = (await panel.findByText(/ tokens$/)).textContent;
		expect(live.map((r) => `${r.tokens.toLocaleString("en")} tokens`)).toContain(tokens);
		expect(panel.getByText(/^\$\d+\.\d\d$/)).toBeInTheDocument();
		expect(document.querySelector("dl")).toBeNull();
		expect(screen.queryByRole("table", { name: "Sessions" })).toBeNull();
		// The ended sessions are on their own page.
		await router.navigate({ to: "/crew/sessions", search: { page: "ended" } as never });
		await screen.findByRole("heading", { name: "Ended sessions" });
		const ended = rows.filter((r) => r.state !== "running" && r.state !== "gate");
		expect(ended.length).toBeGreaterThan(0);
		await waitFor(() =>
			expect(screen.getAllByText("Claude Code", { exact: false }).length).toBeGreaterThan(0),
		);
	});

	it("Sessions: a running agent review is a session, and Stop ends it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.prReviewStart(141, true));
		const agent = mockState().agentPr;
		if (agent) agent.running = [141];
		router = mountApp("/crew/sessions");
		await user.click(await screen.findByRole("button", { name: /Review of pull request 141/ }));
		const panel = within(
			await screen.findByRole("region", { name: "Live output of Review of pull request 141" }),
		);
		// A run has no Stop here: only the review has one.
		expect(screen.getAllByRole("button", { name: /^Stop #/ })).toHaveLength(1);
		await user.click(panel.getByRole("button", { name: "Stop #141" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Stop #141" })).toBeNull());
		expect(mockState().agentPr?.running).toEqual([]);
	});

	it("Usage: three groups with counts on How agents do", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend?page=how");
		const u = await unwrap(commands.usageGet());
		for (const [name, n] of [
			["Per run", u.runs.length],
			["Per day", u.days.length],
			["Per member", u.members.length],
		] as const)
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		expect((await screen.findAllByRole("meter")).length).toBeGreaterThan(0);
		// A run row shows the ticket key and its title.
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		expect(await screen.findByText(run?.title ?? "")).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("Usage: Budgets sets the budget of one day with budgetSet, and a blank amount clears it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const u = await unwrap(commands.usageGet());
		const day = u.days[0]?.key ?? "";
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Add a limit" }));
		await user.type(screen.getByRole("textbox", { name: "Day or member" }), day);
		await user.type(screen.getByRole("spinbutton", { name: "Budget (USD)" }), "3");
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(async () =>
			expect((await unwrap(commands.usageGet())).days.find((d) => d.key === day)?.budget).toBe(3),
		);
		// An empty amount clears the budget.
		await user.click(await screen.findByRole("button", { name: `Edit the limit of ${day}` }));
		await user.clear(screen.getByRole("spinbutton", { name: "Budget (USD)" }));
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(async () =>
			expect(
				(await unwrap(commands.usageGet())).days.find((d) => d.key === day)?.budget,
			).toBeNull(),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("Usage: Budgets list the default once, then each key, also a key with no spend", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.budgetSet("day", "*", 5));
		await unwrap(commands.budgetSet("day", "2020-01-01", 7));
		const router = mountApp("/crew/spend?page=budgets");
		const panel = within(await screen.findByRole("region", { name: "Budgets" }));
		expect(await panel.findByText("2020-01-01")).toBeInTheDocument();
		expect(panel.getAllByText("$5.00")).toHaveLength(1);
		expect(panel.getByText("Each day")).toBeInTheDocument();
		expect(panel.getByText("$7.00")).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("Usage: with no budget set the rows say No limit and the form is closed", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.budgetSet("member", "Ada Lovelace", null));
		const router = mountApp("/crew/spend?page=budgets");
		const panel = within(await screen.findByRole("region", { name: "Budgets" }));
		expect((await panel.findAllByText("No limit")).length).toBeGreaterThan(1);
		expect(panel.queryByRole("textbox", { name: "Day or member" })).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("Usage: the request tree totals are the ones of its run", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const u = await unwrap(commands.usageGet());
		const trees = await Promise.all(u.runs.map((r) => unwrap(commands.usageTreeGet(r.run))));
		// The totals of a tree are the ones of its run when a step has started.
		const tree = trees.find((x) => x.steps.length > 0);
		if (!tree) throw new Error("the demo has a started run");
		const run = u.runs.find((r) => r.run === tree.run);
		expect(tree.tokens).toBe(run?.tokens);
		expect(tree.usd).toBeCloseTo(run?.usd ?? 0, 1);
		await expect(unwrap(commands.usageTreeGet("nope"))).rejects.toThrow(errorMessages.en.not_found);
	});

	it("Usage: Each person sets the default member budget", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const router = mountApp("/crew/spend?page=budgets");
		await user.click(await screen.findByRole("button", { name: "Edit the limit of each person" }));
		await user.clear(screen.getByRole("spinbutton", { name: "Budget (USD)" }));
		await user.type(screen.getByRole("spinbutton", { name: "Budget (USD)" }), "4");
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(async () => {
			const { members } = await unwrap(commands.usageGet());
			expect(members.some((m) => m.budget === 4)).toBe(true);
		});
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("Usage: status colour at 80 % and 100 %", () => {
		expect(spendStatus(1, null)).toBeNull();
		expect(spendStatus(7.9, 10)).toBe("success");
		expect(spendStatus(8, 10)).toBe("warning");
		expect(spendStatus(10, 10)).toBe("danger");
	});
});
