import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type ShellState = {
	inspectorOpen: boolean;
	setInspectorOpen: (open: boolean) => void;
	/** The ref that the inspector shows, or null. */
	selectedRef: string | null;
	openRef: (ref: string) => void;
	/** A view's own detail for the inspector, in place of a ref. A ref or a close clears it. */
	detail: { title: string; node: ReactNode } | null;
	openDetail: (title: string, node: ReactNode) => void;
	/** Clears the detail and closes the inspector, when the view that opened it goes away. */
	closeDetail: () => void;
	paletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	syncing: boolean;
	/** The reason of the last failed sync, or null. */
	syncError: string | null;
	/** Runs `job` as the sync. A second call waits until the first ends. */
	sync: (job: () => Promise<unknown>) => void;
	commitOpen: boolean;
	setCommitOpen: (open: boolean) => void;
};

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [selectedRef, setSelectedRef] = useState<string | null>(null);
	const [detail, setDetail] = useState<{ title: string; node: ReactNode } | null>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [commitOpen, setCommitOpen] = useState(false);

	const openRef = useCallback((ref: string) => {
		setSelectedRef(ref);
		setDetail(null);
		setInspectorOpen(true);
	}, []);
	const openDetail = useCallback((title: string, node: ReactNode) => {
		setDetail({ title, node });
		setInspectorOpen(true);
	}, []);
	const closeDetail = useCallback(() => {
		setDetail(null);
		setInspectorOpen(false);
	}, []);
	const sync = useCallback(
		(job: () => Promise<unknown>) => {
			if (syncing) return;
			setSyncing(true);
			setSyncError(null);
			job()
				.catch((e) => setSyncError(e instanceof Error ? e.message : String(e)))
				.finally(() => setSyncing(false));
		},
		[syncing],
	);

	const value = useMemo(
		() => ({
			inspectorOpen,
			setInspectorOpen,
			selectedRef,
			openRef,
			detail,
			openDetail,
			closeDetail,
			paletteOpen,
			setPaletteOpen,
			syncing,
			syncError,
			sync,
			commitOpen,
			setCommitOpen,
		}),
		[
			inspectorOpen,
			selectedRef,
			openRef,
			detail,
			openDetail,
			closeDetail,
			paletteOpen,
			syncing,
			syncError,
			sync,
			commitOpen,
		],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useShell needs ShellProvider");
	return ctx;
}
