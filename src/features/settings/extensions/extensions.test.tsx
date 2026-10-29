import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { PLUGIN_PATH } from "@/lib/ipc/mock-extensions";
import { mountTab } from "./harness";

const section = async (name: string) => within(await screen.findByRole("region", { name }));

describe("Settings / Agents and rules: compass", () => {
	it("shows the five lists with a count, the pinned version and the stack", async () => {
		await mountTab("agents-rules");
		for (const name of ["Skills (4)", "Packs (3)", "Guides (2)", "Patterns (1)", "Contract (1)"])
			expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
		expect(screen.getByText("Compass 1.0.1")).toBeInTheDocument();
		expect(screen.getByText("Stack react-web")).toBeInTheDocument();
		// The model tiers group stays.
		expect(await screen.findByRole("heading", { name: "Model tiers (5)" })).toBeInTheDocument();
	});

	it("shows the risk and the write capability of a skill and marks the skills that suit the stack", async () => {
		await mountTab("agents-rules");
		const skills = await section("Skills");
		await skills.findByText("Risk high");
		expect(skills.getAllByText("Writes files")).toHaveLength(3);
		expect(skills.getAllByText("Suits the stack")).toHaveLength(1);
	});

	it("searches the skills", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.type(await screen.findByRole("textbox", { name: "Search skills" }), "vuln");
		expect(await screen.findByRole("heading", { name: "Skills (1)" })).toBeInTheDocument();
	});

	it("previews a skill in the inspector and writes no file", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.click(await screen.findByRole("button", { name: "review" }));
		const panel = await screen.findByRole("complementary", { name: "review" });
		await within(panel).findByText(/The text of the skill review/);
		expect(mockState().extensions.files).toEqual(["AGENTS.md", "README.md"]);
	});

	it("applies an entry on a click and names the files that it wrote", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.click(await screen.findByRole("button", { name: "Apply renovate" }));
		expect(await screen.findByText(".agents/packs/renovate")).toBeInTheDocument();
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Apply renovate" })).not.toBeInTheDocument(),
		);
	});

	it("upgrades each stale entry, or only the selection", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		const upgrade = await screen.findByRole("button", { name: "Upgrade (2)" });
		await user.click(await screen.findByRole("checkbox", { name: "Select security" }));
		await user.click(await screen.findByRole("button", { name: "Upgrade (1)" }));
		await waitFor(() =>
			expect(
				mockState()
					.extensions.entries.map((e) => e.state)
					.filter((s) => s === "stale"),
			).toHaveLength(1),
		);
		expect(upgrade).toBeInTheDocument();
		await user.click(await screen.findByRole("button", { name: "Upgrade (1)" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Upgrade (0)" })).toBeDisabled());
	});

	it("lists the roles and the skills with who loads each", async () => {
		await mountTab("agents-rules");
		const roles = await section("Roles and skills");
		await roles.findByRole("group", { name: "worker" });
		expect(roles.getAllByText("Loaded by factory, assistant")).toHaveLength(1);
		expect(
			await screen.findByRole("heading", { name: "Roles and skills (4)" }),
		).toBeInTheDocument();
	});
});

describe("Settings / Extensions", () => {
	it("shows the three catalog groups, and a deploy shows its files first", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		for (const name of ["Dev containers (1)", "Agents (1)", "DevOps and security (1)"])
			expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
		await user.click(await screen.findByRole("button", { name: "node" }));
		const panel = await screen.findByRole("complementary", { name: "node" });
		await within(panel).findByText(".devcontainer/devcontainer.json");
		expect(mockState().extensions.files).not.toContain(".devcontainer/devcontainer.json");
		await user.click(within(panel).getByRole("button", { name: "Deploy" }));
		await waitFor(() =>
			expect(mockState().extensions.files).toContain(".devcontainer/devcontainer.json"),
		);
	});

	it("reviews a plugin and writes only the accepted items", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(
			await screen.findByRole("textbox", { name: "Plugin archive path" }),
			PLUGIN_PATH,
		);
		await user.click(screen.getByRole("button", { name: "Review" }));
		expect(await screen.findByRole("heading", { name: "New (4)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Refused (1)" })).toBeInTheDocument();
		expect(mockState().extensions.files).not.toContain("docs/team.md");
		await user.click(screen.getByRole("checkbox", { name: "Accept AGENTS.md" }));
		await user.click(screen.getByRole("button", { name: "Apply plugin (3)" }));
		await waitFor(() => expect(mockState().extensions.files).toContain("docs/team.md"));
		expect(await screen.findByText("MCP servers added: docs")).toBeInTheDocument();
		expect(mockState().extensions.plugin).toBe("1.0.0");
	});

	it("shows the reason when the archive is bad", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		await user.type(
			await screen.findByRole("textbox", { name: "Plugin archive path" }),
			"/x/bad.zip",
		);
		await user.click(screen.getByRole("button", { name: "Review" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("not a valid zip archive");
	});

	it("lists the child projects with n of m, clones, and deploys on a branch after a click", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		expect(await screen.findByRole("heading", { name: "Child projects (1)" })).toBeInTheDocument();
		expect(screen.getByText("4 of 5")).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Child project name" }), "Billing");
		await user.type(
			screen.getByRole("textbox", { name: "Repository address" }),
			"https://example.com/a/b.git",
		);
		await user.click(screen.getByRole("button", { name: "Add" }));
		await user.click(await screen.findByRole("button", { name: "Clone Billing" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Clone Billing" })).toBeNull());
		await user.click(screen.getByRole("checkbox", { name: "Select API gateway" }));
		await user.click(screen.getByRole("button", { name: "Deploy to 1" }));
		expect(await screen.findByText(/shipyard\/extensions-1/)).toBeInTheDocument();
		expect(mockState().extensions.children[0]?.has).toContain("pattern:small-steps");
	});
});
