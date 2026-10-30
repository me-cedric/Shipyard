// The mock of the Feedback action and the debug console. Rules of the Rust commands: a one-line
// title, a click, no secret in the text, and a console line that holds a secret is hidden.
import type { FeedbackKind, LogLine } from "./bindings";

const REPO = "https://github.com/me-cedric/Shipyard";
const SECRET = /ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{24,}/;

export function feedbackOpen(
	kind: FeedbackKind,
	title: string,
	details: string,
	click: boolean,
): string {
	if (!click) throw "this action needs the click of a person";
	const t = title.trim();
	if (!t || /[\r\n]/.test(t) || t.length > 120)
		throw "the title must be one line of 120 characters or fewer";
	if (details.length > 4000) throw "the details are longer than 4000 characters";
	if (SECRET.test(`${t}\n${details}`)) throw "the text holds what looks like a secret";
	const label = kind === "bug" ? "bug" : "enhancement";
	const body = `${details.trim()}\n\n---\nShipyard 0.1.0 on web`;
	return `${REPO}/issues/new?labels=${label}&title=${encodeURIComponent(t)}&body=${encodeURIComponent(body)}`;
}

export type MockLog = { lines: LogLine[] };

export const seedLog = (): MockLog => ({
	lines: [
		{ at: "09:00:00", level: "info", message: "Shipyard 0.1.0 started" },
		{ at: "09:00:02", level: "warn", message: "this change needs the click of a person" },
		{ at: "09:01:10", level: "error", message: "agent tools endpoint: port 47821 is in use" },
	],
});

/** A line that looks like a secret is hidden, as the Rust log does. */
export function logRecord(l: MockLog, level: string, message: string) {
	l.lines.push({
		at: "09:02:00",
		level: ["info", "warn", "error"].includes(level) ? level : "info",
		message: SECRET.test(message) ? "[line hidden: it held a secret]" : message,
	});
}
