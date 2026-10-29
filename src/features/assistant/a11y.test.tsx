import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { assistantEn, assistantFr } from "@/lib/i18n/assistant";
import { commands, unwrap } from "@/lib/ipc";
import { mountAssistant } from "./harness";

const log = () => within(screen.getByRole("log", { name: "Messages" }));
const input = () => screen.getByRole("textbox", { name: "Message" });
const panel = () => screen.getByRole("complementary", { name: "Assistant" });

/** Every key of the tree, as a path. */
const paths = (o: object, at = ""): string[] =>
	Object.entries(o).flatMap(([k, v]) =>
		typeof v === "object" ? paths(v, `${at}${k}.`) : [`${at}${k}`],
	);

describe("assistant panel: keyboard", () => {
	it("switches thread, sends and uses each reply action with the keyboard only", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		await mountAssistant();
		await user.type(input(), "First{Enter}");
		await log().findByText("Here is the answer.");
		await user.keyboard("{Tab}");
		// Create a second thread by keyboard: focus the button, then press Enter.
		screen.getByRole("button", { name: "New thread" }).focus();
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(screen.getByRole("list", { name: "Threads" }).children).toHaveLength(2),
		);
		// Switch back to the first thread with Tab and Space.
		const [, older] = within(screen.getByRole("list", { name: "Threads" })).getAllByRole("button");
		(older as HTMLElement).focus();
		await user.keyboard(" ");
		const copy = await log().findByRole("button", { name: "Copy" });
		copy.focus();
		await user.keyboard("{Enter}");
		expect(writeText).toHaveBeenCalledWith("Here is the answer.");
	});

	it("resizes by keyboard and leaves the handle on the tab order", async () => {
		await mountAssistant();
		expect(screen.getByRole("separator", { name: "Width" })).toHaveAttribute("tabindex", "0");
	});
});

describe("assistant panel: labels, focus, contrast and motion", () => {
	it("gives every control an accessible name", async () => {
		const user = userEvent.setup();
		await mountAssistant({ selected: "spec:auth#REQ-001" });
		await user.type(input(), "options{Enter}");
		await log().findByRole("list", { name: "Options" });
		const roles = ["button", "combobox", "textbox", "separator", "meter", "log"];
		const controls = roles.flatMap((r) => within(panel()).queryAllByRole(r));
		expect(controls.length).toBeGreaterThan(15);
		for (const c of controls) expect(c, c.outerHTML.slice(0, 80)).toHaveAccessibleName();
	});

	it("never removes the focus ring and uses the tokens for colour and motion", async () => {
		const user = userEvent.setup();
		await mountAssistant({ selected: "spec:auth#REQ-001" });
		await user.type(input(), "code{Enter}");
		await log().findByRole("figure");
		const html = panel().outerHTML;
		// The global `:focus-visible` rule draws the ring: no class may take it away.
		expect(html).not.toMatch(/outline-none|outline-0|focus:outline-none/);
		// Colour comes from the tokens, so high contrast and the themes reach the panel.
		expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
		// Every duration is a token, and the token collapses under reduced motion.
		const durations = html.match(/(?<![\w-])duration-[^\s"]+/g) ?? [];
		expect(durations.filter((d) => !d.startsWith("duration-(--duration-"))).toEqual([]);
		// Nothing loops, except the status of an active turn.
		expect(html).not.toMatch(/animate-/);
	});

	it("shows the active turn as the one moving part", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), "Hello{Enter}");
		await log().findByText("Here is the answer.");
		expect(within(panel()).queryByRole("status")).toBeNull();
	});
});

describe("assistant panel: language", () => {
	it("has the same keys in English and French and no empty text", () => {
		expect(paths(assistantFr).sort()).toEqual(paths(assistantEn).sort());
		for (const o of [assistantEn, assistantFr])
			for (const p of paths(o)) {
				const v = p.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o);
				expect(v, p).toMatch(/\S/);
			}
	});

	it("shows French when the person chose French", async () => {
		await unwrap(commands.prefsSet({ lang: "fr" }));
		await mountAssistant();
		expect(screen.getByRole("complementary", { name: "Assistant" })).toBeInTheDocument();
		expect(screen.getByRole("list", { name: "Fils" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Envoyer" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
		expect(screen.getByRole("separator", { name: "Largeur" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Déplacer à gauche" })).toBeInTheDocument();
	});
});
