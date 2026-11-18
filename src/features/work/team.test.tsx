import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";
import { joinEntry } from "./team-rights";

// The members and their form are on Crew: `src/features/crew/crew-page.test.tsx`.
describe("Crew / Rights: the team file", () => {
	it("shows the rights of each role with icons, and names who the person is", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "account",
			role: "techlead",
			admin: true,
			readOnly: false,
			rights: ["project.settings", "work.edit"],
		};
		mountApp("/crew/rights");
		const matrix = within(await screen.findByRole("table", { name: "Rights of each role" }));
		expect(matrix.getAllByRole("row")).toHaveLength(10);
		const viewer = within(matrix.getByRole("row", { name: /^Viewer/ }));
		expect(viewer.getAllByRole("img", { name: "Read" })).toHaveLength(7);
		expect(viewer.getAllByRole("img", { name: "Hidden" })).toHaveLength(1);
		expect(viewer.getAllByRole("img", { name: /^(Merge|Approve) no$/ })).toHaveLength(2);
		expect(
			within(matrix.getByRole("row", { name: /^Developer/ })).getByRole("img", {
				name: "Approve yes",
			}),
		).toBeInTheDocument();
		expect(await screen.findByText("You are ada (Account)")).toBeInTheDocument();
		// a grid wider than the page scrolls sideways, and the keyboard reaches the scroll
		const region = screen.getByRole("region", { name: "Rights of each role" });
		expect(region).toHaveAttribute("tabindex", "0");
		expect(region).toHaveClass("overflow-auto");
	});

	it("edits the level of a cell and saves the roles block", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/crew/rights");
		await user.click(await screen.findByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("combobox", { name: "Developer Costs" }));
		await user.click(await screen.findByRole("option", { name: "Read" }));
		await user.click(screen.getByRole("switch", { name: "Viewer Merge" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.roles).toEqual({
				developer: { costs: "read" },
				viewer: { merge: true },
			}),
		);
		// Back to the read view, with the new level.
		const matrix = within(await screen.findByRole("table", { name: "Rights of each role" }));
		expect(
			within(matrix.getByRole("row", { name: /^Developer/ })).queryByRole("img", {
				name: "Hidden",
			}),
		).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Developer Costs" })).toBeNull();
	});

	it("resets a role to its defaults and drops its cells from the block", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.team.roles = { developer: { costs: "read" } };
		mountApp("/crew/rights");
		await user.click(await screen.findByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("button", { name: "Reset Developer to defaults" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mockState().work.team.roles).toBeUndefined());
	});

	it("cancels an edit without a write", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/crew/rights");
		await user.click(await screen.findByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("combobox", { name: "Developer Costs" }));
		await user.click(await screen.findByRole("option", { name: "Read" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mockState().work.team.roles).toBeUndefined();
		expect(screen.queryByRole("combobox", { name: "Developer Costs" })).toBeNull();
	});

	it("gives a member several roles and shows the highest levels", async () => {
		const user = userEvent.setup();
		await withTracker();
		const grace = mockState().work.team.members.find((m) => m.handle === "grace");
		Object.assign(grace ?? {}, { role: "viewer", roles: undefined, rights: [], admin: false });
		mountApp("/crew/rights");
		const members = within(await screen.findByRole("table", { name: "Members" }));
		const before = within(members.getByRole("row", { name: "grace levels" }));
		expect(before.queryAllByRole("img", { name: "Read and write" })).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("combobox", { name: "Add a role to Grace Hopper" }));
		await user.click(await screen.findByRole("option", { name: "Developer" }));
		// Developer adds writes at once, before the save.
		expect(
			within(members.getByRole("row", { name: "grace levels" })).getAllByRole("img", {
				name: "Read and write",
			}).length,
		).toBeGreaterThan(3);
		// The row holds its content: no fixed height, no absolute place.
		const grown = members.getByRole("row", { name: "grace levels" });
		expect(grown.style.height).toBe("");
		expect(grown.closest("[data-index]")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.team.members.find((m) => m.handle === "grace")).toMatchObject({
				role: "viewer",
				roles: ["viewer", "developer"],
			}),
		);
		// A member keeps one role at least: the backend refuses, and the refusal shows.
		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("button", { name: "Remove Viewer from Grace Hopper" }));
		await user.click(screen.getByRole("button", { name: "Remove Developer from Grace Hopper" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("grace needs one role");
	});

	it("turns Edit off without project.settings, with the reason", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		mountApp("/crew/rights");
		const edit = await screen.findByRole("button", { name: "Edit" });
		await waitFor(() => expect(edit).toBeDisabled());
		expect(edit).toHaveAccessibleDescription(
			"Needs the right project.settings (your role: Developer)",
		);
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
		mountApp("/crew/rights");
		expect(await screen.findByText("You are not in the team file")).toBeInTheDocument();
		const form = within(await screen.findByRole("form", { name: "Ask to join" }));
		await user.type(form.getByRole("textbox", { name: "Name" }), "Zed Nobody");
		await user.type(form.getByRole("textbox", { name: "E-mails" }), "zed@example.com");
		await user.click(form.getByRole("button", { name: "Send the request" }));
		expect(await form.findByText("git push origin shipyard/join-zed")).toBeInTheDocument();
		expect(form.getByRole("button", { name: "Copied" })).toBeInTheDocument();
		expect(
			joinEntry({ name: "Zed Nobody", email: "zed@example.com", account: "", role: "qa" }),
		).toContain("role: viewer");
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
		mountApp("/crew/rights");
		const panel = within(
			await screen.findByRole("region", {
				name: "Move the roles of this machine to the team file",
			}),
		);
		expect(panel.getByText("eve@example.com")).toBeInTheDocument();
		expect(panel.getByText(/code\/terminal hidden/)).toBeInTheDocument();
		await user.click(panel.getByRole("button", { name: "Move the roles" }));
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
		mountApp("/crew/rights");
		const log = within(await screen.findByRole("table", { name: "Audit" }));
		expect(log.getByText("work_transition")).toBeInTheDocument();
		expect(log.getByText("refused")).toBeInTheDocument();
	});
});
