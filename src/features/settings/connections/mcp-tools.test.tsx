import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const row = (name: string) => screen.findByRole("group", { name });

describe("Settings / Connections / MCP servers: categories, recommended set and tests", () => {
	it("adds the recommended set and groups the servers by category", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Add the recommended set" }));
		expect(await screen.findByText("Added: Context7, SonarQube")).toBeInTheDocument();
		const data = await screen.findByRole("region", { name: "Data and docs" });
		expect(await within(data).findByRole("group", { name: "Context7" })).toBeInTheDocument();
		const quality = screen.getByRole("region", { name: "Quality" });
		expect(within(quality).getByRole("group", { name: "SonarQube" })).toBeInTheDocument();
		expect(
			mockState()
				.agents.mcp.filter((s) => s.enabled)
				.map((s) => s.id),
		).toEqual(["sonarqube", "context7"]);
		expect(screen.getByRole("button", { name: "The recommended set is on" })).toBeDisabled();
	});

	it("tests one server, then all, with a clear result for each", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpEnable("context7", true));
		await unwrap(commands.mcpEnable("sonarqube", true));
		mountApp("/settings/connections");
		const ctx = await row("Context7");
		await user.click(within(ctx).getByRole("button", { name: "Test Context7" }));
		expect(await within(ctx).findByRole("status")).toHaveTextContent("Context7 works: 2 tools");

		await user.click(screen.getByRole("button", { name: "Test all" }));
		const results = await screen.findByRole("list", { name: "Test all" });
		await waitFor(() => expect(within(results).getAllByRole("listitem")).toHaveLength(2));
		expect(results).toHaveTextContent("SonarQube does not work");
		expect(results).toHaveTextContent("missing dependency: Docker");
	});

	it("filters the servers to add by category", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Connection" }));
		await user.click(screen.getByRole("combobox", { name: "Type" }));
		await user.click(await screen.findByRole("option", { name: "MCP server" }));
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(await screen.findByRole("option", { name: "Design" }));
		await user.click(screen.getByRole("combobox", { name: "Server" }));
		const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
		expect(options).toEqual(["Figma", "Custom"]);
	});
});
