import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, type RightsPerson_Serialize, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const accessOf = (l: string) => ({
	...Object.fromEntries(
		["work", "specs", "design", "knowledge", "code", "runs", "settings", "costs"].map((a, i) => [
			a,
			l[i] === "N" ? "none" : "read",
		]),
	),
	merge: false,
	approve: false,
});

const person = (role: RightsPerson_Serialize["role"], rights: RightsPerson_Serialize["rights"]) => {
	mockState().person = {
		member: "eve",
		found: "email",
		role,
		admin: false,
		readOnly: false,
		rights,
	};
};

describe("Home / Today role panels (team-rights REQ-012)", () => {
	it("lists the ready tickets for a PO, with a link to the backlog", async () => {
		await withTracker();
		await importAll();
		person("po", ["work.edit"]);
		const todo = (await unwrap(commands.syncItems({}))).filter((i) => i.category === "todo");
		expect(todo.length).toBeGreaterThan(0);
		mountApp("/today/panels");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Today, for a product owner" }),
		).toBeInTheDocument();
		// The panel is a small card: the title, the count and Open.
		const panel = within(await screen.findByRole("region", { name: "Ready items" }));
		await waitFor(() => expect(panel.getByText(String(todo.length))).toBeInTheDocument());
		expect(panel.getByRole("link", { name: "Open Flow / List" })).toBeInTheDocument();
	});

	it("shows the spend panel only with costs.view", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("pm", ["work.edit"]);
		mountApp("/today/panels");
		await screen.findByRole("heading", { level: 1, name: "Today, for a project manager" });
		expect(screen.queryByRole("region", { name: "Spend this month" })).toBeNull();
	});

	it("shows no role panel to a solo person, with the picker on no role", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/today/panels");
		await screen.findByRole("heading", { level: 1, name: "Today" });
		expect(screen.queryByRole("region", { name: "Ready items" })).toBeNull();
		const chips = within(screen.getByRole("group", { name: "Pick a role" })).getAllByRole("button");
		expect(chips).toHaveLength(9);
		for (const chip of chips) expect(chip).toHaveAttribute("aria-pressed", "false");
	});

	it("shows the panels of the picked role in the role picker", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		person("developer", ["work.edit"]);
		const router = mountApp("/today/panels");
		const picker = within(await screen.findByRole("group", { name: "Pick a role" }));
		await waitFor(() =>
			expect(picker.getByRole("button", { name: "Developer" })).toHaveAttribute(
				"aria-pressed",
				"true",
			),
		);
		expect(await screen.findByRole("region", { name: "My tickets" })).toBeInTheDocument();
		await user.click(picker.getByRole("button", { name: "Product owner" }));
		expect(await screen.findByRole("region", { name: "Ready items" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "My tickets" })).toBeNull();
		// The address holds the choice, and the other roles show their panels as chips.
		expect(router.state.location.search).toEqual({ role: "po" });
		const others = within(screen.getByRole("region", { name: "Panels of the other roles" }));
		expect(others.getAllByText("My tickets").length).toBeGreaterThan(0);
		expect(others.queryByText("Ready items")).toBeNull();
		expect(screen.getByRole("link", { name: "All role views" })).toHaveAttribute(
			"href",
			"/setup/role-views",
		);
	});
});

describe("Role panels and area levels (app-redesign REQ-006)", () => {
	const pickDesigner = async (access: string) => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("viewer", ["work.edit"]);
		mockState().person = { ...mockState().person, access: accessOf(access) } as never;
		mountApp("/today/panels");
		await user.click(
			within(await screen.findByRole("group", { name: "Pick a role" })).getByRole("button", {
				name: "Designer",
			}),
		);
	};
	it("shows the panel of an area that the person can read", async () => {
		await pickDesigner("RRRRRRRR");
		expect(await screen.findByRole("region", { name: "Screens" })).toBeInTheDocument();
	});
	it("hides the panel of an area at level none, whatever role is picked", async () => {
		await pickDesigner("RRNRRRRR");
		await screen.findByRole("region", { name: "Design questions" }).catch(() => null);
		expect(screen.queryByRole("region", { name: "Screens" })).toBeNull();
	});
});

describe("Inbox routing (team-rights REQ-014)", () => {
	it("hides an approval from a PM, shows it with Everyone and keeps its control off", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("pm", ["costs.view"]);
		mountApp("/home/today");
		// The switch shows once the role is known, so the routing is on.
		// Everyone is behind More.
		const everyone = async () => {
			await user.click(await screen.findByRole("button", { name: "More" }));
			return screen.findByRole("menuitemcheckbox", { name: "Everyone" });
		};
		await screen.findByRole("list", { name: "Needs you" });
		// The queue shows three things: "N more" shows the rest in place.
		const queue = async () => {
			const list = within(await screen.findByRole("list", { name: "Needs you" }));
			const more = list.queryByRole("button", { name: /^\d+ more$/ });
			if (more) await user.click(more);
			return list;
		};
		expect((await queue()).queryByRole("button", { name: /Post a comment on ACME-1/ })).toBeNull();
		expect(screen.queryByRole("region", { name: "Post a comment on ACME-1" })).toBeNull();
		await user.click(await everyone());
		await user.click(
			await (await queue()).findByRole("button", { name: /Post a comment on ACME-1/ }),
		);
		const on = within((await screen.findAllByRole("article"))[0] as HTMLElement);
		expect(
			await on.findByRole("heading", { level: 2, name: "Post a comment on ACME-1" }),
		).toBeVisible();
		const approve = on.getByRole("button", { name: "Approve" });
		// The box of the durable permission is off too.
		expect(on.getByRole("checkbox", { name: /Do not ask again/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(approve).toBeDisabled();
		expect(approve).toHaveAccessibleDescription(/^Your role, Project manager, cannot /);
	});
});

describe("Role views (app-redesign REQ-009)", () => {
	it("lists the roles in the order of the design, marks my view and names the start place once", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.prefsSet({ role: "developer" }));
		mountApp("/setup/role-views");
		await screen.findByRole("heading", { level: 1, name: "Role views" });
		await screen.findByRole("region", { name: "Developer" });
		const names = [...document.querySelectorAll("h2[id^=role-]")].map((h) => h.textContent);
		expect(names).toEqual([
			"Product owner",
			"Project manager",
			"Business analyst",
			"Architect",
			"Tech lead",
			"Developer",
			"Tester",
			"Designer",
			"I only look",
		]);
		expect(screen.getAllByText("My view")).toHaveLength(1);
		expect(screen.queryByText(/Flow, Flow/)).toBeNull();
		expect(screen.queryByRole("link", { name: "Today" })).toBeNull();
	});

	it("opens the old address of the page in Setup", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/today/role-views");
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/role-views"));
	});
});
