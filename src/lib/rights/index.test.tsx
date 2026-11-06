import { renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { useRights } from ".";

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

	it("gives the level of each area and the rights that the levels allow", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().person = {
			...dev,
			rights: [...dev.rights],
			access: {
				work: "write",
				specs: "read",
				design: "write",
				knowledge: "write",
				code: "write",
				runs: "write",
				settings: "read",
				costs: "none",
				merge: false,
				approve: true,
			},
		};
		const { result } = renderHook(() => useRights(), { wrapper: Providers });
		await waitFor(() => expect(result.current?.person).toBeDefined());
		expect([result.current.level("costs"), result.current.level("specs")]).toEqual([
			"none",
			"read",
		]);
		expect([result.current.can("code.write"), result.current.can("code.merge")]).toEqual([
			true,
			false,
		]);
	});

	it("saves the table of the roles and the roles of a member, and refuses without project.settings", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const view = await unwrap(commands.rightsGet());
		const row = view.roles.find((r) => r.role === "developer");
		if (!row) throw new Error("no developer row");
		const saved = await unwrap(
			commands.rightsRolesSave(
				[{ role: "developer", access: { ...row.access, settings: "none" } }],
				[],
			),
		);
		expect(saved.roles.find((r) => r.role === "developer")?.access.settings).toBe("none");
		mockState().person = { ...dev, rights: [...dev.rights] };
		await expect(unwrap(commands.rightsRolesSave([], []))).rejects.toBeTruthy();
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
