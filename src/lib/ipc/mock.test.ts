import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { installMockIpc } from "./mock";

describe("mock ipc", () => {
	beforeEach(installMockIpc);
	afterEach(clearMocks);

	it("serves the three commands", async () => {
		expect(await commands.appInfo()).toEqual({ name: "Shipyard", version: "0.1.0", os: "browser" });
		expect(await commands.projectsRecent()).toEqual([]);
		expect(await commands.healthPing()).toBe("pong");
	});
});
