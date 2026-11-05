import { mentionAt, slashQuery } from "./slash";

describe("slash commands", () => {
	it("opens only while the draft is one command word", () => {
		expect(slashQuery("/")).toBe("");
		expect(slashQuery("/ex")).toBe("ex");
		expect(slashQuery("/ex plain")).toBeNull();
		expect(slashQuery("say /ex")).toBeNull();
	});

	it("finds the @ word at the end of the draft", () => {
		expect(mentionAt("see @spec:a")).toEqual({ start: 4, query: "spec:a" });
		expect(mentionAt("@")).toEqual({ start: 0, query: "" });
		expect(mentionAt("mail me@x")).toBeNull();
		expect(mentionAt("@done ")).toBeNull();
	});
});
