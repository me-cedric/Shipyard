import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { PLUGIN_PATH } from "@/lib/ipc/mock-extensions";
import { mountTab } from "./harness";

describe("Settings / Agents and rules: own rules and policy packs", () => {
	it("imports a rules file as a pattern and removes the entry", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.type(
			await screen.findByRole("textbox", { name: "Rules file path" }),
			"/mock/rules/team-rules.md",
		);
		await user.click(screen.getByRole("button", { name: "Import" }));
		expect(await screen.findByText("Imported pattern:team-rules")).toBeInTheDocument();
		expect(await screen.findByRole("heading", { name: "Patterns (2)" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Remove team-rules" }));
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: "Patterns (1)" })).toBeVisible(),
		);
	});

	it("shows the reason when the rules file is refused", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.type(await screen.findByRole("textbox", { name: "Rules file path" }), "/mock/a.exe");
		await user.click(screen.getByRole("button", { name: "Import" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(".md or .txt");
	});

	it("sends a current skill back to absent with Remove", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.click(await screen.findByRole("button", { name: "Remove review" }));
		await waitFor(() =>
			expect(mockState().extensions.entries.find((e) => e.id === "review")?.state).toBe("absent"),
		);
		// A guide has no Remove.
		expect(screen.queryByRole("button", { name: "Remove delivery" })).toBeNull();
	});

	it("applies a policy pack, and a second pack replaces the first", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.click(await screen.findByRole("button", { name: "Apply solo-dev" }));
		expect(await screen.findByText(".agents/policy.json")).toBeInTheDocument();
		const packs = within(await screen.findByRole("region", { name: "Policy packs" }));
		await packs.findByText("Applied");
		await user.click(packs.getByRole("button", { name: "Apply strict-enterprise" }));
		await waitFor(() => expect(mockState().extensions.policy).toBe("strict-enterprise"));
		expect(await packs.findByRole("button", { name: "Apply solo-dev" })).toBeVisible();
	});
});

describe("Settings / Extensions: undeploy, plugins and child projects", () => {
	it("undeploys a deployed component from the inspector", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.click(await screen.findByRole("button", { name: "scan" }));
		const panel = await screen.findByRole("complementary", { name: "scan" });
		await user.click(await within(panel).findByRole("button", { name: "Undeploy" }));
		await waitFor(() =>
			expect(mockState().extensions.catalog.find((c) => c.name === "scan")?.state).toBe("absent"),
		);
		expect(await within(panel).findByRole("heading", { name: "Removed (0)" })).toBeVisible();
		// A component that is not deployed has no Undeploy.
		await waitFor(() =>
			expect(within(panel).queryByRole("button", { name: "Undeploy" })).toBeNull(),
		);
	});

	it("lists an applied plugin, switches it off and removes it", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(
			await screen.findByRole("textbox", { name: "Plugin archive path" }),
			PLUGIN_PATH,
		);
		await user.click(screen.getByRole("button", { name: "Review" }));
		await user.click(await screen.findByRole("button", { name: "Apply plugin (4)" }));
		expect(await screen.findByRole("heading", { name: "Installed plugins (1)" })).toBeVisible();
		const toggle = await screen.findByRole("switch", { name: "Enable team-kit" });
		expect(toggle).toBeChecked();
		await user.click(toggle);
		await waitFor(() => expect(mockState().extensions.installed[0]?.enabled).toBe(false));
		await user.click(screen.getByRole("button", { name: "Remove team-kit" }));
		await waitFor(() => expect(mockState().extensions.installed).toEqual([]));
		expect(await screen.findByRole("heading", { name: "Installed plugins (0)" })).toBeVisible();
	});

	it("removes a child project and keeps the others", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.click(await screen.findByRole("button", { name: "Remove API gateway" }));
		await waitFor(() => expect(mockState().extensions.children).toEqual([]));
		expect(await screen.findByRole("heading", { name: "Child projects (0)" })).toBeVisible();
	});
});
