import { defineConfig, devices } from "@playwright/test";

// Persona walkthroughs (W13): one script per profile on the demo build. Run with `pnpm test:personas`.
// Set PERSONAS_OUT to a folder for the screenshots and the step logs.
const DIST = "node_modules/.cache/personas-dist";

export default defineConfig({
	testDir: "e2e/personas",
	testMatch: "*.persona.ts",
	timeout: 180_000,
	use: { baseURL: "http://localhost:4177", viewport: { width: 1440, height: 900 } },
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
		},
	],
	webServer: {
		command: `pnpm exec vite build --outDir ${DIST} --emptyOutDir && pnpm exec vite preview --outDir ${DIST} --port 4177 --strictPort`,
		url: "http://localhost:4177",
		reuseExistingServer: !process.env.CI,
		timeout: 300_000,
	},
});
