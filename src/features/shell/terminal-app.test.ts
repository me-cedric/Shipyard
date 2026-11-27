import { cdCommand } from "./terminal-app";

describe("cdCommand", () => {
	it("quotes the folder so that a shell reads each character as it is", () => {
		expect(cdCommand("/Users/ada/My project")).toBe("cd '/Users/ada/My project'");
		expect(cdCommand("/tmp/it's $HOME")).toBe("cd '/tmp/it'\\''s $HOME'");
	});
});
