import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { joinEntry } from "@/features/work/team-rights";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
/** The row of a right in the role card. */
const row = async (name: string) => within(await screen.findByRole("listitem", { name }));
const pressed = (name: string) =>
	screen.getAllByRole("button", { name, pressed: true }).filter((b) => b.closest("li"));

// The members and their form are on Crew: `src/features/crew/crew-page.test.tsx`.
describe("Crew / Rights: the team file", () => {
	it("shows the rights of each role as switches, and names who the person is", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "account",
			role: "techlead",
			admin: true,
			readOnly: false,
			rights: ["project.settings", "work.edit"],
		};
		const router = mountApp("/crew/rights?role=viewer");
		expect(await screen.findByRole("heading", { name: "Viewer can" })).toBeInTheDocument();
		// The viewer does not see Code and the costs by default (spec:app-redesign#REQ-006).
		expect(pressed("See")).toHaveLength(6);
		// Two hidden areas, and no merge and no approval.
		expect(pressed("No")).toHaveLength(4);
		expect((await row("Code")).getByRole("button", { name: "No" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await user.click(screen.getByRole("button", { name: "Developer" }));
		expect(await screen.findByRole("heading", { name: "Developer can" })).toBeInTheDocument();
		expect(router.state.location.search).toEqual({ role: "developer" });
		expect(
			(await row("Approve agent actions")).getByRole("button", { name: "Yes" }),
		).toHaveAttribute("aria-pressed", "true");
		// A choice of a role writes nothing.
		expect(mockState().work.team.roles).toBeUndefined();
		await router.navigate({ to: "/crew/rights", search: { page: "team" } as never });
		expect(await screen.findByText("You are ada (Account)")).toBeInTheDocument();
		// a grid wider than the page scrolls sideways, and the keyboard reaches the scroll
		const scroll = await screen.findByRole("region", { name: "Rights of each person" });
		expect(scroll).toHaveAttribute("tabindex", "0");
		expect(scroll).toHaveClass("overflow-auto");
		await idle(router);
	});

	it("changes the level of a right in place and saves the roles block", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/rights?role=developer");
		await user.click((await row("Budgets")).getByRole("button", { name: "See" }));
		await waitFor(() =>
			expect(mockState().work.team.roles).toEqual({ developer: { costs: "read" } }),
		);
		await waitFor(async () =>
			expect((await row("Budgets")).getByRole("button", { name: "See" })).toHaveAttribute(
				"aria-pressed",
				"true",
			),
		);
		await user.click(screen.getByRole("button", { name: "Viewer" }));
		await user.click((await row("Merge")).getByRole("button", { name: "Yes" }));
		await waitFor(() =>
			expect(mockState().work.team.roles).toEqual({
				developer: { costs: "read" },
				viewer: { merge: true },
			}),
		);
		await idle(router);
	});

	it("resets a role to its defaults and drops its cells from the block", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.team.roles = { developer: { costs: "read" } };
		const router = mountApp("/crew/rights?role=developer");
		await row("Budgets");
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Reset Developer to defaults" }));
		await waitFor(() => expect(mockState().work.team.roles).toBeUndefined());
		await idle(router);
	});

	it("gives a member several roles and shows the highest levels", async () => {
		const user = userEvent.setup();
		await withTracker();
		const grace = mockState().work.team.members.find((m) => m.handle === "grace");
		Object.assign(grace ?? {}, { role: "viewer", roles: undefined, rights: [], admin: false });
		const router = mountApp("/crew/rights?page=team");
		const members = () => screen.findByRole("table", { name: "Members" });
		const before = within(within(await members()).getByRole("row", { name: "grace levels" }));
		expect(before.queryAllByRole("img", { name: "Read and write" })).toHaveLength(0);
		await user.click(screen.getByRole("link", { name: "Rights" }));
		await user.click(await screen.findByRole("button", { name: "Roles of Grace Hopper: Viewer" }));
		await user.click(await screen.findByRole("menuitemcheckbox", { name: "Developer" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")).toMatchObject({
				role: "viewer",
				roles: ["viewer", "developer"],
			}),
		);
		expect(
			await screen.findByRole("button", { name: "Roles of Grace Hopper: Viewer, Developer" }),
		).toBeInTheDocument();
		// A member keeps one role at least: the backend refuses, and the refusal shows.
		await user.click(screen.getByRole("menuitemcheckbox", { name: "Viewer" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")?.role).toBe(
				"developer",
			),
		);
		await user.click(screen.getByRole("menuitemcheckbox", { name: "Developer" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("grace needs one role");
		await user.keyboard("{Escape}");
		// Developer adds writes.
		await router.navigate({ to: "/crew/rights", search: { page: "team" } as never });
		const grown = within(await members()).getByRole("row", { name: "grace levels" });
		expect(within(grown).getAllByRole("img", { name: "Read and write" }).length).toBeGreaterThan(3);
		// The row holds its content: no fixed height, no absolute place.
		expect(grown.style.height).toBe("");
		expect(grown.closest("[data-index]")).toBeNull();
		await idle(router);
	});

	it("turns the switches and the role buttons off without project.settings, with the reason", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		const router = mountApp("/crew/rights");
		const reason = "Needs the right project.settings (your role: Developer)";
		const change = (await row("Specs")).getByRole("button", { name: "Change" });
		await waitFor(() => expect(change).toBeDisabled());
		expect(change.closest("fieldset")).toHaveAttribute("title", reason);
		const role = screen.getByRole("button", { name: /^Roles of Grace Hopper/ });
		expect(role).toBeDisabled();
		expect(role).toHaveAccessibleDescription(reason);
		await idle(router);
	});

	it("shows an unknown person the banner and sends a join request: with no code host, the branch stays local", async () => {
		const user = userEvent.setup();
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
		const form = within(await screen.findByRole("form", { name: "Ask to join" }));
		expect(form.getByRole("button", { name: "Copy the line" })).toBeInTheDocument();
		await user.type(form.getByRole("textbox", { name: "Name" }), "Zed Nobody");
		await user.type(form.getByRole("textbox", { name: "E-mails" }), "zed@example.com");
		// The line for the team file shows before the send.
		expect(form.getByText(/name: "Zed Nobody"/)).toBeInTheDocument();
		await user.click(form.getByRole("button", { name: "Send the request" }));
		expect(await form.findByText("git push origin shipyard/join-zed")).toBeInTheDocument();
		expect(form.getByRole("button", { name: "Copied" })).toBeInTheDocument();
		expect(
			joinEntry({ name: "Zed Nobody", email: "zed@example.com", account: "", role: "qa" }),
		).toContain("role: viewer");
		await idle(router);
	});

	it("proposes the roles of this machine as members and drops them from the registry after one click", async () => {
		const user = userEvent.setup();
		await withTracker();
		const project = (await unwrap(commands.projectsActive()))?.overrides;
		if (!project) throw new Error("no project");
		await unwrap(
			commands.projectOverridesSave({
				...project,
				assignments: { "eve@example.com": "lead", "joe@example.com": "junior" },
				pageModes: { junior: { "code/terminal": "hidden" } },
			}),
		);
		const router = mountApp("/crew/rights?page=team");
		const panel = within(
			await screen.findByRole("region", { name: "Roles live in the team file" }),
		);
		expect(panel.getByRole("button", { name: "Open the file" })).toBeInTheDocument();
		expect(await panel.findByText("eve@example.com")).toBeInTheDocument();
		expect(panel.getByText(/code\/terminal hidden/)).toBeInTheDocument();
		await user.click(panel.getByRole("button", { name: "Move the roles to the team file" }));
		await waitFor(() =>
			expect(
				mockState().work.team.members.find((m) => m.emails?.[0] === "joe@example.com"),
			).toMatchObject({
				role: "developer",
				rights: ["-code.merge", "-runs.approve"],
			}),
		);
		expect(
			mockState().work.team.members.find((m) => m.emails?.[0] === "eve@example.com")?.role,
		).toBe("po");
		await waitFor(async () =>
			expect((await unwrap(commands.projectsActive()))?.overrides.assignments).toBeNull(),
		);
		// Nothing is left to move: the button goes, the way to the file stays.
		await waitFor(() =>
			expect(panel.queryByRole("button", { name: "Move the roles to the team file" })).toBeNull(),
		);
		await idle(router);
	});

	it("lists the audit tail for a person with project.settings", async () => {
		await withTracker();
		mockState().audit = [
			{
				time: 1_700_000_000,
				member: null,
				found: "unknown",
				right: "work.edit",
				what: "work_transition",
				target: "ACME-1",
				result: "refused",
			},
		];
		const router = mountApp("/crew/rights?page=team");
		const log = within(await screen.findByRole("region", { name: "Changes of rights" }));
		expect(log.getByTitle("work_transition")).toHaveTextContent(
			"Unknown Flow and tickets, ACME-1: refused",
		);
		expect(log.getByText("14 Nov")).toBeInTheDocument();
		await idle(router);
	});
});
