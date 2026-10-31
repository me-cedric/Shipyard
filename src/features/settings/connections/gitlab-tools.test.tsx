import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

async function gitlab(scopes: string[]) {
	const c = await unwrap(
		commands.connectionsAdd({
			name: "Code host",
			group: "forge",
			kind: "gitlab",
			url: "https://gitlab.com",
			user: null,
		}),
	);
	await unwrap(commands.connectionsSetSecret(c.id, "glpat-x"));
	const mock = mockState().connections.find((x) => x.id === c.id);
	if (mock) mock.scopes = scopes;
	return c.id;
}

describe("Settings / Connections: GitLab tools", () => {
	it("offers Sign in again for an older sign-in, then the switch that adds the server with no token", async () => {
		const user = userEvent.setup();
		const id = await gitlab(["api"]);
		mountApp("/settings/connections");
		const row = await screen.findByRole("group", { name: "Code host" });
		expect(within(row).queryByRole("switch", { name: "GitLab tools" })).toBeNull();
		await user.click(within(row).getByRole("button", { name: "Sign in again" }));
		const tools = await within(row).findByRole(
			"switch",
			{ name: "GitLab tools" },
			{ timeout: 5000 },
		);
		await user.click(tools);
		await waitFor(() =>
			expect(mockState().agents.mcp.find((s) => s.id === `custom-gitlab-${id}`)?.enabled).toBe(
				true,
			),
		);
		const server = mockState().agents.mcp.find((s) => s.id === `custom-gitlab-${id}`);
		expect(server?.label).toBe("GitLab Code host");
		expect(JSON.stringify(mockState().agents.mcp)).not.toContain("glpat-x");
	}, 20_000);

	it("shows the switch at once when the sign-in holds the mcp scope, and refuses it in a read-only project", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const id = await gitlab(["api", "mcp"]);
		const project = mockState().projects[0];
		if (project) project.overrides = { ...project.overrides, readOnly: true };
		mountApp("/settings/connections");
		const row = await screen.findByRole("group", { name: "Code host" });
		expect(within(row).queryByRole("button", { name: "Sign in again" })).toBeNull();
		await user.click(await within(row).findByRole("switch", { name: "GitLab tools" }));
		expect(await within(row).findByRole("alert")).toBeVisible();
		expect(mockState().agents.mcp.some((s) => s.id === `custom-gitlab-${id}`)).toBe(false);
	});
});
