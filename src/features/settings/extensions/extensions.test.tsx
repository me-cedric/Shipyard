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
		await mountTab("plugins");
		// The three catalog groups are the rule packs of the page, one toggle for each.
		for (const name of ["node", "openspec-guidance", "scan"])
			expect(await screen.findByRole("switch", { name: `Enable ${name}` })).toBeInTheDocument();
		await user.click(await screen.findByRole("button", { name: "node" }));
		const panel = await screen.findByRole("complementary", { name: "node" });
		await within(panel).findByText(".devcontainer/devcontainer.json");
		expect(mockState().extensions.files).not.toContain(".devcontainer/devcontainer.json");
		await user.click(within(panel).getByRole("button", { name: "Deploy" }));
		await waitFor(() =>
			expect(mockState().extensions.files).toContain(".devcontainer/devcontainer.json"),
		);
	});

	it("a rule-pack switch opens the file preview and writes nothing", async () => {
		const user = userEvent.setup();
		await mountTab("plugins");
		await user.click(await screen.findByRole("switch", { name: "Enable node" }));
		const panel = await screen.findByRole("complementary", { name: "node" });
		await within(panel).findByText(".devcontainer/devcontainer.json");
		expect(mockState().extensions.files).not.toContain(".devcontainer/devcontainer.json");
	});

	it("the Add tile of a rule pack opens the file preview and writes nothing", async () => {
		const user = userEvent.setup();
		const before = [...mockState().extensions.files];
		await mountTab("extensions");
		const tile = (await screen.findAllByRole("button", { name: /^Enable / }))[0] as HTMLElement;
		await user.click(tile);
		const panel = await screen.findByRole("complementary", {
			name: tile.getAttribute("aria-label")?.replace("Enable ", ""),
		});
		await within(panel).findByRole("button", { name: "Deploy" });
		expect(mockState().extensions.files).toEqual(before);
	});

	it("reviews a plugin and writes only the accepted items", async () => {
		const user = userEvent.setup();
		await mountTab("plugins");
		await user.type(
			await screen.findByRole("textbox", { name: "Plugin archive path" }),
			PLUGIN_PATH,
		);
		await user.click(screen.getByRole("button", { name: "Review" }));
		expect(await screen.findByRole("heading", { name: "Adds (4)" })).toBeInTheDocument();
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
		await mountTab("plugins");
		await user.type(
			await screen.findByRole("textbox", { name: "Plugin archive path" }),
			"/x/bad.zip",
		);
		await user.click(screen.getByRole("button", { name: "Review" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("not a valid zip archive");
	});

	it("lists the child projects with n of m, adds and clones one", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		const card = await screen.findByRole("region", { name: "Child projects" });
		await user.click(await within(card).findByRole("button", { name: "Open" }));
		const panel = await screen.findByRole("complementary", { name: "API gateway" });
		expect(await within(panel).findByText("4 of 6")).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Child project name" }), "Billing");
		await user.type(
			screen.getByRole("textbox", { name: "Repository address" }),
			"https://example.com/a/b.git",
		);
		await user.click(screen.getByRole("button", { name: "Add" }));
		await user.click(
			(await within(card).findAllByRole("button", { name: "Open" }))[1] as HTMLElement,
		);
		await user.click(await screen.findByRole("button", { name: "Clone Billing" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Clone Billing" })).toBeNull());
	});

	it("sends the parent items to the chosen child projects on a branch after a click", async () => {
		const user = userEvent.setup();
		await mountTab("plugins");
		// Every cloned child project is picked until a person picks otherwise.
		expect(await screen.findByRole("checkbox", { name: "Select API gateway" })).toBeChecked();
		await user.click(screen.getByRole("button", { name: "Deploy to 1" }));
		expect(await screen.findByText(/shipyard\/extensions-1/)).toBeInTheDocument();
		expect(mockState().extensions.children[0]?.has).toContain("pattern:small-steps");
	});
});
