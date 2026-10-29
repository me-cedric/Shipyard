import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	use: { baseURL: "http://localhost:4174" },
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "VITE_MOCK_DEMO=0 pnpm build && pnpm preview --port 4174 --strictPort",
		url: "http://localhost:4174",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
