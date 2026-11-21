import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { joinOf } from "@/lib/ipc/mock-code-host";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

const line = (time: number, target: string) => ({
	time,
	member: null,
	found: "unknown" as const,
	right: "work.edit" as const,
	what: "work_transition",
	target,
	result: "refused",
});

// spec:app-redesign#REQ-016: Rights holds the rights of the roles and the team file.
describe("Crew / Rights", () => {
	it("shows the people and the rights of one role in plain words, under the one heading Crew", async () => {
		await withTracker();
		const router = mountApp("/crew/rights");
		const main = within(await screen.findByRole("main"));
		const people = within(await main.findByRole("region", { name: "People" }));
		expect(people.getByRole("link", { name: "Grace Hopper" })).toBeInTheDocument();
		expect(people.getByRole("button", { name: /^Roles of Grace Hopper/ })).toBeInTheDocument();
		expect(within(main.getByRole("group", { name: "Role" })).getAllByRole("button")).toHaveLength(
			9,
		);
		expect(main.getByRole("heading", { level: 2, name: "Developer can" })).toBeInTheDocument();
		// Ten rows: Plan and estimates, and "Code and merge" as one row (spec:shell-setup-rights#REQ-004).
		for (const row of [
			"Flow and tickets",
			"Specs",
			"Design",
			"Plan and estimates",
			"Start and stop agents",
			"Approve agent actions",
			"Code and merge",
			"Library",
			"Budgets",
			"Setup",
		])
			expect(main.getByRole("listitem", { name: row })).toBeInTheDocument();
		const heads = main.getAllByRole("heading", { level: 1 });
		expect(heads).toHaveLength(1);
		expect(heads[0]).toHaveTextContent("Crew");
		await idle(router);
	});

	it("opens the member form, the days off and the team file from the People card", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/rights");
		const people = within(await screen.findByRole("region", { name: "People" }));
		expect(people.getByRole("link", { name: "Add a person" })).toHaveAttribute(
			"href",
			"/crew/crew?member=",
		);
		expect(people.getByRole("link", { name: "Days off" })).toHaveAttribute(
			"href",
			"/plan/timeline?page=dates",
		);
		await user.click(people.getByRole("link", { name: "Team file, requests and log" }));
		expect(await screen.findByRole("heading", { level: 1, name: "Team" })).toBeInTheDocument();
		expect(router.state.location.search).toEqual({ page: "team" });
		// The back link and the section tab both lead to Rights.
		await user.click(screen.getAllByRole("link", { name: "Rights" })[0] as HTMLElement);
		expect(await screen.findByRole("heading", { level: 1, name: "Crew" })).toBeInTheDocument();
		await idle(router);
	});

	it("shows the changes of rights of the team file in plain words, the newest first", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().audit = [1, 2, 3, 4, 5, 6, 7].map((n) => line(1_700_000_000 + n, `ACME-${n}`));
		const router = mountApp("/crew/rights?page=team");
		const log = within(await screen.findByRole("region", { name: "Changes of rights" }));
		expect(log.getAllByRole("listitem")).toHaveLength(6);
		expect(log.getByText("Flow and tickets, ACME-7: refused")).toHaveAttribute(
			"title",
			"work_transition",
		);
		expect(log.queryByText(/ACME-2:/)).toBeNull();
		await user.click(log.getByRole("button", { name: "Older changes" }));
		expect(log.getAllByRole("listitem")).toHaveLength(7);
		expect(log.getByText(/ACME-1:/)).toBeInTheDocument();
		await idle(router);
	});

	it("tells an admin who asked to join", async () => {
		await withTracker();
		mockState().audit = [
			{ ...line(1_700_000_000, "shipyard/join-zed"), what: "team_join", result: "requested" },
		];
		const router = mountApp("/crew/rights?page=team");
		expect(await screen.findByRole("heading", { name: "zed asks to join" })).toBeInTheDocument();
		expect(await screen.findByText("asked to join")).toBeInTheDocument();
		await idle(router);
	});

	it("gives a person who is not in the team file the banner and the request form", async () => {
		await withTracker();
		mockState().person = {
			member: null,
			found: "unknown",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const router = mountApp("/crew/rights?page=team");
		expect(await screen.findByText("You are not in the team file")).toBeInTheDocument();
		expect(await screen.findByRole("form", { name: "Ask to join" })).toBeInTheDocument();
		await idle(router);
	});

	// spec:code-host-tickets#REQ-010: the join request card has As role, Refuse and Accept.
	it("lists a join request with As role, Refuse and Accept; Accept sets the role", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.joins = [joinOf(91, "Zed Nobody", "qa")];
		const router = mountApp("/crew/rights?page=team");
		expect(await screen.findByRole("heading", { name: "Zed Nobody asks to join" })).toBeVisible();
		// The role that the person asked for is the start; the admin picks another.
		const role = screen.getByRole("combobox", { name: "Role of Zed Nobody" });
		expect(role).toHaveTextContent("Tester");
		await user.click(role);
		await user.click(await screen.findByRole("option", { name: "Developer" }));
		await user.click(screen.getByRole("button", { name: "Accept" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "zed-nobody")?.role).toBe(
				"developer",
			),
		);
		await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).toBeNull());
		expect(mockState().work.joins).toEqual([]);
		await idle(router);
	});

	it("closes the pull request on Refuse and leaves the team file as it is", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.joins = [joinOf(91, "Zed Nobody", "qa")];
		const before = mockState().work.team.members.length;
		const router = mountApp("/crew/rights?page=team");
		await user.click(await screen.findByRole("button", { name: "Refuse" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Refuse" })).toBeNull());
		expect(mockState().work.joins).toEqual([]);
		expect(mockState().work.team.members).toHaveLength(before);
		await idle(router);
	});

	it("turns Accept off for a person with no merge right", async () => {
		await withTracker();
		mockState().work.joins = [joinOf(91, "Zed Nobody", "qa")];
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit", "code.write"],
		};
		const router = mountApp("/crew/rights?page=team");
		const accept = await screen.findByRole("button", { name: "Accept" });
		expect(accept).toBeDisabled();
		expect(screen.getByRole("button", { name: "Refuse" })).toBeEnabled();
		await idle(router);
	});
});
