import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const dev = {
	member: "bo",
	found: "email",
	role: "developer",
	admin: false,
	readOnly: false,
	rights: [
		"work.edit",
		"design.edit",
		"knowledge.edit",
		"code.write",
		"runs.start",
		"runs.approve",
	],
} as const;

describe("rights", () => {
	it("gives every right to a solo project", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		expect(view.person.rights).toHaveLength(10);
	});

	it("turns the save of Settings / Project off, with the right and the role", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = { ...dev, rights: [...dev.rights] };
		mountApp("/settings/project");
		await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "x");
		const save = await screen.findByRole("button", { name: "Save" });
		expect(save).toBeDisabled();
		expect(save).toHaveAccessibleDescription(
			"Needs the right project.settings (your role: Developer)",
		);
	});
});
