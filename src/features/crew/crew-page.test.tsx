import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const main = () => within(screen.getByRole("main"));
const people = async () => within(await screen.findByRole("list", { name: "People" }));
/** Opens the member page of a person from the card. */
const openMember = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	// The name of a card is its visible text: it starts with the name of the person.
	await user.click(await (await people()).findByRole("button", { name: new RegExp(`^${name}`) }));
	expect(await main().findByRole("heading", { level: 1, name })).toBeInTheDocument();
	return main();
};

// spec:app-redesign#REQ-016: the people and the agent roles on one page, and the member page.
describe("Crew", () => {
	it("shows the people and the agent roles on one page with their current work", async () => {
		await withTracker();
		await importAll();
		const router = mountApp("/crew/crew");
		const list = await people();
		expect(await list.findAllByRole("button")).toHaveLength(5);
		// The ticket in progress of the person, and the load mark of the plan.
		const ada = list.getByRole("button", { name: /^Ada Lovelace/ });
		await waitFor(() => expect(ada).toHaveTextContent("Cache the project list"));
		await waitFor(() => expect(ada).toHaveTextContent(/Over by \d+ days|Has room/));
		const agents = within(screen.getByRole("list", { name: "Agents" }));
		// Two units build ACME-2: the role of their step has the work, and a plan waits for a person.
		await waitFor(() =>
			expect(agents.getByRole("link", { name: /^Worker/ })).toHaveTextContent(
				"Add export endpoint",
			),
		);
		expect(agents.getByRole("link", { name: /^Worker/ })).toHaveTextContent(/\d at work/);
		expect(agents.getByRole("link", { name: /^Planner/ })).toHaveTextContent(
			"Write the onboarding guide",
		);
		expect(agents.getByRole("link", { name: /^Planner/ })).toHaveTextContent("Waits for you");
		// A role with no work has no card: each card opens the live rows, and one leads to the budgets.
		expect(agents.queryByRole("link", { name: /^Docs/ })).toBeNull();
		expect(agents.getByRole("link", { name: /^Planner/ })).toHaveAttribute(
			"href",
			"/crew/crew?view=live",
		);
		// The spend and the recipes lead to their sections.
		expect(agents.getByRole("link", { name: "Budgets" })).toHaveAttribute("href", "/crew/spend");
		// The recipe of the demo gives each run a budget: the spend card shows it as the limit.
		expect(screen.getByText(/^Limit of \$\d+\.\d\d for each feature$/)).toBeInTheDocument();
		const recipes = within(screen.getByRole("list", { name: "Recipes" }));
		expect(await recipes.findByRole("link", { name: "Edit Bug" })).toHaveAttribute(
			"href",
			"/crew/recipes?recipe=bug",
		);
		expect(recipes.getByText("Triage")).toBeInTheDocument();
		expect(main().getAllByRole("heading", { level: 1 })).toHaveLength(1);
		await idle(router);
	});

	it("opens the recipe of a row in Recipes, and keeps the pick in the address", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		const recipes = within(await screen.findByRole("list", { name: "Recipes" }));
		await user.click(await recipes.findByRole("link", { name: "Edit Spike" }));
		const spike = await main().findByRole("button", { name: /^Spike/ });
		await waitFor(() => expect(spike).toHaveAttribute("aria-current", "true"));
		await user.click(main().getByRole("button", { name: /^Feature/ }));
		await waitFor(() => expect(router.state.location.search).toEqual({ recipe: "feature" }));
		// A recipe that is not in the list opens the first one.
		await router.navigate({ to: "/crew/recipes", search: { recipe: "nobody" } as never });
		await waitFor(() => expect(main().getAllByRole("button", { current: true })).toHaveLength(1));
		await idle(router);
	});

	it("hides the amounts of the spend card when Show prices is off", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/spend");
		// The switch moved to the More menu of Spend.
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: /prices$/ }));
		await router.navigate({ to: "/crew/crew" });
		const card = (await screen.findByText("Spend on open work")).closest("li");
		if (!card) throw new Error("no spend card");
		expect(card).not.toHaveTextContent("$");
		expect(within(card).getAllByText("Hidden").length).toBeGreaterThan(0);
		await idle(router);
	});

	it("stops all agents with the one switch of the header", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		// One section switch only: the header has no second switch of views.
		await user.click(await screen.findByRole("switch", { name: "Agents on" }));
		expect(main().getAllByRole("navigation")).toHaveLength(1);
		await waitFor(async () => expect(await unwrap(commands.killSwitchGet())).toBe(true));
		expect(await main().findByRole("switch", { name: "Agents stopped" })).toBeInTheDocument();
		await idle(router);
	});

	it("edits a member and writes the new capacity to the team", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		const panel = await openMember(user, "Grace Hopper");
		// The members table of before, on the page of the person: the days, the skills and the day rate.
		const days = within(
			panel.getAllByRole("group", { name: "Days in a week" }).at(-1) as HTMLElement,
		);
		expect(days.getByRole("status")).toHaveTextContent(/^4$/);
		const ofGrace = mockState().work.team.members.find((m) => m.handle === "grace");
		const skills = within(panel.getByRole("group", { name: "Skills" }));
		for (const skill of ofGrace?.skills ?? []) expect(skills.getByText(skill)).toBeInTheDocument();
		expect(panel.getByRole("spinbutton", { name: "Day rate" })).toHaveValue(
			ofGrace?.dayRate ?? null,
		);
		// A step is half a day.
		await user.click(days.getByRole("button", { name: "Less: Days in a week" }));
		await user.click(days.getByRole("button", { name: "Less: Days in a week" }));
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")?.capacity).toBe(3),
		);
		// Back to the cards, and the member opens with the new capacity.
		await user.click(panel.getByRole("link", { name: "Crew" }));
		const again = await openMember(user, "Grace Hopper");
		expect(
			within(
				again.getAllByRole("group", { name: "Days in a week" }).at(-1) as HTMLElement,
			).getByRole("status"),
		).toHaveTextContent(/^3$/);
		await idle(router);
	});

	it("adds a member with one primary action", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Add a person" }));
		const panel = main();
		expect(
			await panel.findByRole("heading", { level: 1, name: "Add a person" }),
		).toBeInTheDocument();
		await user.type(panel.getByRole("textbox", { name: "Name" }), "Barbara Liskov");
		await user.type(panel.getByRole("textbox", { name: "Handle" }), "barbara");
		await user.click(panel.getByRole("combobox", { name: "Role" }));
		await user.click(await screen.findByRole("option", { name: "Developer" }));
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().work.team.members).toHaveLength(6));
		// The saved member is open: a second save replaces the member and adds none.
		expect(
			await panel.findByRole("heading", { level: 1, name: "Barbara Liskov" }),
		).toBeInTheDocument();
		await user.click(panel.getByRole("button", { name: "Save" }));
		await user.click(panel.getByRole("link", { name: "Crew" }));
		await waitFor(async () => expect((await people()).getAllByRole("button")).toHaveLength(6));
		expect(mockState().work.team.members).toHaveLength(6);
		await idle(router);
	});

	it("refuses a duplicate handle, names it and keeps the last valid team", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		const panel = await openMember(user, "Grace Hopper");
		const handle = panel.getByRole("textbox", { name: "Handle" });
		await user.clear(handle);
		await user.type(handle, "ada");
		await user.click(panel.getByRole("button", { name: "Save" }));
		expect(await panel.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
		expect(mockState().work.team.members.map((m) => m.handle)).toEqual([
			"ada",
			"grace",
			"alan",
			"margaret",
			"edsger",
		]);
		await idle(router);
	});

	it("hides the day rate while the project is sealed and this machine has no passphrase", async () => {
		const user = userEvent.setup();
		await withTracker();
		await unwrap(commands.workSeal("s3cret"));
		await unwrap(commands.workLock());
		const router = mountApp("/crew/crew");
		const panel = await openMember(user, "Ada Lovelace");
		expect(panel.queryByRole("spinbutton", { name: "Day rate" })).toBeNull();
		// The day rate row says Sealed; Unlock shows the passphrase field in the row.
		const rate = within(panel.getByRole("group", { name: "Day rate" }));
		expect(rate.getByText("Sealed")).toBeInTheDocument();
		await user.click(rate.getByRole("button", { name: "Unlock" }));
		const field = panel.getByLabelText("Passphrase");
		// The field never shows what a person types.
		expect(field).toHaveAttribute("type", "password");
		await user.type(field, "wrong");
		await user.click(panel.getByRole("button", { name: "Unlock" }));
		expect(await panel.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
		expect(field).toHaveValue("");
		expect(panel.queryByRole("spinbutton", { name: "Day rate" })).toBeNull();
		await user.type(panel.getByLabelText("Passphrase"), "s3cret");
		await user.click(panel.getByRole("button", { name: "Unlock" }));
		expect(await panel.findByRole("spinbutton", { name: "Day rate" })).toHaveValue(520);
		expect(panel.queryByLabelText("Passphrase")).toBeNull();
		await idle(router);
	});

	it("keeps an edit of the member form when the seal opens, and keeps the day rate on save", async () => {
		const user = userEvent.setup();
		await withTracker();
		await unwrap(commands.workSeal("s3cret"));
		await unwrap(commands.workLock());
		const router = mountApp("/crew/crew");
		const panel = await openMember(user, "Ada Lovelace");
		await user.click(panel.getByRole("button", { name: "Add" }));
		const skills = panel.getByRole("textbox", { name: "Skills" });
		await user.clear(skills);
		await user.type(skills, "cobol");
		await user.click(
			within(panel.getByRole("group", { name: "Day rate" })).getByRole("button", {
				name: "Unlock",
			}),
		);
		await user.type(panel.getByLabelText("Passphrase"), "s3cret");
		await user.click(panel.getByRole("button", { name: "Unlock" }));
		expect(await panel.findByRole("spinbutton", { name: "Day rate" })).toHaveValue(520);
		expect(panel.getByRole("textbox", { name: "Skills" })).toHaveValue("cobol");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "ada")).toMatchObject({
				skills: ["cobol"],
				dayRate: 520,
			}),
		);
		await idle(router);
	});

	it("keeps the open member in the address: a link opens one person and Back closes the page", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew?member=grace");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Grace Hopper" }),
		).toBeInTheDocument();
		// The member page has the way back and no section switch.
		expect(main().queryByRole("navigation")).toBeNull();
		await user.click(main().getByRole("link", { name: "Crew" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		await openMember(user, "Ada Lovelace");
		expect(router.state.location.search).toEqual({ member: "ada" });
		router.history.back();
		expect(await screen.findByRole("list", { name: "People" })).toBeInTheDocument();
		// A handle that is not in the team opens no member page.
		await router.navigate({ to: "/crew/crew", search: { member: "nobody" } as never });
		expect(await screen.findByRole("list", { name: "People" })).toBeInTheDocument();
		await idle(router);
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		const router = mountApp("/crew/crew");
		const user = userEvent.setup();
		expect(await screen.findByRole("heading", { name: "Personnes" })).toBeInTheDocument();
		await user.click(main().getByRole("button", { name: "Plus" }));
		expect(
			await screen.findByRole("menuitem", { name: "Ajouter une personne" }),
		).toBeInTheDocument();
		await idle(router);
	});

	it("turns Member off with the right for a developer", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		const router = mountApp("/crew/crew");
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "More" }));
		const add = await screen.findByRole("menuitem", { name: "Add a person" });
		expect(add).toHaveAttribute("aria-disabled", "true");
		// The intent still opens the page of a new person: its Save is off, with the reason.
		await user.keyboard("{Escape}");
		await router.navigate({ to: "/crew/crew", search: { member: "" } as never });
		const save = await main().findByRole("button", { name: "Save" });
		expect(save).toBeDisabled();
		expect(save).toHaveAccessibleDescription(
			"Your role, Developer, cannot change the project settings.",
		);
		await idle(router);
	});

	it("saves the e-mails, the role, the admin flag and the right changes of a member", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/crew");
		const panel = await openMember(user, "Grace Hopper");
		await user.type(panel.getByRole("textbox", { name: "Emails" }), "grace@example.com");
		await user.click(panel.getByRole("combobox", { name: "Role" }));
		await user.click(await screen.findByRole("option", { name: "Architect" }));
		// The rights of each role are on Rights: the row leads there.
		expect(panel.getByRole("link", { name: "Rights of each role" })).toHaveAttribute(
			"href",
			"/crew/rights",
		);
		await user.click(panel.getByRole("switch", { name: "Admin of the team" }));
		await user.click(panel.getByRole("button", { name: "Change" }));
		await user.type(panel.getByRole("textbox", { name: /^Right changes/ }), "-code.merge");
		await user.click(panel.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")).toMatchObject({
				emails: ["grace@example.com"],
				role: "architect",
				admin: true,
				rights: ["-code.merge"],
			}),
		);
		await idle(router);
	});
});
