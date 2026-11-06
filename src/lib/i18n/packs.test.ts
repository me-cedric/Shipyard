import { en } from "./en";
import { applyPack, baseMessages, flatten, mark, packFaults, untranslated } from "./packs";

const pack = (messages: Record<string, string>) => ({
	shipyardLanguage: 1,
	code: "pt",
	name: "Português",
	messages,
});

describe("language packs (spec languages, REQ-004, REQ-005)", () => {
	it("keys the English base like the catalogue, with errors and actions", () => {
		const base = baseMessages();
		expect(base["common.close"]).toBe(en.common.close);
		expect(base["error.no_project"]).toBe("Open or create a project first.");
		expect(base["action.sync"]).toBe("Sync");
		for (const k of Object.keys(flatten(en))) expect(base[k], k).toBeDefined();
		// The export passes the file check of `crates/shipyard-core/src/language.rs`.
		for (const [k, v] of Object.entries(base)) {
			expect(k).toMatch(/^[A-Za-z0-9._-]{1,200}$/);
			expect(v.length, k).toBeLessThanOrEqual(2000);
		}
	});

	it("refuses an unknown key and other placeholders, and accepts a partial pack", () => {
		expect(packFaults({ "common.close": "Fechar" })).toEqual([]);
		expect(packFaults({ constructor: "x" })).toEqual(["constructor: not a message key"]);
		expect(packFaults({ "common.gone": "x", count: "{name}" })).toEqual([
			"common.gone: not a message key",
			"count: use the placeholders {count} {name}",
		]);
	});

	it("shows each missing text in English, with a marker when asked", () => {
		const p = pack({ "common.close": "Fechar", "error.no_project": "Abra um projeto." });
		const plain = applyPack(p, false);
		expect(plain.t.common.close).toBe("Fechar");
		expect(plain.t.common.open).toBe("Open");
		expect(plain.errors.no_project).toBe("Abra um projeto.");
		expect(plain.actions.sync).toBe("Sync");
		const marked = applyPack(p, true);
		expect(marked.t.common.close).toBe("Fechar");
		expect(marked.t.common.open).toBe(mark("Open"));
		expect(untranslated(p.messages)).toContain("common.open");
		expect(untranslated(p.messages)).not.toContain("common.close");
		// A plugin pack skips the key check: a text with other placeholders shows in English.
		expect(applyPack(pack({ count: "{name}" }), false).t.count).toBe(en.count);
	});
});
