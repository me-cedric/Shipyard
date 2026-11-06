import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { BAD_PACK_PATH, PACK_PATH, UNKNOWN_KEY_PATH } from "@/lib/ipc/mock-languages";
import { mountApp } from "@/test/mount";

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
	await user.click(await screen.findByRole("combobox", { name: field }));
	await user.click(await screen.findByRole("option", { name: option }));
}

async function importPack(user: ReturnType<typeof userEvent.setup>, path = PACK_PATH) {
	mockState().nextFile = path;
	await user.click(await screen.findByRole("button", { name: "Import language" }));
	return screen.findByRole("dialog");
}

describe("built-in languages (spec languages, REQ-001, REQ-002)", () => {
	it("switches to German, then to Spanish, and keeps each choice", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		await choose(user, "Language", "German");
		expect(await screen.findByRole("combobox", { name: "Sprache" })).toBeVisible();
		expect(document.documentElement.lang).toBe("de");
		await waitFor(() => expect(mockState().prefs.lang).toBe("de"));
		await choose(user, "Sprache", "Spanisch");
		expect(await screen.findByRole("combobox", { name: "Idioma" })).toBeVisible();
		expect(document.documentElement.lang).toBe("es");
		await waitFor(() => expect(mockState().prefs.lang).toBe("es"));
	});
});

describe("language packs (spec languages, REQ-005 to REQ-008)", () => {
	it("imports a pack, adds and selects it, and shows each missing text in English", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		const dialog = await importPack(user);
		expect(within(dialog).getByText(/^2 of \d+ texts translated$/)).toBeVisible();
		await user.click(within(dialog).getByRole("button", { name: "Add language" }));
		expect(await screen.findByRole("combobox", { name: "Idioma" })).toBeVisible();
		expect(document.documentElement.lang).toBe("pt");
		await waitFor(() => expect(mockState().prefs.langPack).toBe("pt"));
		expect(mockState().languages.map((p) => p.code)).toEqual(["pt"]);
		// A text that the pack does not translate is English, and the marker shows it.
		await user.click(screen.getByRole("switch", { name: "Mark untranslated text" }));
		expect(await screen.findByRole("button", { name: "⟦Import language⟧" })).toBeVisible();
	});

	it("refuses an unknown key and a bad file, and saves nothing", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		let dialog = await importPack(user, UNKNOWN_KEY_PATH);
		expect(within(dialog).getByText("common.gone: not a message key")).toBeVisible();
		expect(within(dialog).queryByRole("button", { name: "Add language" })).toBeNull();
		await user.keyboard("{Escape}");
		dialog = await importPack(user, BAD_PACK_PATH);
		expect(within(dialog).getByText("code: fr ships with the app")).toBeVisible();
		expect(within(dialog).getByText("name: use 1 to 60 characters")).toBeVisible();
		expect(mockState().languages).toEqual([]);
	});

	it("exports the English base, and remove of the current pack goes back to English", async () => {
		const user = userEvent.setup();
		mountApp("/settings/me");
		mockState().nextFile = "/mock/base.json";
		await user.click(await screen.findByRole("button", { name: "Export English" }));
		await waitFor(() => expect(mockState().exportedLanguages["/mock/base.json"]).toBeDefined());
		const base = mockState().exportedLanguages["/mock/base.json"];
		expect(base?.messages["common.close"]).toBe("Close");
		expect(base?.messages["error.no_project"]).toBe("Open or create a project first.");

		const dialog = await importPack(user);
		await user.click(within(dialog).getByRole("button", { name: "Add language" }));
		await user.click(await screen.findByRole("button", { name: "Remove Português" }));
		expect(await screen.findByRole("combobox", { name: "Language" })).toBeVisible();
		await waitFor(() => expect(mockState().prefs.langPack).toBe(""));
		expect(mockState().languages).toEqual([]);
	});
});
