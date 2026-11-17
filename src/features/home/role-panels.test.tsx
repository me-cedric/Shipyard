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
		mountApp("/home/today");
		const panel = within(await screen.findByRole("region", { name: "Ready items" }));
		await waitFor(() =>
			expect(panel.getAllByRole("listitem")).toHaveLength(Math.min(todo.length, 5)),
		);
		expect(panel.getByRole("link", { name: "Open Flow / List" })).toBeInTheDocument();
	});

	it("shows the spend panel only with costs.view", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("pm", ["work.edit"]);
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: "Today" });
		expect(screen.queryByRole("region", { name: "Spend this month" })).toBeNull();
	});

	it("shows no role panel to a solo person, with the picker on no role", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: "Today" });
		expect(screen.queryByRole("region", { name: "Ready items" })).toBeNull();
		expect(screen.getByRole("combobox", { name: "Pick a role" })).toHaveTextContent("Pick a role");
	});

	it("shows the panels of the picked role in the role picker", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		person("developer", ["work.edit"]);
		mountApp("/home/today");
		const picker = await screen.findByRole("combobox", { name: "Pick a role" });
		await waitFor(() => expect(picker).toHaveTextContent("Developer"));
		await user.click(picker);
		await user.click(await screen.findByRole("option", { name: "Product owner" }));
		expect(await screen.findByRole("region", { name: "Ready items" })).toBeInTheDocument();
		expect(screen.queryByRole("region", { name: "My tickets" })).toBeNull();
	});
});

describe("Role panels and area levels (app-redesign REQ-006)", () => {
	const pickDesigner = async (access: string) => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("viewer", ["work.edit"]);
		mockState().person = { ...mockState().person, access: accessOf(access) } as never;
		mountApp("/home/today");
		await user.click(await screen.findByRole("combobox", { name: "Pick a role" }));
		await user.click(await screen.findByRole("option", { name: "Designer" }));
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
		const everyone = await screen.findByRole("button", { name: "Everyone" });
		const queue = () => within(screen.getByRole("list", { name: "Needs you" }));
		expect(queue().queryByRole("button", { name: /Comment on ACME-1: the question/ })).toBeNull();
		expect(screen.queryByRole("region", { name: "Post a comment on ACME-1" })).toBeNull();
		await user.click(everyone);
		await user.click(
			await within(await screen.findByRole("list", { name: "Needs you" })).findByRole("button", {
				name: /Comment on ACME-1: the question/,
			}),
		);
		const on = within((await screen.findAllByRole("article"))[0] as HTMLElement);
		expect(await on.findByText("Post a comment on ACME-1")).toBeVisible();
		const approve = on.getByRole("button", { name: "Approve" });
		// The box of the durable permission is off too.
		expect(on.getByRole("checkbox", { name: /Do not ask again/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(approve).toBeDisabled();
		expect(approve).toHaveAccessibleDescription(
			/^Needs the right .+ \(your role: Project manager\)$/,
		);
	});
});
