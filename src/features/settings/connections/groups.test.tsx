import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const KEY = "sk-view-secret-31";

const row = (name: string) => screen.findByRole("group", { name });

/** Opens the add form on a type. */
async function addOf(user: ReturnType<typeof userEvent.setup>, type: string) {
	await user.click(await screen.findByRole("button", { name: "Connection" }));
	await user.click(screen.getByRole("combobox", { name: "Type" }));
	await user.click(await screen.findByRole("option", { name: type }));
}

describe("Settings / Connections / Runners", () => {
	it("shows each runner as detected with its version, or missing", async () => {
		mountApp("/settings/connections");
		const claude = await row("Claude Code");
		expect(within(claude).getByRole("img", { name: "Detected" })).toBeInTheDocument();
		expect(within(claude).getByText("2.1.0")).toBeInTheDocument();
		const gemini = await row("Gemini CLI");
		expect(within(gemini).getByRole("img", { name: "Missing" })).toBeInTheDocument();
		expect(await screen.findByRole("heading", { name: "Runners (5)" })).toBeInTheDocument();
	});

	it("installs a missing runner on one click", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		const gemini = await row("Gemini CLI");
		expect(within(await row("Claude Code")).queryByRole("button", { name: /Install/ })).toBeNull();
		await user.click(within(gemini).getByRole("button", { name: "Install Gemini CLI" }));
		await waitFor(() =>
			expect(within(gemini).getByRole("img", { name: "Detected" })).toBeInTheDocument(),
		);
		expect(within(gemini).queryByRole("button", { name: /Install/ })).toBeNull();
	});
});

describe("Settings / Connections / MCP servers", () => {
	it("adds a catalogue server with a secret, starts it, stops it and never shows the secret", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await addOf(user, "MCP server");
		await user.click(screen.getByRole("combobox", { name: "Server" }));
		await user.click(await screen.findByRole("option", { name: "Figma" }));
		const token = screen.getByLabelText("Figma API token", { selector: "input" });
		expect(token).toHaveAttribute("type", "password");
		await user.type(token, KEY);
		await user.click(screen.getByRole("button", { name: "Save" }));

		const figma = await row("Figma");
		expect(await screen.findByRole("heading", { name: "MCP servers (1)" })).toBeInTheDocument();
		expect(within(figma).getByRole("img", { name: "Stopped" })).toBeInTheDocument();
		expect(mockState().secrets["figma/token"]).toBe(KEY);
		expect(document.body.textContent).not.toContain(KEY);

		await user.click(within(figma).getByRole("button", { name: "Start" }));
		await waitFor(() =>
			expect(within(figma).getByRole("img", { name: "Running" })).toBeInTheDocument(),
		);
		expect(within(figma).queryByRole("alert")).toBeNull();
		await user.click(within(figma).getByRole("button", { name: "Stop" }));
		await waitFor(() =>
			expect(within(figma).getByRole("img", { name: "Stopped" })).toBeInTheDocument(),
		);
		// The saved secret shows as a mask, never as a value.
		await user.click(within(figma).getByRole("button", { name: "Edit" }));
		const saved = screen.getByLabelText("Figma API token", { selector: "input" });
		expect(saved).toHaveValue("");
		expect(saved).toHaveAttribute("placeholder", "••••••••");
	});

	it("names a missing dependency, keeps the server from starting and installs it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpEnable("sonarqube", true));
		mountApp("/settings/connections");
		const sonar = await row("SonarQube");
		expect(within(sonar).getByText("Missing: Docker")).toBeInTheDocument();
		expect(within(sonar).getByRole("button", { name: "Start" })).toBeDisabled();
		await user.click(within(sonar).getByRole("button", { name: "Install Docker" }));
		await waitFor(() => expect(within(sonar).getByRole("button", { name: "Start" })).toBeEnabled());
		expect(within(sonar).queryByText("Missing: Docker")).toBeNull();
	});

	it("starts every server that can start with Start all", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpSetField("figma", "token", KEY));
		await unwrap(commands.mcpEnable("figma", true));
		await unwrap(commands.mcpEnable("sonarqube", true));
		mountApp("/settings/connections");
		await user.click(await screen.findByRole("button", { name: "Start all" }));
		const figma = await row("Figma");
		await waitFor(() =>
			expect(within(figma).getByRole("img", { name: "Running" })).toBeInTheDocument(),
		);
		// SonarQube lacks Docker: it stays stopped.
		expect(
			within(await row("SonarQube")).getByRole("img", { name: "Stopped" }),
		).toBeInTheDocument();
	});

	it("adds a custom server and names the missing command", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await addOf(user, "MCP server");
		await user.click(screen.getByRole("combobox", { name: "Server" }));
		await user.click(await screen.findByRole("option", { name: "Custom" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Ghost");
		await user.type(screen.getByRole("textbox", { name: "Command or address" }), "ghost-tool");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const ghost = await row("Ghost");
		expect(within(ghost).getByText("Custom")).toBeInTheDocument();
		expect(within(ghost).getByText("Missing: ghost-tool")).toBeInTheDocument();
	});

	it("removes a server with a confirm step", async () => {
		const user = userEvent.setup();
		await unwrap(commands.mcpEnable("figma", true));
		mountApp("/settings/connections");
		const figma = await row("Figma");
		await user.click(within(figma).getByRole("button", { name: "Remove" }));
		await user.click(within(figma).getByRole("button", { name: "Cancel" }));
		expect(mockState().agents.mcp.find((s) => s.id === "figma")?.enabled).toBe(true);
		await user.click(within(figma).getByRole("button", { name: "Remove" }));
		await user.click(within(figma).getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(screen.queryByRole("group", { name: "Figma" })).toBeNull());
	});
});

describe("Settings / Connections / Model providers", () => {
	it("adds a provider with a key, tests it, lists its models and removes it", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await addOf(user, "Model provider");
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Local LM");
		await user.type(screen.getByRole("textbox", { name: "Address" }), "http://localhost:1234/v1");
		await user.type(screen.getByRole("textbox", { name: "Model" }), "qwen");
		await user.type(screen.getByLabelText("Secret", { selector: "input" }), KEY);
		await user.click(screen.getByRole("button", { name: "Save" }));

		const lm = await row("Local LM");
		expect(await screen.findByRole("heading", { name: "Model providers (1)" })).toBeInTheDocument();
		expect(mockState().secrets["provider-local-lm"]).toBe(KEY);
		expect(document.body.textContent).not.toContain(KEY);

		await user.click(within(lm).getByRole("button", { name: "Test" }));
		expect(await within(lm).findByRole("status")).toHaveTextContent("Passed: Local LM");

		await user.click(within(lm).getByRole("button", { name: "Models" }));
		await user.click(await within(lm).findByRole("button", { name: "Use llama-3" }));
		await waitFor(() =>
			expect(within(lm).getByRole("button", { name: "Use llama-3" })).toBeDisabled(),
		);
		expect(mockState().agents.providers[0]?.model).toBe("llama-3");

		await user.click(within(lm).getByRole("button", { name: "Remove" }));
		await user.click(within(lm).getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(screen.queryByRole("group", { name: "Local LM" })).toBeNull());
		expect(mockState().secrets["provider-local-lm"]).toBeUndefined();
	});

	it("names a bad address and keeps the form", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await addOf(user, "Model provider");
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Remote");
		await user.type(screen.getByRole("textbox", { name: "Address" }), "http://example.com/v1");
		await user.type(screen.getByRole("textbox", { name: "Model" }), "qwen");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Use an https address");
		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Remote");
	});
});

describe("Settings / Connections groups in French", () => {
	it("reads French", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await unwrap(commands.mcpEnable("figma", true));
		mountApp("/settings/connections");
		expect(await screen.findByRole("heading", { name: "Serveurs MCP (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Exécuteurs (5)" })).toBeInTheDocument();
		const figma = await row("Figma");
		expect(within(figma).getByRole("img", { name: "Arrêté" })).toBeInTheDocument();
		expect(within(figma).getByRole("button", { name: "Démarrer" })).toBeInTheDocument();
		expect(
			within(await row("Claude Code")).getByRole("img", { name: "Détecté" }),
		).toBeInTheDocument();
	});
});
