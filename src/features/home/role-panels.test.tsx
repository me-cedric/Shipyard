import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, type RightsPerson_Serialize, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

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
		expect(panel.getByRole("link", { name: "Work / Backlog" })).toBeInTheDocument();
	});

	it("shows the spend panel only with costs.view", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("pm", ["work.edit"]);
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: "Today" });
		expect(screen.queryByRole("region", { name: "Spend this month" })).toBeNull();
	});

	it("shows no role panel to a solo person", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: "Today" });
		expect(screen.queryByRole("region", { name: "Ready items" })).toBeNull();
	});
});

describe("Inbox routing (team-rights REQ-014)", () => {
	it("hides an approval from a PM, shows it with Everyone and keeps its control off", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		person("pm", ["costs.view"]);
		mountApp("/home/today");
		const section = await screen.findByRole("region", { name: "Needs you" });
		expect(within(section).queryByRole("region", { name: "Post a comment on ACME-1" })).toBeNull();
		await user.click(within(section).getByRole("button", { name: "Everyone" }));
		const bar = within(await screen.findByRole("region", { name: "Post a comment on ACME-1" }));
		const approve = bar.getByRole("button", { name: "Approve" });
		expect(approve).toBeDisabled();
		expect(approve).toHaveAccessibleDescription(
			/^Needs the right .+ \(your role: Project manager\)$/,
		);
	});
});
