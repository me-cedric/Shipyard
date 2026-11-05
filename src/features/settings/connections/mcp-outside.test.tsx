import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errorMessages } from "@/lib/i18n/errors";
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

	it("limits the tools with a preset or a pick, and imports a server of another tool", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/settings/connections");
		const section = await screen.findByRole("heading", { name: "Outside agents" });
		const box = section.parentElement as HTMLElement;
		await user.click(within(box).getByRole("switch", { name: "Server on" }));
		await user.click(within(box).getByRole("switch", { name: "Git" }));
		await user.click(within(box).getByRole("checkbox", { name: "git_status" }));
		await user.click(within(box).getByRole("button", { name: "Apply" }));
		await waitFor(async () =>
			expect((await unwrap(commands.mcpOutsideGet())).active).toEqual(["git_status"]),
		);
		// The read only preset keeps the tools that change nothing.
		await user.click(within(box).getByRole("combobox", { name: "Allow list" }));
		await user.click(await screen.findByRole("option", { name: "Read only" }));
		await user.click(within(box).getByRole("button", { name: "Apply" }));
		await waitFor(async () =>
			expect((await unwrap(commands.mcpOutsideGet())).gates.allowedTools).toContain("git_log"),
		);
		expect(within(box).getByRole("checkbox", { name: "project_write_file" })).not.toBeChecked();
		expect(within(box).getByRole("checkbox", { name: "git_log" })).toBeChecked();
		await user.click(within(box).getByRole("button", { name: "Import git" }));
		await waitFor(() => expect(mockState().doctor.imported).toEqual(["git"]));
	});

	it("lists the agent tools, reviews the file before it writes, and marks a wired one out of date after a new port", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/settings/connections");
		const section = await screen.findByRole("heading", { name: "Agent tools" });
		const box = section.parentElement as HTMLElement;
		// Gemini is not installed: it does not show.
		expect(await within(box).findAllByText("Not wired")).toHaveLength(3);
		expect(within(box).queryByText("Gemini")).toBeNull();
		await user.click(within(box).getByRole("button", { name: "Wire Claude Code" }));
		const review = await within(box).findByRole("region", { name: /Review of .*\.mcp\.json/ });
		expect(review).toHaveTextContent('+ "shipyard": "http://127.0.0.1:47821/mcp"');
		// Nothing is written before the person accepts.
		expect(mockState().doctor.wired).toEqual({});
		await user.click(within(review).getByRole("button", { name: "Write the file" }));
		expect(await within(box).findByRole("status")).toHaveTextContent(`${DEMO_FOLDER}/.mcp.json`);
		expect(mockState().doctor.wired).toEqual({ claude: "http://127.0.0.1:47821/mcp" });
		expect(within(box).getByText("Wired")).toBeInTheDocument();

		// The server settings change: the wired file is out of date, and one click updates it.
		const outside = (await screen.findByRole("heading", { name: "Outside agents" }))
			.parentElement as HTMLElement;
		await user.clear(within(outside).getByRole("spinbutton", { name: "Port" }));
		await user.type(within(outside).getByRole("spinbutton", { name: "Port" }), "50000");
		await user.click(within(outside).getByRole("button", { name: "Apply" }));
		expect(await within(box).findByText("Out of date")).toBeInTheDocument();
		await user.click(within(box).getByRole("button", { name: "Update Claude Code" }));
		const again = await within(box).findByRole("region", { name: /Review of/ });
		expect(again).toHaveTextContent('- "shipyard": "http://127.0.0.1:47821/mcp"');
		await user.click(within(again).getByRole("button", { name: "Write the file" }));
		await waitFor(() => expect(within(box).getByText("Wired")).toBeInTheDocument());
		expect(mockState().doctor.wired.claude).toBe("http://127.0.0.1:50000/mcp");
	});

	it("the token is for a running server only", async () => {
		await expect(unwrap(commands.mcpOutsideToken())).rejects.toThrow(errorMessages.en.server_off);
		await expect(unwrap(commands.mcpOutsideSet({ allowedTools: ["rm"] }))).rejects.toThrow(
			errorMessages.en.not_found,
		);
	});
});
