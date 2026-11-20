import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { specsEn, specsFr } from "@/lib/i18n/specs";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { parseRules } from "./constitution";
import { Capabilities, Constitution } from "./index";
import { renderChange, renderSpecs } from "./test-harness";

const files = () => mockState().specs.files;
const CH = "docs/openspec/changes";
const row = (name: RegExp) => screen.findByRole("button", { name });
/** The files of the change, as their page draws them. The result is the card "State of each file". */
const open = async (_user: ReturnType<typeof userEvent.setup>, id: string) => {
	await renderChange(id);
	return screen.findByRole("region", { name: "State of each file" });
};
/** The row of one file in "State of each file": its name, then its state. */
const stateOf = (card: HTMLElement, name: string) =>
	within(card).getByText(name, { selector: "span" }).parentElement;

describe("Specs / Change detail", () => {
	it("shows the status of each artifact of a change in its list", async () => {
		const user = userEvent.setup();
		// add-export has a spec and no plan (the stepper of the old card).
		const exp = await open(user, "add-export");
		expect(within(exp).getByRole("img", { name: "Spec: Draft" })).toBeInTheDocument();
		expect(within(exp).getByRole("img", { name: "Plan: Missing" })).toBeInTheDocument();
		// The files that are done, as words and as a meter.
		expect(screen.getByText("0 of 5 files done")).toBeVisible();
		expect(screen.getByRole("progressbar", { name: "0 of 5 files done" })).toBeVisible();
	});

	it("opens a file to read: a spec shows one sentence for each requirement, and Text shows the editor", async () => {
		const user = userEvent.setup();
		await renderChange("add-auth", "read");
		const files = within(screen.getByRole("group", { name: "Files of the change" }));
		expect(files.getAllByRole("button").map((b) => b.textContent)).toEqual([
			"Proposal",
			"Spec",
			"Plan",
			"Checklist",
			"Tasks",
		]);
		expect(await screen.findByRole("article", { name: "Proposal" })).toBeVisible();
		await user.click(files.getByRole("button", { name: "Spec" }));
		const spec = await screen.findByRole("article", { name: "Spec" });
		expect(await within(spec).findByText("Refresh a token")).toBeVisible();
		expect(within(spec).getByText("Expire a token")).toBeVisible();
		expect(screen.queryByRole("textbox")).toBeNull();
		const view = within(screen.getByRole("group", { name: "View" }));
		await user.click(view.getByRole("button", { name: "Text" }));
		expect(await screen.findByRole("textbox", { name: "Spec" })).toBeVisible();
		// Read hides the editor and keeps it: the text that a person typed stays.
		await user.type(screen.getByRole("textbox", { name: "Spec" }), "X");
		await user.click(view.getByRole("button", { name: "Read" }));
		expect(screen.queryByRole("textbox")).toBeNull();
		await user.click(view.getByRole("button", { name: "Text" }));
		expect((screen.getByRole("textbox", { name: "Spec" }) as HTMLTextAreaElement).value).toMatch(
			/X$/,
		);
		// Edit opens the form of the file.
		await user.click(files.getByRole("button", { name: "Proposal" }));
		await user.click(screen.getByRole("button", { name: "Edit" }));
		expect(await screen.findByRole("textbox", { name: "Why" })).toBeVisible();
	});

	it("lists each requirement that no test cites, with the way to the test plans", async () => {
		await renderChange("add-auth", "read");
		const bare = await screen.findByRole("region", { name: "With no link, 2" });
		expect(within(bare).getByText("Refresh a token")).toBeVisible();
		expect(within(bare).getAllByRole("button", { name: "Link it" })).toHaveLength(2);
	});

	it("shows a finding on the artifact that holds it, with its line", async () => {
		const user = userEvent.setup();
		const card = await open(user, "add-billing");
		await user.click(await screen.findByRole("button", { name: "Check" }));
		await waitFor(() =>
			expect(within(card).getByRole("img", { name: "Proposal: Done" })).toBeInTheDocument(),
		);
		// Only the spec holds a finding: its row counts it.
		expect(within(card).getByRole("img", { name: "Spec: Draft" })).toBeInTheDocument();
		// The count is its own badge with the exact number, in the row of the spec only.
		expect(
			within(stateOf(card, "Spec") as HTMLElement).getByText("1", { exact: true }),
		).toBeVisible();
		expect(
			within(stateOf(card, "Plan") as HTMLElement).queryByText("1", { exact: true }),
		).toBeNull();
		expect(within(card).getByRole("img", { name: "Plan: Done" })).toBeInTheDocument();
		// The name no longer holds the capability: the file itself proves it is the one of invoices.
		const switcher = within(screen.getByRole("group", { name: "Files of the change" }));
		expect(switcher.getByRole("button", { name: "Spec" })).toHaveAttribute("aria-pressed", "true");
		const text = await screen.findByRole("textbox", { name: "Spec" });
		await waitFor(() => expect((text as HTMLTextAreaElement).value).toContain("# Spec: invoices"));
		const finding = await screen.findByRole("button", { name: /REQ-002 has no scenario/ });
		expect(finding).toHaveTextContent(/Line \d+/);
		await user.click(finding);
		expect(screen.getByTestId("error-line")).toBeInTheDocument();
	});

	it("says how many problems Validate found, and says when it found none", async () => {
		const user = userEvent.setup();
		await open(user, "add-billing");
		await user.click(await screen.findByRole("button", { name: "Check" }));
		expect(await screen.findByRole("heading", { name: "Problems found, 1" })).toBeVisible();
		// The list opens on the file that holds the problem.
		expect(await screen.findByRole("button", { name: /REQ-002 has no scenario/ })).toBeVisible();
		// The author adds the missing scenario, then validates again.
		const spec = `${CH}/add-billing/specs/invoices/spec.md`;
		const f = files()[spec];
		if (!f) throw new Error("no spec");
		files()[spec] = { ...f, text: `${f.text.trimEnd()}\n\n#### Scenario: Pay\n- **THEN** paid\n` };
		await user.click(screen.getByRole("button", { name: "Check" }));
		expect(await screen.findByText("No problems found")).toBeVisible();
		expect(screen.getByText("Checked")).toBeVisible();
	});

	it("keeps text typed during a save and saves it next", async () => {
		const user = userEvent.setup();
		await open(user, "add-billing");
		const path = `${CH}/add-billing/proposal.md`;
		await user.click(await screen.findByRole("tab", { name: "Text" }));
		const box = await screen.findByRole("textbox", { name: "Proposal" });
		await waitFor(() => expect(box).toHaveValue(files()[path]?.text ?? ""));
		const real = commands.specsWrite;
		let release = () => {};
		const spy = vi.spyOn(commands, "specsWrite").mockImplementationOnce(async (...a) => {
			await new Promise<void>((r) => {
				release = r;
			});
			return real(...a);
		});
		try {
			await user.type(box, "X");
			await user.click(screen.getByRole("button", { name: "Save" }));
			await user.type(box, "Y");
			// No second save while one runs.
			expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
			release();
			await waitFor(() => expect(files()[path]?.text).toMatch(/X$/));
			await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
			expect(box).toHaveValue(`${files()[path]?.text}Y`);
			await user.click(screen.getByRole("button", { name: "Save" }));
			await waitFor(() => expect(files()[path]?.text).toMatch(/XY$/));
			expect(screen.queryByText("The file changed on disk.")).toBeNull();
		} finally {
			spy.mockRestore();
		}
	});

	it("edits and saves an artifact, and offers reload or keep mine after a change on disk", async () => {
		const user = userEvent.setup();
		await open(user, "add-billing");
		const path = `${CH}/add-billing/proposal.md`;
		await user.click(await screen.findByRole("tab", { name: "Text" }));
		const box = await screen.findByRole("textbox", { name: "Proposal" });
		await waitFor(() => expect(box).toHaveValue(files()[path]?.text ?? ""));
		await user.type(box, "X");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[path]?.text).toMatch(/X$/));
		// Another tool changes the file.
		const f = files()[path];
		if (f) files()[path] = { text: "other", stamp: "99" };
		await user.type(box, "Y");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const alert = await screen.findByText("The file changed on disk.");
		expect(alert).toBeVisible();
		expect(files()[path]?.text).toBe("other");
		await user.click(screen.getByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(files()[path]?.text).toMatch(/Y$/));
	});

	it("opens a markdown artifact in a form that saves one section and keeps the rest", async () => {
		const user = userEvent.setup();
		await open(user, "add-billing");
		const path = `${CH}/add-billing/proposal.md`;
		const before = files()[path]?.text ?? "";
		const why = await screen.findByRole("textbox", { name: "Why" });
		expect(why).toHaveValue("Invoices need totals.");
		await user.type(why, " And taxes.");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(files()[path]?.text).toBe(
				before.replace("Invoices need totals.", "Invoices need totals. And taxes."),
			),
		);
	});

	it("keeps the stamp of the open: a disk change before the edit gives the conflict", async () => {
		const user = userEvent.setup();
		await open(user, "add-billing");
		const path = `${CH}/add-billing/proposal.md`;
		await user.click(await screen.findByRole("tab", { name: "Text" }));
		const box = await screen.findByRole("textbox", { name: "Proposal" });
		await waitFor(() => expect(box).toHaveValue(files()[path]?.text ?? ""));
		files()[path] = { text: "other", stamp: "99" };
		// A focus read must not replace the stamp of the open.
		window.dispatchEvent(new Event("visibilitychange"));
		await user.type(box, "Y");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByText("The file changed on disk.")).toBeVisible();
		expect(files()[path]?.text).toBe("other");
	});

	it("links a marker to its question and shows a marker with no question as unlinked", async () => {
		const user = userEvent.setup();
		const p = `${CH}/add-export/specs/export/spec.md`;
		const f = files()[p];
		if (f) f.text += "\nA rule [NEEDS CLARIFICATION: who decides?]\n";
		await open(user, "add-export");
		const markers = await screen.findByRole("region", { name: "Open markers" });
		expect(within(markers).getByRole("heading", { name: "Open markers, 2" })).toBeInTheDocument();
		expect(within(markers).getByText("Unlinked")).toBeInTheDocument();
		await user.click(within(markers).getByRole("button", { name: /q:Q-035/ }));
		expect(screen.getByRole("status", { name: "Inspector" })).toHaveTextContent("q:Q-035");
		// "Go to it" opens the text of the spec on the line of the marker.
		await user.click(
			within(markers).getAllByRole("button", { name: "Go to it" })[0] as HTMLElement,
		);
		expect(await screen.findByRole("textbox", { name: "Spec" })).toBeVisible();
		expect(await screen.findByTestId("error-line")).toBeInTheDocument();
	});
});

describe("Library / Specs", () => {
	const list = async () => within(await screen.findByRole("group", { name: "Specs" }));

	it("shows the spec list and the open spec in one page, each requirement with its state", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Capabilities />);
		const specs = await list();
		expect(await specs.findByRole("button", { name: "auth" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(await screen.findByRole("heading", { name: "auth", level: 2 })).toBeVisible();
		const reqs = within(await screen.findByRole("list", { name: "Requirements" }));
		await waitFor(() => expect(reqs.getAllByRole("listitem")).toHaveLength(3));
		expect(await reqs.findByRole("button", { name: /Keep a session.*Tested/ })).toBeVisible();
		expect(reqs.getByRole("button", { name: /Login.*Fail/ })).toBeVisible();
		expect(reqs.getByRole("button", { name: /Sign out.*No test yet/ })).toBeVisible();
		// No requirement id on the page: the row opens the requirement.
		expect(screen.queryByText("REQ-001")).toBeNull();
		await user.click(reqs.getByRole("button", { name: /Login/ }));
		await waitFor(() =>
			expect(screen.getByRole("status", { name: "Inspector" })).toHaveTextContent(
				"spec:auth#REQ-003 test:1 wi:1",
			),
		);
		await user.click(specs.getByRole("button", { name: /billing/ }));
		expect(await screen.findByRole("heading", { name: "billing", level: 2 })).toBeVisible();
	});

	it("switches between the requirements, the text and the files of a spec (spec:app-redesign#REQ-021)", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Capabilities />);
		expect(await screen.findByRole("list", { name: "Requirements" })).toBeVisible();
		expect(screen.queryByRole("textbox", { name: "Spec" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Text" }));
		const box = await screen.findByRole("textbox", { name: "Spec" });
		await waitFor(() => expect(box).toHaveValue(files()["docs/openspec/specs/auth/spec.md"]?.text));
		expect(screen.queryByRole("list", { name: "Requirements" })).toBeNull();
		// The plan of the capability is a file of the capability.
		await user.click(screen.getByRole("button", { name: "Files" }));
		expect(await screen.findByRole("article", { name: "Spec" })).toBeVisible();
		await user.click(screen.getByRole("tab", { name: "Plan" }));
		expect(await screen.findByRole("article", { name: "Plan" })).toBeVisible();
	});

	it("has the header actions, and the reference behind More", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Capabilities />);
		expect(await screen.findByRole("button", { name: "Check against the code" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Write a spec from the code" })).toBeVisible();
		expect(screen.getByRole("button", { name: "New change" })).toBeVisible();
		await screen.findByRole("heading", { name: "auth", level: 2 });
		await user.click(screen.getByRole("button", { name: "More" }));
		expect(await screen.findByRole("menuitem", { name: "Copy the reference" })).toBeVisible();
		expect(screen.getByRole("menuitem", { name: "Copy the file name" })).toBeVisible();
	});

	it("shows the changes in progress, the linked items and the check of a spec", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Capabilities />);
		const specs = await list();
		const card = await specs.findByRole("button", { name: /export/ });
		expect(card).toHaveTextContent("1 open question");
		await user.click(card);
		const changes = within(await screen.findByRole("region", { name: "Changes in progress" }));
		expect(changes.getByRole("link")).toHaveAttribute("href", "/flow/feature/change%3Aadd-export");
		const linked = within(await screen.findByRole("region", { name: "Linked" }));
		expect(
			linked.getByRole("link", { name: /Which export formats ship first\?.*Open/ }),
		).toBeVisible();
		const check = within(screen.getByRole("region", { name: "Check the specs" }));
		expect(check.getAllByText("Not checked")).toHaveLength(2);
		await user.click(check.getByRole("button", { name: "Check" }));
		await waitFor(() => expect(check.queryByText("Not checked")).toBeNull());
	});
});

describe("Library / Project rules", () => {
	it("shows the file and saves an edit", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Constitution />);
		// The rules open as a page to read: one numbered card for each rule.
		const page = within(await screen.findByRole("article", { name: "Project rules" }));
		expect(page.getAllByRole("listitem")).toHaveLength(2);
		expect(page.getByText("The spec comes first.")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Edit" }));
		const box = await screen.findByRole("textbox", { name: "Project rules" });
		await waitFor(() =>
			expect(box).toHaveValue(files()["docs/openspec/constitution.md"]?.text ?? ""),
		);
		await user.type(box, "\n- New rule.");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(files()["docs/openspec/constitution.md"]?.text).toMatch(/New rule\.$/),
		);
		// Read shows the new rule as the third card.
		await user.click(screen.getByRole("button", { name: "Read" }));
		expect(
			within(await screen.findByRole("article", { name: "Project rules" })).getAllByRole(
				"listitem",
			),
		).toHaveLength(3);
	});

	it("opens the text at its end for a new rule", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Constitution />);
		await user.click(await screen.findByRole("button", { name: "Add a rule" }));
		const box = (await screen.findByRole("textbox", {
			name: "Project rules",
		})) as HTMLTextAreaElement;
		await waitFor(() => expect(box).toHaveFocus());
		expect(box.selectionStart).toBe(box.value.length);
	});

	it("names the roles that can change the rules, with the way to the rights", async () => {
		await renderSpecs(<Constitution />);
		const card = within(await screen.findByRole("region", { name: "Who can change the rules" }));
		expect(await card.findByText("Tech lead")).toBeVisible();
		expect(card.getAllByText("Can change").length).toBeGreaterThan(0);
		expect(card.getByRole("link", { name: "Change the rights" })).toHaveAttribute(
			"href",
			"/crew/rights",
		);
	});

	it("reads each item of a list as one rule", () => {
		expect(
			parseRules("# Rules\n\n## One\n\n1. First rule\n   goes on.\n2. Second\n\nText.\n- Third\n"),
		).toEqual(["First rule goes on.", "Second", "Third"]);
	});
});

describe("Specs strings", () => {
	it("holds the same keys in French and English", () => {
		const keys = (o: object, p = ""): string[] =>
			Object.entries(o).flatMap(([k, v]) =>
				typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`],
			);
		expect(keys(specsFr)).toEqual(keys(specsEn));
	});
});
