import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { specsEn, specsFr } from "@/lib/i18n/specs";
import { mockState } from "@/lib/ipc/mock";
import { Capabilities, Constitution, SpecChanges } from "./index";
import { renderSpecs } from "./test-harness";

const files = () => mockState().specs.files;
const CH = "docs/openspec/changes";
const row = (name: RegExp) => screen.findByRole("row", { name });
const open = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
	await user.click(await row(new RegExp(id)));
	return screen.findByRole("navigation", { name: "Artifacts" });
};

describe("Specs / Changes", () => {
	it("lists each change with the status of its five artifacts and its open markers", async () => {
		await renderSpecs(<SpecChanges />);
		for (const id of ["add-auth", "add-billing", "add-export"])
			expect(await row(new RegExp(id))).toBeVisible();
		// add-export has a spec and no plan; add-billing has both.
		const exp = await row(/add-export/);
		expect(within(exp).getByRole("img", { name: "Spec: Draft" })).toBeInTheDocument();
		expect(within(exp).getByRole("img", { name: "Plan: Missing" })).toBeInTheDocument();
		expect(
			within(await row(/add-billing/)).getByRole("img", { name: "Plan: Draft" }),
		).toBeInTheDocument();
		await waitFor(() => expect(within(exp).getByRole("cell", { name: "1" })).toBeInTheDocument());
	});

	it("shows ghost rows and one action when there is no change", async () => {
		for (const p of Object.keys(files())) if (p.startsWith(`${CH}/`)) delete files()[p];
		await renderSpecs(<SpecChanges />);
		expect(await screen.findAllByRole("button", { name: "New change" })).toHaveLength(1);
	});

	it("creates a change from a kebab-case id and refuses another id", async () => {
		const user = userEvent.setup();
		await renderSpecs(<SpecChanges />);
		await user.click(await screen.findByRole("button", { name: "New change" }));
		await user.type(screen.getByRole("textbox", { name: "Change id" }), "Bad Id");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("invalid change id: Bad Id");
		expect(files()[`${CH}/Bad Id/proposal.md`]).toBeUndefined();
		await user.clear(screen.getByRole("textbox", { name: "Change id" }));
		await user.type(screen.getByRole("textbox", { name: "Change id" }), "add-search");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await screen.findByRole("navigation", { name: "Artifacts" });
		expect(files()[`${CH}/add-search/proposal.md`]).toBeDefined();
	});

	it("shows a finding on the artifact that holds it, with its line", async () => {
		const user = userEvent.setup();
		await renderSpecs(<SpecChanges />);
		const nav = within(await open(user, "add-billing"));
		await user.click(await screen.findByRole("button", { name: "Validate" }));
		await waitFor(() =>
			expect(nav.getByRole("img", { name: "Proposal: Done" })).toBeInTheDocument(),
		);
		// Only the spec holds a finding.
		expect(nav.getByRole("img", { name: "Spec / invoices: Draft" })).toBeInTheDocument();
		expect(nav.getByRole("img", { name: "Plan / invoices: Done" })).toBeInTheDocument();
		await user.click(nav.getByRole("button", { name: /Spec \/ invoices/ }));
		const finding = await screen.findByRole("button", { name: /REQ-002 has no scenario/ });
		expect(finding).toHaveTextContent(/Line \d+/);
		await user.click(finding);
		expect(screen.getByTestId("error-line")).toBeInTheDocument();
	});

	it("edits and saves an artifact, and offers reload or keep mine after a change on disk", async () => {
		const user = userEvent.setup();
		await renderSpecs(<SpecChanges />);
		await open(user, "add-billing");
		const path = `${CH}/add-billing/proposal.md`;
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

	it("links a marker to its question and shows a marker with no question as unlinked", async () => {
		const user = userEvent.setup();
		const p = `${CH}/add-export/specs/export/spec.md`;
		const f = files()[p];
		if (f) f.text += "\nA rule [NEEDS CLARIFICATION: who decides?]\n";
		await renderSpecs(<SpecChanges />);
		await open(user, "add-export");
		await user.click(screen.getByRole("button", { name: /Spec \/ export/ }));
		const markers = await screen.findByRole("region", { name: "Open markers" });
		expect(within(markers).getByRole("heading", { name: "Open markers (2)" })).toBeInTheDocument();
		expect(within(markers).getByText("Unlinked")).toBeInTheDocument();
		await user.click(within(markers).getByRole("button", { name: /q:Q-035/ }));
		expect(screen.getByRole("status", { name: "Inspector" })).toHaveTextContent("q:Q-035");
	});

	it("opens a change with the keyboard", async () => {
		const user = userEvent.setup();
		await renderSpecs(<SpecChanges />);
		(await row(/add-auth/)).focus();
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("navigation", { name: "Artifacts" })).toBeVisible();
	});
});

describe("Specs / Capabilities", () => {
	it("lists the capabilities with their counts, and a requirement shows its backlinks by kind", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Capabilities />);
		expect(await row(/auth\s*3/)).toBeVisible();
		expect(await row(/billing\s*2/)).toBeVisible();
		await user.click(await row(/auth/));
		const table = await screen.findByRole("table", { name: "Requirements" });
		expect(await within(table).findByRole("row", { name: /REQ-001/ })).toBeVisible();
		await user.click(within(table).getByRole("row", { name: /REQ-003/ }));
		await waitFor(() =>
			expect(screen.getByRole("status", { name: "Inspector" })).toHaveTextContent(
				"spec:auth#REQ-003 test:1 wi:1",
			),
		);
		// The plan of the capability is a file of the capability.
		await user.click(screen.getByRole("tab", { name: "Spec" }));
		expect(await screen.findByRole("textbox", { name: "Spec" })).toHaveValue(
			files()["docs/openspec/specs/auth/spec.md"]?.text,
		);
	});
});

describe("Specs / Constitution", () => {
	it("shows the file and saves an edit", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Constitution />);
		const box = await screen.findByRole("textbox", { name: "Constitution" });
		await waitFor(() =>
			expect(box).toHaveValue(files()["docs/openspec/constitution.md"]?.text ?? ""),
		);
		await user.type(box, "\n- New rule.");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(files()["docs/openspec/constitution.md"]?.text).toMatch(/New rule\.$/),
		);
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

	it("shows French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await renderSpecs(<SpecChanges />);
		expect(await row(/add-auth/)).toBeVisible();
		expect(screen.getByRole("button", { name: "Nouveau changement" })).toBeInTheDocument();
	});
});
