import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Connections / Outside agents", () => {
	it("turns the server on with one group, applies, and refuses a low port", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		const section = await screen.findByRole("heading", { name: "Outside agents" });
		const box = section.parentElement as HTMLElement;
		expect(within(box).getByRole("img", { name: "Stopped" })).toBeInTheDocument();
		// Each tool of a group is off until its switch is on.
		await user.click(within(box).getByRole("switch", { name: "Server on" }));
		await user.click(within(box).getByRole("switch", { name: "Read files" }));
		await user.click(within(box).getByRole("button", { name: "Apply" }));
		await waitFor(() =>
			expect(mockState().doctor.gates).toMatchObject({ enabled: true, reads: true }),
		);
		expect(await within(box).findByRole("img", { name: "Running" })).toBeInTheDocument();
		const status = await unwrap(commands.mcpOutsideGet());
		expect(status.active).toEqual(["project_list_files", "project_read_file"]);
		expect(status.url).toBe("http://127.0.0.1:47821/mcp");

		await user.clear(within(box).getByRole("spinbutton", { name: "Port" }));
		await user.type(within(box).getByRole("spinbutton", { name: "Port" }), "80");
		await user.click(within(box).getByRole("button", { name: "Apply" }));
		expect(await within(box).findByRole("alert")).toHaveTextContent("1024 or more");
	});

	it("limits the tools, wires .mcp.json after the server is on, and imports a server of another tool", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/settings/connections");
		const section = await screen.findByRole("heading", { name: "Outside agents" });
		const box = section.parentElement as HTMLElement;
		expect(within(box).getByRole("button", { name: "Add to .mcp.json" })).toBeDisabled();
		await user.click(within(box).getByRole("switch", { name: "Server on" }));
		await user.click(within(box).getByRole("switch", { name: "Git" }));
		await user.click(within(box).getByRole("checkbox", { name: "git_status" }));
		await user.click(within(box).getByRole("button", { name: "Apply" }));
		await waitFor(async () =>
			expect((await unwrap(commands.mcpOutsideGet())).active).toEqual(["git_status"]),
		);
		await user.click(await within(box).findByRole("button", { name: "Add to .mcp.json" }));
		expect(await within(box).findByRole("status")).toHaveTextContent(`${DEMO_FOLDER}/.mcp.json`);
		expect(mockState().doctor.wired).toBe(true);

		await user.click(within(box).getByRole("button", { name: "Import git" }));
		await waitFor(() => expect(mockState().doctor.imported).toEqual(["git"]));
	});

	it("the token is for a running server only", async () => {
		await expect(unwrap(commands.mcpOutsideToken())).rejects.toThrow("turn the server on first");
		await expect(unwrap(commands.mcpOutsideSet({ allowedTools: ["rm"] }))).rejects.toThrow(
			"unknown tool",
		);
	});
});
