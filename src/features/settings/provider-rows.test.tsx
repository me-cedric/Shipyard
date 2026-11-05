import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { mockState } from "@/lib/ipc/mock";
import { ProviderRows } from "./provider-rows";

const mount = () =>
	render(
		<Providers>
			<ProviderRows />
		</Providers>,
	);
const row = (name: string) => screen.findByRole("group", { name });

describe("Settings / Agents and rules: provider rows", () => {
	it("shows one row for each provider, and a local runtime that answers", async () => {
		mount();
		const router = await row("OpenRouter");
		expect(within(router).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
		for (const name of ["OpenAI", "Anthropic", "Mistral", "Google AI Studio", "Azure OpenAI"]) {
			const r = await row(name);
			expect(within(r).getByRole("button", { name: "Get a key" })).toBeInTheDocument();
			expect(within(r).getByRole("button", { name: "Paste key" })).toBeInTheDocument();
		}
		const ollama = await row("Ollama");
		expect(within(ollama).getByRole("button", { name: "Add" })).toBeInTheDocument();
	});

	it("lists no local row when nothing runs", async () => {
		mockState().agents.runtimes = [];
		mount();
		await row("OpenRouter");
		expect(screen.queryByRole("group", { name: "Ollama" })).toBeNull();
	});

	it("opens the official key page", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(within(await row("OpenAI")).getByRole("button", { name: "Get a key" }));
		await waitFor(() =>
			expect(mockState().openedPages).toContain("https://platform.openai.com/api-keys"),
		);
	});

	it("signs in to OpenRouter and keeps the key in the keychain", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(within(await row("OpenRouter")).getByRole("button", { name: "Sign in" }));
		expect(await within(await row("OpenRouter")).findByText("Ready")).toBeInTheDocument();
		const p = mockState().agents.providers.find((x) => x.name === "OpenRouter");
		expect(p?.secret).toBe(true);
		expect(mockState().secrets[p?.id ?? ""]).toBeTruthy();
	});

	it("saves a good key with the keyboard only", async () => {
		const user = userEvent.setup();
		mount();
		const openai = await row("OpenAI");
		openai.querySelector<HTMLButtonElement>("button:nth-of-type(2)")?.focus();
		await user.keyboard("{Enter}");
		await user.type(await screen.findByLabelText("OpenAI key"), "sk-good{Enter}");
		expect(await within(await row("OpenAI")).findByText("Ready")).toBeInTheDocument();
		const p = mockState().agents.providers.find((x) => x.name === "OpenAI");
		expect(mockState().secrets[p?.id ?? ""]).toBe("sk-good");
	});

	it("refuses a wrong key, shows the error and stores nothing", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(within(await row("Mistral")).getByRole("button", { name: "Paste key" }));
		await user.type(await screen.findByLabelText("Mistral key"), "bad-key");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Check the key");
		expect(mockState().agents.providers).toHaveLength(0);
		expect(mockState().secrets).toEqual({});
	});

	it("asks Azure for the address of the resource", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(within(await row("Azure OpenAI")).getByRole("button", { name: "Paste key" }));
		await user.type(await screen.findByLabelText("Azure OpenAI key"), "k1");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("address");
		await user.type(
			screen.getByLabelText("Azure OpenAI address"),
			"https://my.openai.azure.com/openai/v1",
		);
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await within(await row("Azure OpenAI")).findByText("Ready")).toBeInTheDocument();
	});

	it("adds a local runtime with no key", async () => {
		const user = userEvent.setup();
		mount();
		await user.click(within(await row("Ollama")).getByRole("button", { name: "Add" }));
		expect(await within(await row("Ollama")).findByText("Added")).toBeInTheDocument();
		const p = mockState().agents.providers[0];
		expect([p?.url, p?.secret]).toEqual(["http://127.0.0.1:11434/v1", false]);
	});

	it("shows French labels", async () => {
		mockState().prefs.lang = "fr";
		mount();
		const openai = await row("OpenAI");
		expect(within(openai).getByRole("button", { name: "Obtenir une clé" })).toBeInTheDocument();
		expect(within(openai).getByRole("button", { name: "Coller la clé" })).toBeInTheDocument();
		expect(
			within(await row("OpenRouter")).getByRole("button", { name: "Se connecter" }),
		).toBeInTheDocument();
		expect(
			within(await row("Ollama")).getByRole("button", { name: "Ajouter" }),
		).toBeInTheDocument();
	});
});
