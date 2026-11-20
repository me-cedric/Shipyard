import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { libraryPath, sectionAt } from "../places";

type Result = "ok" | "confusing" | "dead end" | "error";
const OUT = resolve(process.env.PERSONAS_OUT ?? "test-results/personas");
const WAIT = 4_000;

export type Role = { key: string; label: string };

/** One profile in the browser build: clicks and keys are counted, each step logs a line and a screenshot. */
export class Walk {
	private n = 0;
	private clicks = 0;
	private keys = 0;
	private problem: { result: Result; note: string } | null = null;
	readonly errors: string[] = [];

	constructor(
		readonly page: Page,
		readonly role: Role,
	) {
		rmSync(`${OUT}/${role.key}`, { recursive: true, force: true });
		mkdirSync(`${OUT}/${role.key}`, { recursive: true });
		writeFileSync(`${OUT}/${role.key}.log`, "");
		page.on("pageerror", (e) => this.errors.push(e.message));
		page.on("console", (m) => m.type() === "error" && this.errors.push(m.text()));
	}

	click = async (target: Locator) => {
		await target.first().click({ timeout: WAIT });
		this.clicks++;
	};

	fill = async (target: Locator, text: string) => {
		await target.first().fill(text, { timeout: WAIT });
		this.clicks++;
	};

	key = async (key: string) => {
		await this.page.keyboard.press(key);
		this.keys++;
	};

	/** A gap in the app: the soft assertion fails the test at the end and the step reads "dead end". */
	see = async (target: Locator, finding: string) => {
		const before = test.info().errors.length;
		await expect.soft(target.first(), finding).toBeVisible({ timeout: WAIT });
		if (test.info().errors.length > before) this.flag("dead end", finding);
	};

	/** A gap in the app: the value that the person expects does not arrive. */
	until = async (value: () => Promise<unknown>, expected: unknown, finding: string) => {
		const before = test.info().errors.length;
		await expect.soft.poll(value, { message: finding, timeout: WAIT }).toBe(expected);
		if (test.info().errors.length > before) this.flag("dead end", finding);
	};

	/** The step works, but the person has to guess. */
	confusing = (note: string) => this.flag("confusing", note);

	private flag(result: Result, note: string) {
		const p = this.problem;
		if (p?.result === "dead end" && result !== "dead end") return;
		this.problem = { result, note: p?.result === result ? `${p.note}; ${note}` : note };
	}

	/** A step: the person looks for `look`, does the actions, the screenshot follows. `both` adds dark and light. */
	step = async (title: string, look: string, run: () => Promise<void>, both = false) => {
		const index = ++this.n;
		const [c0, k0, e0] = [this.clicks, this.keys, this.errors.length];
		this.problem = null;
		await test.step(`${index}. ${title}`, async () => {
			try {
				await run();
			} catch (e) {
				const lines = String(e instanceof Error ? e.message : e).split("\n");
				const note = [lines[0], lines.find((l) => l.includes("waiting for"))?.trim()]
					.filter(Boolean)
					.join(" ");
				this.flag("dead end", note);
				expect.soft(false, `${title}: ${note}`).toBe(true);
				await this.page.keyboard.press("Escape");
			}
		});
		if (this.errors.length > e0 && !this.problem) {
			this.flag("error", this.errors[e0] ?? "");
		}
		await this.page.waitForTimeout(600); // page motion settles
		const slug = `${String(index).padStart(2, "0")}-${title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")}`;
		const dir = `${OUT}/${this.role.key}`;
		if (both) {
			for (const scheme of ["dark", "light"] as const) {
				await this.page.emulateMedia({ colorScheme: scheme });
				await this.page.waitForTimeout(500);
				await this.page.screenshot({ path: `${dir}/${slug}-${scheme}.png` });
			}
		} else {
			await this.page.screenshot({ path: `${dir}/${slug}.png` });
		}
		const p = this.problem as { result: Result; note: string } | null;
		const parts = [
			`${String(index).padStart(2, "0")} ${title}`,
			`clicks ${this.clicks - c0}, keys ${this.keys - k0}`,
			`look: ${look}`,
			`result: ${p?.result ?? "ok"}${p ? ` (${p.note})` : ""}`,
			`shot: ${slug}${both ? "-dark/-light" : ""}.png`,
		];
		appendFileSync(`${OUT}/${this.role.key}.log`, `${parts.join(" | ")}\n`);
	};

	/** The Ask bar with the keyboard only: Ctrl+K, the name, the arrow, Enter. The guide says it finds pages, items and actions. */
	palette = async (query: string, finding: string) => {
		await this.key("ControlOrMeta+k");
		await this.page.keyboard.type(query);
		this.keys += query.length;
		const none = this.page.getByRole("listbox").getByText("No result");
		await this.until(() => none.count(), 0, finding);
		if (await none.count()) return this.key("Escape");
		await this.key("ArrowDown");
		await this.key("Enter");
	};

	/** The sidebar link, then the tab: what a person clicks to reach a page. */
	go = async (space: string, tab?: string) => {
		if (space === "Library" && tab) return this.library(tab);
		await this.click(
			this.page.getByRole("navigation", { name: "Sidebar" }).getByRole("link", { name: space }),
		);
		if (tab) {
			await this.click(
				this.page
					.getByRole("navigation", { name: "Tabs" })
					.getByRole("link", { name: tab, exact: true }),
			);
		}
	};

	/** A page of Library: the doors, then the chip of the page. A page of Library goes back by its link "Library". */
	private library = async (tab: string) => {
		const main = this.page.getByRole("main");
		const back = main.getByRole("link", { name: "Library", exact: true });
		// A chip can carry a count ("3 open questions"): it is found by its address.
		const chip = main.locator(`a[href="${libraryPath(tab)}"]`).first();
		const inside = () => new URL(this.page.url()).pathname.startsWith("/library/");
		if (!inside()) {
			await this.click(
				this.page
					.getByRole("navigation", { name: "Sidebar" })
					.getByRole("link", { name: "Library" }),
			);
			await expect.poll(inside, { timeout: WAIT }).toBe(true);
			await chip.or(back).first().waitFor({ timeout: WAIT });
		}
		// The role opened on a page of Library, or the person is on one: the back link shows the doors.
		if (!this.page.url().endsWith("/library/home")) await this.click(back);
		await this.click(chip);
	};

	/** First run, a bare page: pick the role tile, open the demo folder. The app picks the page. */
	start = async () => {
		await this.page.goto("/");
		await this.step(
			"First screen",
			"the first question: one tile for each role",
			async () => {
				await this.see(
					this.page.getByRole("heading", { level: 1, name: "What is your job?" }),
					"no first question",
				);
			},
			true,
		);
		await this.step(
			"Pick the role and open the project",
			`the "${this.role.label}" tile, Continue, then "Open a local folder"`,
			async () => {
				await this.click(this.page.getByRole("button", { name: this.role.label, exact: true }));
				await this.click(this.page.getByRole("button", { name: "Continue" }));
				await this.click(this.page.getByRole("button", { name: "Open a local folder" }));
				// A page of Library has the back link in the place of the section switch.
				await this.see(
					this.page
						.getByRole("navigation", { name: "Tabs" })
						.getByRole("link")
						.or(this.page.getByRole("main").getByRole("link", { name: "Library", exact: true })),
					"no page after the project opened",
				);
			},
		);
	};

	/** The first tab that the role sees must match its work. A wrong landing page still works, so it is "confusing". */
	landsOn = async (space: string, tab: string) => {
		// The address names the section: a page of Library has no switch that marks it.
		const shown = sectionAt(new URL(this.page.url()).pathname);
		if (shown !== tab)
			this.confusing(
				`the role lands on "${shown}", the work of the role starts at ${space} / ${tab}`,
			);
	};
}
