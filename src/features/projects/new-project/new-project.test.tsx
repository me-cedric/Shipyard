import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const openCreator = async () => {
	const user = userEvent.setup();
	mountApp("/home/today");
	await user.click(await screen.findByRole("button", { name: "Create a project" }));
	await screen.findByDisplayValue("/mock/Projects");
	await user.type(screen.getByRole("textbox", { name: "Name" }), "Demo");
	return user;
};
const stepTo = (user: ReturnType<typeof userEvent.setup>, name: string) =>
	user.click(
		within(screen.getByRole("navigation", { name: "Steps" })).getByRole("button", { name }),
	);

describe("new project", () => {
	beforeEach(() => localStorage.removeItem("shipyard.cloneFolder"));

	it("lets Create go from the first step, and offers only the start that can run", async () => {
		const user = await openCreator();
		await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());
		await stepTo(user, "Start");
		expect(await screen.findByRole("button", { name: "Create" })).toBeEnabled();
		expect(screen.getByRole("radio", { name: "Run" })).toBeDisabled();
		expect(screen.getByRole("radio", { name: "Issues" })).toBeDisabled();
		expect(screen.getByRole("radio", { name: "Later" })).toBeChecked();
		await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(3));
		await user.click(screen.getByRole("button", { name: "docs/brief.md" }));
		expect(screen.getByRole("textbox", { name: "Text of docs/brief.md" })).toHaveDisplayValue(
			/## Scope/,
		);
	});

	it("fills the brief in the docs language until the person edits a field", async () => {
		const user = await openCreator();
		await stepTo(user, "Brief");
		const scope = screen.getByRole("textbox", { name: "Scope" });
		await waitFor(() => expect(scope).toHaveDisplayValue(/Set up the Node\.js/));
		await user.clear(scope);
		await user.type(scope, "One line");
		await user.click(screen.getByRole("combobox", { name: "Docs language" }));
		await user.click(await screen.findByRole("option", { name: "French" }));
		await waitFor(() =>
			expect(screen.getByRole("textbox", { name: "Vision" })).toHaveDisplayValue(
				/aide ses utilisateurs/,
			),
		);
		expect(scope).toHaveValue("One line");
	});

	it("creates the starter issues only after the click on Create issues", async () => {
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		const create = vi.spyOn(commands, "workItemCreate");
		const user = await openCreator();
		await stepTo(user, "Remote");
		await user.click(screen.getByRole("combobox", { name: "Issue tracker" }));
		await user.click(await screen.findByRole("option", { name: "Acme" }));
		await stepTo(user, "Start");
		await waitFor(() => expect(screen.getByRole("radio", { name: "Issues" })).toBeChecked());
		await user.click(screen.getByRole("button", { name: "Create" }));
		const first = await screen.findByRole("textbox", { name: "Issue 1" });
		expect(first).toHaveValue("Set up the Node.js project and its checks");
		expect(create).not.toHaveBeenCalled();
		expect(mockState().projects[0]).toMatchObject({ name: "Demo", path: "/mock/Projects/demo" });
		await user.click(
			screen.getByRole("button", { name: "Remove Write the getting started guide" }),
		);
		await user.click(screen.getByRole("button", { name: "Create issues" }));
		await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
		expect(await screen.findByText("3 issues created")).toBeInTheDocument();
		create.mockRestore();
	});
});
