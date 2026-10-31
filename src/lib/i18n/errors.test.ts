import { toFailure, unwrap } from "@/lib/ipc";
import rust from "../../../crates/shipyard-app/src/errors.rs?raw";
import { actionLabels, classify, errorMessages, RAW } from "./errors";

/** `("needle", ErrorCode::TicketNotInMirror)` of `KNOWN` in `errors.rs`, as `[needle, ticket_not_in_mirror]`. rustfmt puts a long pair on three lines. */
const known = [...rust.matchAll(/\(\s*"([^"]+)",\s*ErrorCode::(\w+),?\s*\)/g)].map(
	([, needle, code]) => [needle, (code ?? "").replace(/(?<=.)([A-Z])/g, "_$1").toLowerCase()],
);

describe("the error contract", () => {
	it("keeps the table of Rust and the table of the mock the same", () => {
		expect(known.length).toBeGreaterThan(10);
		expect(RAW.map((r) => [...r])).toEqual(known);
	});

	it("has an English and a French sentence for each code that Rust returns", () => {
		for (const [, code] of known) {
			expect(errorMessages.en[code as keyof typeof errorMessages.en], code).toBeTruthy();
			expect(errorMessages.fr[code as keyof typeof errorMessages.fr], code).toBeTruthy();
		}
		expect(Object.keys(errorMessages.fr)).toEqual(Object.keys(errorMessages.en));
		expect(Object.keys(actionLabels.fr)).toEqual(Object.keys(actionLabels.en));
	});

	it("never lets a known raw Rust text reach the screen", async () => {
		for (const [needle] of known) {
			const raw = `x: ${needle} (${needle})`;
			const failure = toFailure(
				await unwrap(Promise.resolve({ status: "error", error: raw })).catch((e) => e),
			);
			expect(failure.code, needle).not.toBe("unknown");
			expect(failure.message, needle).not.toBe(raw);
			expect(failure.message, needle).toBe(
				errorMessages.en[failure.code as keyof typeof errorMessages.en],
			);
			expect(failure.details).toBe(raw);
		}
	});

	it("gives each source its own message and action", () => {
		expect(classify("invalid change id: Bad Id")).toEqual({
			code: "change_id_invalid",
			action: null,
		});
		expect(classify("the title needs a letter or a digit: !!").code).toBe("title_invalid");
		// A forge outage never reads the tracker again.
		expect(classify("network error: refused")).toEqual({ code: "forge_unreachable", action: null });
		// A proxy that the OS trusts: a plain sentence and the setting that fixes it, not the raw text.
		expect(classify("network error: invalid peer certificate: UnknownIssuer")).toEqual({
			code: "cert_untrusted",
			action: { kind: "setting", target: "certificate" },
		});
		expect(classify("the terminal app is not installed: Kitty")).toEqual({
			code: "terminal_gone",
			action: { kind: "setting", target: "terminalApp" },
		});
	});

	it("shows the details of a text that has no code, and no action", () => {
		expect(classify("odd failure")).toEqual({ code: "unknown", action: null });
		expect(toFailure("odd failure").message).toBe("odd failure");
	});

	it("speaks French when the app speaks French, and gives the action of the code", () => {
		const failure = toFailure("ACME-9 is not in the mirror: sync first");
		expect(failure.message).toBe(errorMessages.en.ticket_not_in_mirror);
		expect(failure.action).toEqual({ kind: "sync", target: "" });
		document.documentElement.lang = "fr";
		expect(failure.message).toBe(errorMessages.fr.ticket_not_in_mirror);
		document.documentElement.lang = "en";
	});

	it("does not ask a person to edit a file", () => {
		for (const lang of ["en", "fr"] as const)
			for (const text of Object.values(errorMessages[lang])) expect(text).not.toMatch(/\.ya?ml/);
	});
});
