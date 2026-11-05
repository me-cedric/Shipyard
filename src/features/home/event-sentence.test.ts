import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { eventSentence, eventTone } from "./event-sentence";

const say = (kind: string, payload: unknown, said = en.home.event) =>
	eventSentence(said, en.factory.state, { kind, payload: JSON.stringify(payload), key: "ACME-1" });

describe("eventSentence", () => {
	it("names each kind in one plain sentence", () => {
		expect(say("state", { from: "Queued", to: "Claimed" })).toBe("ACME-1 moved to Claimed");
		expect(say("note", { note: "Test first." })).toBe("Test first.");
		expect(say("tool", { tool: "read_ref" })).toBe("The agent used read ref");
		expect(say("runner", { type: "usage", cost_usd: 0.5 })).toBe("The agent spent $0.50");
		expect(say("runner", { error: "the check failed" })).toBe(
			"The agent hit an error: the check failed",
		);
		expect(say("question", { question: { question: "Which page?" } })).toBe(
			"The agent asked: Which page?",
		);
		expect(say("question", { outcome: "answered", text: "The home page" })).toBe(
			"The answer: The home page",
		);
		expect(say("pr", { event: "opened" })).toBe("A pull request opened for ACME-1");
		expect(say("unknown", {})).toBe("ACME-1 changed");
	});

	it("says a write in words, for each state of its approval", () => {
		const move = { kind: "transition", key: "ACME-1", status: "In Progress" };
		expect(say("write", { state: "pending", write: move })).toBe(
			"Waiting for you: Move ACME-1 to In Progress",
		);
		expect(say("write", { state: "approved", write: move })).toBe(
			"Approved: Move ACME-1 to In Progress",
		);
		expect(say("write", { state: "sent", write: move })).toBe("Sent: Move ACME-1 to In Progress");
		expect(say("write", { state: "rejected", write: move })).toBe(
			"Refused: Move ACME-1 to In Progress",
		);
		expect(
			say("write", {
				state: "pending",
				write: { kind: "labels", key: "ACME-1", labels: ["a", "b"] },
			}),
		).toBe("Waiting for you: Set the labels of ACME-1 to a, b");
		expect(say("write", { state: "pending", write: move }, fr.home.event)).toContain(
			"Passer ACME-1",
		);
	});

	it("gives a payload that is not JSON a sentence and a dot", () => {
		const e = { kind: "note", payload: "plain", key: "ACME-1" };
		expect(eventSentence(en.home.event, en.factory.state, e)).toBe("A note was added to ACME-1");
		expect(eventTone(e)).toBe("idle");
		expect(eventTone({ kind: "write", payload: '{"state":"pending"}', key: "" })).toBe("warning");
	});
});
