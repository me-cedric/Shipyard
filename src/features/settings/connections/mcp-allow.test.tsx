import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const tools = () => mockState().agents.mcp.find((s) => s.id === "context7")?.tools;

describe("Settings / Connections / MCP servers: allow list", () => {
	it("limits the tools of one server with a preset or a pick", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpEnable("context7", true));
		mountApp("/settings/connections");
		const ctx = await screen.findByRole("group", { name: "Context7" });
		const select = within(ctx).getByRole("combobox", { name: "Allow list: Context7" });
		expect(tools()).toEqual({ kind: "all" });

		await user.click(select);
		await user.click(await screen.findByRole("option", { name: "Custom" }));
		await waitFor(() =>
			expect(tools()).toEqual({ kind: "only", tools: ["resolve-library-id", "get-library-docs"] }),
		);
		await user.click(await within(ctx).findByRole("checkbox", { name: "get-library-docs" }));
		await waitFor(() => expect(tools()).toEqual({ kind: "only", tools: ["resolve-library-id"] }));
		expect(within(ctx).getByRole("checkbox", { name: "get-library-docs" })).not.toBeChecked();

		await user.click(select);
		await user.click(await screen.findByRole("option", { name: "Read only" }));
		await waitFor(() => expect(tools()).toEqual({ kind: "readOnly" }));
		expect(within(ctx).queryByRole("checkbox")).not.toBeInTheDocument();
	});

	it("shows a tool that is off after a reload, so it can be ticked again", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpEnable("context7", true));
		await unwrap(commands.mcpSetTools("context7", { kind: "only", tools: ["resolve-library-id"] }));
		mountApp("/settings/connections");
		const ctx = await screen.findByRole("group", { name: "Context7" });
		const off = await within(ctx).findByRole("checkbox", { name: "get-library-docs" });
		expect(off).not.toBeChecked();
		await user.click(off);
		await waitFor(() =>
			expect(tools()).toEqual({ kind: "only", tools: ["resolve-library-id", "get-library-docs"] }),
		);
	});

	it("reads the tool list once per app session, not on each open of Settings", async () => {
		await unwrap(commands.mcpEnable("context7", true));
		await unwrap(commands.mcpSetTools("context7", { kind: "only", tools: ["resolve-library-id"] }));
		const spy = vi.spyOn(commands, "mcpTest");
		const router = mountApp("/settings/connections");
		const ctx = await screen.findByRole("group", { name: "Context7" });
		await within(ctx).findByRole("checkbox", { name: "get-library-docs" });
		await router.navigate({ to: "/home/inbox" });
		await router.navigate({ to: "/settings/connections" });
		const again = await screen.findByRole("group", { name: "Context7" });
		expect(
			await within(again).findByRole("checkbox", { name: "get-library-docs" }),
		).toBeInTheDocument();
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it("shows the error when the tool list does not load", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpEnable("context7", true));
		const spy = vi.spyOn(commands, "mcpTest").mockRejectedValue(new Error("no answer"));
		mountApp("/settings/connections");
		const ctx = await screen.findByRole("group", { name: "Context7" });
		await user.click(within(ctx).getByRole("combobox", { name: "Allow list: Context7" }));
		await user.click(await screen.findByRole("option", { name: "Custom" }));
		expect(await within(ctx).findByRole("alert")).toBeInTheDocument();
		expect(tools()).toEqual({ kind: "all" });
		spy.mockRestore();
	});
});
