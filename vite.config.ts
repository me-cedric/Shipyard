import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vitest/config";

const shim = (name: string) => fileURLToPath(new URL(`./src/ui/shims/${name}`, import.meta.url));

// The LikeC4 browser build imports Node modules that it never calls. These stubs stand in for them.
const NODE_STUBS = [
	"module",
	"crypto",
	"process",
	"os",
	"fs",
	"fs/promises",
	"chokidar",
	"esbuild",
	"fdir",
	"nano-spawn",
	"bundle-require",
];

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		// crypto is not here: its polyfill is large and shims/crypto.js uses Web Crypto.
		nodePolyfills({
			protocolImports: true,
			include: ["path", "util", "events", "stream", "buffer", "url"],
		}),
	],
	resolve: {
		alias: [
			{ find: /^@\//, replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/` },
			...NODE_STUBS.flatMap((m) => [
				{ find: new RegExp(`^(node:)?${m}$`), replacement: shim(`${m.replace("/", "-")}.js`) },
			]),
		],
	},
	clearScreen: false,
	server: { port: 1420, strictPort: true },
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["src/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
