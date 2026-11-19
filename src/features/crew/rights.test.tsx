import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
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
		// Ten rows: "Code and merge" of the design is two rights.
		for (const row of [
			"Flow and tickets",
			"Specs",
			"Design",
			"Start and stop agents",
			"Approve agent actions",
			"Code",
			"Merge",
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
});
