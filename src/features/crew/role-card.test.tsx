import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));
const row = async (name: string) => within(await screen.findByRole("listitem", { name }));
const pressed = async (name: string, button: string) =>
	(await row(name)).getByRole("button", { name: button });

// spec:shell-setup-rights#REQ-004: Plan and estimates has No, See and Change.
describe("Crew / Rights: Plan and estimates", () => {
	it("follows the Work level of a role by default and saves a change in the block", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/rights?role=developer");
		// The default Plan level of a role is its Work level: a developer changes both.
		expect(await pressed("Plan and estimates", "Change")).toHaveAttribute("aria-pressed", "true");
		expect(mockState().work.team.roles).toBeUndefined();
		await user.click(await pressed("Plan and estimates", "See"));
		await waitFor(() =>
			expect(mockState().work.team.roles).toEqual({ developer: { plan: "read" } }),
		);
		const view = await unwrap(commands.rightsGet());
		const dev = view.roles.find((r) => r.role === "developer");
		expect(dev?.access.plan).toBe("read");
		expect(dev?.rights).not.toContain("plan.edit");
		expect(dev?.rights).toContain("work.edit");
		await idle(router);
	});

	it("lets a viewer see the plan and a person with Change edit it", async () => {
		await withTracker();
		const view = await unwrap(commands.rightsGet());
		const plan = (role: string) => view.roles.find((r) => r.role === role);
		expect(plan("viewer")?.access.plan).toBe("read");
		expect(plan("viewer")?.rights).not.toContain("plan.edit");
		expect(plan("po")?.rights).toContain("plan.edit");
	});

	it("turns the row off for a person without the Setup right, with the reason", async () => {
		await withTracker();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "developer",
			admin: false,
			readOnly: false,
			rights: ["work.edit"],
		};
		mountApp("/crew/rights?role=developer");
		const see = await pressed("Plan and estimates", "See");
		await waitFor(() => expect(see.closest("fieldset")).toBeDisabled());
	});
});

describe("Crew / Rights: Code and merge", () => {
	it("is one row: the code level and the merge switch, and a lower level takes the merge away", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/crew/rights?role=architect");
		const merge = await screen.findByRole("switch", { name: "Architect Merge" });
		expect(merge).toBeChecked();
		expect(screen.queryByRole("listitem", { name: "Merge" })).toBeNull();
		await user.click(await pressed("Code and merge", "See"));
		await waitFor(() =>
			expect(mockState().work.team.roles).toEqual({ architect: { code: "read", merge: false } }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: "Architect Merge" }).closest("fieldset"),
			).toBeDisabled(),
		);
		await idle(router);
	});
});

/** A team where `dee` is a designer, and the person of the fixture. */
function designerTeam() {
	mockState().email = "dee@acme.test";
	mockState().work.team = {
		members: [
			{
				name: "Ada Lovelace",
				handle: "ada",
				trackers: [],
				emails: ["ada@acme.test"],
				role: "techlead",
				admin: true,
				capacity: 5,
				skills: [],
				availability: { absences: [] },
			},
			{
				name: "Dee",
				handle: "dee",
				trackers: [],
				emails: ["dee@acme.test"],
				role: "designer",
				capacity: 5,
				skills: [],
				availability: { absences: [] },
			},
		],
	};
}

// spec:shell-setup-rights#REQ-011: a place that a role does not see is hidden.
describe("Crew / Rights: places of a role", () => {
	it("hides Code for the designer when the admin turns its switch off, and keeps the rights", async () => {
		const user = userEvent.setup();
		await withTracker();
		designerTeam();
		mockState().email = "ada@acme.test";
		const router = mountApp("/crew/rights?role=designer");
		await user.click(await screen.findByRole("switch", { name: "Code for Designer" }));
		await waitFor(() =>
			expect(mockState().work.team.roles).toEqual({ designer: { hide: "code" } }),
		);
		const view = await unwrap(commands.rightsGet());
		const designer = view.roles.find((r) => r.role === "designer");
		expect(designer?.hidden).toEqual(["code"]);
		// The rights of the role are the defaults: only the place is hidden.
		expect(designer?.access).toMatchObject({ code: "read", work: "write", plan: "write" });
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: "Code for Designer" })).not.toBeChecked(),
		);
		await idle(router);
	});

	it("shows each place to a designer with the default rights", async () => {
		await withTracker();
		designerTeam();
		const router = mountApp("/today");
		const nav = within(await screen.findByRole("navigation", { name: "Sidebar" }));
		expect(await nav.findByRole("link", { name: /^Code/ })).toBeInTheDocument();
		await idle(router);
	});

	it("hides the place of a role for a person with that role only", async () => {
		await withTracker();
		designerTeam();
		mockState().work.team.roles = { designer: { hide: "code,plan" } };
		const router = mountApp("/today");
		const nav = within(await screen.findByRole("navigation", { name: "Sidebar" }));
		await nav.findByRole("link", { name: /^Flow/ });
		expect(nav.queryByRole("link", { name: /^Code/ })).toBeNull();
		expect(nav.queryByRole("link", { name: /^Plan/ })).toBeNull();
		expect(nav.getByRole("link", { name: /^Today/ })).toBeInTheDocument();
		// The address of a hidden place shows the page of no access.
		await router.navigate({ to: "/code/now" });
		expect((await screen.findAllByText(/No access/)).length).toBeGreaterThan(0);
		await idle(router);
	});

	it("keeps each place for an admin and refuses a place that a role may not hide", async () => {
		await withTracker();
		designerTeam();
		mockState().email = "ada@acme.test";
		mockState().work.team.roles = { designer: { hide: "code" } };
		const mine = await unwrap(commands.rightsGet());
		expect(mine.person.hidden).toEqual([]);
		await expect(
			unwrap(
				commands.rightsRolesSave(
					[{ role: "designer", access: mine.roles[7]?.access as never, hidden: ["setup"] }],
					[],
				),
			),
		).rejects.toBeDefined();
	});
});
