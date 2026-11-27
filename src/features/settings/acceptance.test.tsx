import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { en } from "@/lib/i18n/en";
import { commands, type Finding_Serialize, type Severity, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { openAccount } from "../shell/test-open";

const finding = (id: string, severity: Severity): Finding_Serialize => ({
	id,
	group: "refs",
	severity,
	code: "ref-broken",
	detail: id,
	source: null,
	fix: { kind: "recheck" },
});

describe("Health dot (spec:projects#REQ-013)", () => {
	afterEach(() => vi.restoreAllMocks());

	// The worst finding sets both the shape and the colour: one without the other is not enough.
	it.each([
		[[], "circle", "text-success"],
		[["info"], "ring", "text-info"],
		[["info", "warning"], "triangle", "text-warning"],
		[["warning", "error", "info"], "diamond", "text-danger"],
	] as const)("shows %j as a %s in %s", async (severities, shape, colour) => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		vi.spyOn(commands, "healthRun").mockResolvedValue({
			status: "ok",
			data: severities.map((s, i) => finding(`f${i}`, s)),
		});
		const router = mountApp("/home/today");
		const menu = await openAccount(user);
		const item = await menu.findByRole("menuitem", { name: /^Health/ });
		await waitFor(() => expect(item).toHaveTextContent(`(${severities.length})`));
		const dot = within(item).getByRole("img");
		expect(dot).toHaveAttribute("data-shape", shape);
		expect(dot).toHaveClass(colour);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

describe("Setup scopes: one place for each setting (spec:app-redesign#REQ-024)", () => {
	const ADDRESSES = {
		project: [
			"/setup/project",
			"/setup/project?page=connections",
			"/setup/project?page=tickets",
			"/setup/project?page=extensions",
			"/setup/project?page=health",
		],
		computer: ["/setup/computer", "/setup/computer?page=models", "/setup/computer?page=health"],
		me: ["/setup/me"],
	};

	it("shows no card in two scopes", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		const owner = new Map<string, string>();
		const twice: string[] = [];
		for (const [scope, paths] of Object.entries(ADDRESSES)) {
			for (const path of paths) {
				const router = mountApp(path);
				await waitFor(() => expect(router.state.status).toBe("idle"));
				// A card is a named region or a heading under the title: wait for the page to draw one.
				const main = within(await screen.findByRole("main"));
				const cards = () => [
					...main.queryAllByRole("region").map((r) => r.getAttribute("aria-label") ?? ""),
					...main
						.queryAllByRole("heading")
						.filter((h) => h.tagName !== "H1")
						.map((h) => h.textContent ?? ""),
				];
				await waitFor(() => expect(cards().length).toBeGreaterThan(0));
				await waitFor(() => expect(screen.queryAllByRole("progressbar")).toEqual([]));
				const names = [
					...new Set(
						cards()
							// A count does not make a second setting.
							.map((n) => n.replace(/\s*\(\d+\)$/, "").trim())
							.filter((n) => n && n !== en.ui.more),
					),
				];
				expect(names.length, path).toBeGreaterThan(0);
				for (const name of names) {
					const seen = owner.get(name);
					if (seen && seen !== scope) twice.push(`${name}: ${seen} and ${scope}`);
					owner.set(name, scope);
				}
				cleanup();
			}
		}
		expect(twice).toEqual([]);
	});

	it("lists each Setup page once in a search of the Ask bar", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await user.keyboard("{Control>}k{/Control}");
		await user.type(
			await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }),
			"Setup,",
		);
		const panel = within(await screen.findByRole("listbox"));
		const names = (await panel.findAllByRole("option"))
			.map((o) => o.textContent ?? "")
			.filter((n) => n.startsWith("Setup, "));
		expect(names.length).toBeGreaterThan(5);
		expect(new Set(names).size).toBe(names.length);
	});
});
