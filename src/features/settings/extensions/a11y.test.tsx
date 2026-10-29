import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { extensionsEn, extensionsFr } from "@/lib/i18n/extensions";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountTab } from "./harness";

/** Every key of the tree, as a path. */
const paths = (o: object, at = ""): string[] =>
	Object.entries(o).flatMap(([k, v]) =>
		typeof v === "object" ? paths(v, `${at}${k}.`) : [`${at}${k}`],
	);

describe("Settings / Agents and rules and Extensions: keyboard", () => {
	it("applies an entry and picks an entry for the upgrade with the keyboard only", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		const apply = await screen.findByRole("button", { name: "Apply renovate" });
		apply.focus();
		expect(apply).toHaveFocus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(mockState().extensions.files).toContain(".agents/packs/renovate"));
		const pick = await screen.findByRole("checkbox", { name: "Select security" });
		pick.focus();
		await user.keyboard(" ");
		expect(await screen.findByRole("button", { name: "Upgrade (1)" })).toBeInTheDocument();
	});

	it("reviews a plugin and refuses an item with the keyboard only", async () => {
		const user = userEvent.setup();
		await mountTab("extensions");
		(await screen.findByRole("textbox", { name: "Plugin archive path" })).focus();
		await user.keyboard("/mock/plugins/team-kit.zip{Tab}{Enter}");
		const item = await screen.findByRole("checkbox", { name: "Accept AGENTS.md" });
		item.focus();
		await user.keyboard(" ");
		expect(item).not.toBeChecked();
		expect(await screen.findByRole("button", { name: "Apply plugin (3)" })).toBeInTheDocument();
	});
});

describe("Settings / Agents and rules and Extensions: labels, focus and motion", () => {
	it.each(["agents-rules", "extensions"] as const)(
		"gives every control of %s an accessible name",
		async (tab) => {
			await mountTab(tab);
			await screen.findByRole("heading", { name: /^(Skills|Dev containers) \(/ });
			const main = within(screen.getByRole("main"));
			const controls = ["button", "checkbox", "textbox"].flatMap((r) => main.queryAllByRole(r));
			expect(controls.length).toBeGreaterThan(5);
			for (const c of controls) expect(c, c.outerHTML.slice(0, 80)).toHaveAccessibleName();
		},
	);

	it("shows each state as a shape and a word, never the focus ring removed", async () => {
		await mountTab("agents-rules");
		const skills = within(await screen.findByRole("region", { name: "Skills" }));
		const shapes = skills.getAllByRole("img").map((i) => i.getAttribute("data-shape"));
		expect(new Set(shapes)).toEqual(new Set(["circle", "triangle", "dash"]));
		expect(skills.getAllByText("Stale")).not.toHaveLength(0);
		// The shell frame holds the page: only the markup of the view counts.
		const html = skills
			.getAllByRole("list")
			.map((l) => l.outerHTML)
			.join("");
		expect(html).not.toMatch(/outline-none|outline-0/);
		expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
	});

	it("uses no loop and only motion tokens, so reduced motion reaches both views", async () => {
		for (const tab of ["agents-rules", "extensions"] as const) {
			document.body.replaceChildren();
			await mountTab(tab);
			await screen.findByRole("heading", { name: /^(Skills|Dev containers) \(/ });
			const html =
				screen.getByRole("heading", { name: /^(Skills|Dev containers) \(/ }).closest("section")
					?.parentElement?.outerHTML ?? "";
			expect(html).toMatch(/section/);
			expect(html).not.toMatch(/animate-/);
			const durations = html.match(/(?<![\w-])duration-[^\s"]+/g) ?? [];
			expect(durations.filter((d) => !d.startsWith("duration-(--duration-"))).toEqual([]);
		}
	});
});

describe("Settings / Agents and rules and Extensions: language", () => {
	it("has the same keys in English and French and no empty text", () => {
		expect(paths(extensionsFr).sort()).toEqual(paths(extensionsEn).sort());
		for (const o of [extensionsEn, extensionsFr])
			for (const p of paths(o)) {
				const v = p.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o);
				expect(v, p).toMatch(/\S/);
			}
	});

	it("shows French when the person chose French", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await mountTab("agents-rules");
		expect(await screen.findByRole("heading", { name: "Compétences (4)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Appliquer renovate" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Rôles et compétences (4)" })).toBeInTheDocument();
	});

	it("shows French in Extensions", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await mountTab("extensions");
		expect(await screen.findByRole("heading", { name: "Projets enfants (1)" })).toBeInTheDocument();
		expect(screen.getByText("4 sur 5")).toBeInTheDocument();
		expect(
			screen.getByRole("textbox", { name: "Chemin de l'archive du plugin" }),
		).toBeInTheDocument();
	});
});
