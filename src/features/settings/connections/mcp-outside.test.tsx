import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { errorMessages } from "@/lib/i18n/errors";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Connections / Outside agents", () => {
	it("turns the server on with one group, applies, and refuses a low port", async () => {
		const user = userEvent.setup();
		mountApp("/setup/computer?page=share");
		const box = within(await screen.findByRole("region", { name: "Address of Shipyard" }));
		const all = within(screen.getByRole("main"));
		expect(all.getByText("Stopped")).toBeInTheDocument();
		// The server switch is under More of the card of what the tools may use.
		expect(box.queryByRole("switch")).toBeNull();
		// Each tool of a group is off until its switch is on.
		await user.click(all.getByRole("switch", { name: "Server on" }));
		await user.click(all.getByRole("button", { name: "Read files" }));
		await user.click(all.getByRole("button", { name: "Apply" }));
		await waitFor(() =>
			expect(mockState().doctor.gates).toMatchObject({ enabled: true, reads: true }),
		);
		expect(await all.findByText("Running")).toBeInTheDocument();
		const status = await unwrap(commands.mcpOutsideGet());
		expect(status.active).toEqual(["project_list_files", "project_read_file"]);
		expect(status.url).toBe("http://127.0.0.1:47821/mcp");

		await user.clear(all.getByRole("spinbutton", { name: "Port" }));
		await user.type(all.getByRole("spinbutton", { name: "Port" }), "80");
		await user.click(all.getByRole("button", { name: "Apply" }));
		expect(await all.findByRole("alert")).toHaveTextContent("1024 or more");
	});

	it("limits the tools with a preset or a pick, and imports a server of another tool", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/setup/computer?page=share");
		const box = within(await screen.findByRole("main"));
		await user.click(await box.findByRole("switch", { name: "Server on" }));
		await user.click(box.getByRole("button", { name: "Git" }));
		await user.click(box.getByRole("checkbox", { name: "git_status" }));
		await user.click(box.getByRole("button", { name: "Apply" }));
		await waitFor(async () =>
			expect((await unwrap(commands.mcpOutsideGet())).active).toEqual(["git_status"]),
		);
		// The read only preset keeps the tools that change nothing.
		await user.click(box.getByRole("combobox", { name: "Allowed tools" }));
		await user.click(await screen.findByRole("option", { name: "Read only" }));
		await user.click(box.getByRole("button", { name: "Apply" }));
		await waitFor(async () =>
			expect((await unwrap(commands.mcpOutsideGet())).gates.allowedTools).toContain("git_log"),
		);
		expect(box.getByRole("checkbox", { name: "project_write_file" })).not.toBeChecked();
		expect(box.getByRole("checkbox", { name: "git_log" })).toBeChecked();
		await user.click(box.getByRole("button", { name: "Import git" }));
		await waitFor(() => expect(mockState().doctor.imported).toEqual(["git"]));
	});

	it("lists the agent tools, reviews the file before it writes, and marks a wired one out of date after a new port", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mountApp("/setup/computer?page=share");
		const box = within(
			await screen.findByRole("region", { name: "AI tools that can use Shipyard" }),
		);
		// Gemini is not installed: it does not show.
		expect(await box.findAllByText("Not wired")).toHaveLength(3);
		expect(box.queryByText("Gemini")).toBeNull();
		await user.click(box.getByRole("button", { name: "Connect Claude Code" }));
		const review = await box.findByRole("region", { name: /Review of .*\.mcp\.json/ });
		expect(review).toHaveTextContent('+ "shipyard": "http://127.0.0.1:47821/mcp"');
		// Nothing is written before the person accepts.
		expect(mockState().doctor.wired).toEqual({});
		await user.click(within(review).getByRole("button", { name: "Write the file" }));
		expect(await box.findByRole("status")).toHaveTextContent(`${DEMO_FOLDER}/.mcp.json`);
		expect(mockState().doctor.wired).toEqual({ claude: "http://127.0.0.1:47821/mcp" });
		expect(box.getByText("Connected")).toBeInTheDocument();

		// The server settings change: the wired file is out of date, and one click updates it.
		const outside = within(screen.getByRole("main"));
		await user.clear(outside.getByRole("spinbutton", { name: "Port" }));
		await user.type(outside.getByRole("spinbutton", { name: "Port" }), "50000");
		await user.click(outside.getByRole("button", { name: "Apply" }));
		expect(await box.findByText("Out of date")).toBeInTheDocument();
		await user.click(box.getByRole("button", { name: "Update Claude Code" }));
		const again = await box.findByRole("region", { name: /Review of/ });
		expect(again).toHaveTextContent('- "shipyard": "http://127.0.0.1:47821/mcp"');
		await user.click(within(again).getByRole("button", { name: "Write the file" }));
		await waitFor(() => expect(box.getByText("Connected")).toBeInTheDocument());
		expect(mockState().doctor.wired.claude).toBe("http://127.0.0.1:50000/mcp");
	});

	it("the token is for a running server only", async () => {
		await expect(unwrap(commands.mcpOutsideToken())).rejects.toThrow(errorMessages.en.server_off);
		await expect(unwrap(commands.mcpOutsideSet({ allowedTools: ["rm"] }))).rejects.toThrow(
			errorMessages.en.not_found,
		);
	});
});
