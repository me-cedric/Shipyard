import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { useDesignFile } from "@/lib/design";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { FILES_EVENT, keysFor, useFileChanges } from "./index";

type Payload = { paths: string[]; truncated: boolean };
const handlers: Array<(e: { payload: Payload }) => void> = [];
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async (_: string, cb: (e: { payload: Payload }) => void) => {
		handlers.push(cb);
		return () => {};
	}),
}));
vi.mock("@/lib/ipc", async (orig) => ({ ...(await orig<object>()), isTauri: () => true }));

const send = (...paths: string[]) =>
	act(async () => {
		for (const h of handlers) h({ payload: { paths, truncated: false } });
	});
const sendTruncated = () =>
	act(async () => {
		for (const h of handlers) h({ payload: { paths: [], truncated: true } });
	});

describe("refresh on change", () => {
	it("picks the queries that the changed paths feed", () => {
		const names = (p: string[]) => keysFor(p).map((k) => k.join("/"));
		expect(names(["docs/diagrams/a.mmd"])).toEqual(
			expect.arrayContaining(["refs", "code/status", "design"]),
		);
		expect(names(["docs/diagrams/a.mmd"])).not.toContain("specs");
		expect(names(["docs/openspec/changes/x/spec.md"])).toContain("specs");
		expect(names(["docs/handbook/a.md"])).toContain("knowledge");
		expect(names(["src/main.rs"])).toEqual(["refs", "code/status", "code/diff"]);
		expect(FILES_EVENT).toBe("files-changed");
	});

	it("invalidates the list queries and spares the per-file reads", async () => {
		const qc = new QueryClient();
		qc.setQueryData(["design", "list"], 1);
		qc.setQueryData(["design", "file", "docs/diagrams/a.mmd"], 1);
		handlers.length = 0;
		renderHook(() => useFileChanges(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={qc}>{children}</QueryClientProvider>
			),
		});
		await waitFor(() => expect(handlers.length).toBe(1));
		await send("docs/diagrams/a.mmd");
		expect(qc.getQueryState(["design", "list"])?.isInvalidated).toBe(true);
		expect(qc.getQueryState(["design", "file", "docs/diagrams/a.mmd"])?.isInvalidated).toBe(false);
	});

	it("reads every list again when the paths were cut, and still spares the per-file reads", async () => {
		const qc = new QueryClient();
		qc.setQueryData(["knowledge", "list"], 1);
		qc.setQueryData(["design", "file", "docs/diagrams/a.mmd"], 1);
		handlers.length = 0;
		renderHook(() => useFileChanges(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={qc}>{children}</QueryClientProvider>
			),
		});
		await waitFor(() => expect(handlers.length).toBe(1));
		await sendTruncated();
		expect(qc.getQueryState(["knowledge", "list"])?.isInvalidated).toBe(true);
		expect(qc.getQueryState(["design", "file", "docs/diagrams/a.mmd"])?.isInvalidated).toBe(false);
	});

	describe("an open design file", () => {
		const path = "docs/diagrams/watch.mmd";
		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
		);
		const onDisk = async (text: string) => {
			const { stamp } = await unwrap(commands.designRead(path));
			await unwrap(commands.designWrite(path, text, stamp, false));
		};
		beforeEach(async () => {
			handlers.length = 0;
			await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
			await unwrap(commands.designWrite(path, "one", null, true)).catch(() => {});
			await onDisk("one");
		});

		it("reads the new text when it has no draft", async () => {
			const { result } = renderHook(() => useDesignFile(path), { wrapper });
			await waitFor(() => expect(result.current.text).toBe("one"));
			await onDisk("two");
			await send(path);
			await waitFor(() => expect(result.current.text).toBe("two"));
		});

		it("keeps the unsaved text and shows the conflict at the save", async () => {
			const { result } = renderHook(() => useDesignFile(path), { wrapper });
			await waitFor(() => expect(result.current.text).toBe("one"));
			act(() => result.current.setText("mine"));
			await onDisk("agent");
			await send(path);
			expect(result.current.text).toBe("mine");
			await act(async () => void (await result.current.save()));
			expect(result.current.conflict).toBe(true);
			expect(result.current.text).toBe("mine");
		});
	});
});
