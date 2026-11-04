import { render, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { useDropFolder } from "./drop-folder";

const fake = vi.hoisted(() => ({
	listener: undefined as undefined | ((e: { payload: unknown }) => void),
	open: vi.fn(),
	off: vi.fn(),
	dialog: vi.fn(),
	isFolder: vi.fn(),
}));

vi.mock("@tauri-apps/api/webview", () => ({
	getCurrentWebview: () => ({
		onDragDropEvent: async (f: (e: { payload: unknown }) => void) => {
			fake.listener = f;
			return fake.off;
		},
	}),
}));
vi.mock("@/lib/ipc", async (orig) => ({
	...(await orig<typeof import("@/lib/ipc")>()),
	isTauri: () => true,
	errorDialog: fake.dialog,
	commands: {
		...(await orig<typeof import("@/lib/ipc")>()).commands,
		projectsIsFolder: fake.isFolder,
	},
}));
vi.mock("@/lib/projects", async (orig) => ({
	...(await orig<typeof import("@/lib/projects")>()),
	useProjectActions: () => ({ openFolder: fake.open }),
}));

const mount = async () => {
	fake.listener = undefined;
	// jsdom has no layout: no element sits under the pointer.
	document.elementFromPoint = vi.fn(() => null);
	fake.isFolder.mockResolvedValue(true);
	const view = render(
		<I18nProvider>
			<Probe />
		</I18nProvider>,
	);
	await waitFor(() => expect(fake.listener).toBeDefined());
	return view;
};
const drop = (x = 10, y = 10, paths = ["/mock/alpha"]) =>
	fake.listener?.({ payload: { type: "drop", paths, position: { x, y } } });

function Probe() {
	useDropFolder();
	return null;
}

describe("drop a folder on the window", () => {
	it("opens the first dropped path as a project and ignores the other events", async () => {
		fake.open.mockResolvedValue({ status: "opened", project: null, message: null });
		const { unmount } = await mount();
		fake.listener?.({ payload: { type: "enter", paths: ["/x"] } });
		drop(10, 10, ["/mock/alpha", "/other"]);
		await waitFor(() => expect(fake.open).toHaveBeenCalledExactlyOnceWith("/mock/alpha"));
		unmount();
		expect(fake.off).toHaveBeenCalled();
	});

	it("leaves a drop on a composer to the composer", async () => {
		fake.open.mockClear();
		await mount();
		const zone = document.body.appendChild(document.createElement("div"));
		zone.setAttribute("data-drop-zone", "");
		const at = vi.mocked(document.elementFromPoint).mockReturnValue(zone);
		Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
		drop(200, 100);
		expect(at).toHaveBeenCalledWith(100, 50);
		await Promise.resolve();
		expect(fake.open).not.toHaveBeenCalled();
		zone.remove();
	});

	it("does nothing for a dropped file", async () => {
		fake.open.mockClear();
		await mount();
		fake.isFolder.mockResolvedValue(false);
		drop();
		await waitFor(() => expect(fake.isFolder).toHaveBeenCalledWith("/mock/alpha"));
		await Promise.resolve();
		expect(fake.open).not.toHaveBeenCalled();
	});

	it("shows a rejected open", async () => {
		fake.dialog.mockClear();
		await mount();
		fake.open.mockRejectedValue(new Error("boom"));
		drop();
		await waitFor(() => expect(fake.dialog).toHaveBeenCalled());
	});
});
