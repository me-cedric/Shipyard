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
	assistantOpen: boolean;
	/** The ref that the assistant must explain next. The shell clears it once the answer starts. */
	explainRef: string | null;
	/** Opens the assistant with the entity as context and asks for the Explain answer (knowledge REQ-008). */
	explain: (ref: string) => void;
	clearExplain: () => void;
	/** A text for the draft of the assistant. The shell puts it in the draft and clears it. */
	prefill: string | null;
	/** Opens the assistant with the text in its draft. A person reads it, edits it and sends it. */
	ask: (text: string) => void;
	clearPrefill: () => void;
	setAssistantOpen: (open: boolean) => void;
	syncing: boolean;
	/** The reason of the last failed sync, or null. */
	syncError: string | null;
	/** Runs `job` as the sync. A second call waits until the first ends. */
	sync: (job: () => Promise<unknown>) => void;
	commitOpen: boolean;
	setCommitOpen: (open: boolean) => void;
	shortcutsOpen: boolean;
	setShortcutsOpen: (open: boolean) => void;
	/** The window asked to close while work runs. The shell shows the guard. */
	closeGuardOpen: boolean;
	setCloseGuardOpen: (open: boolean) => void;
	/** The drawer of the working copy files. */
	filesOpen: boolean;
	setFilesOpen: (open: boolean) => void;
	/** The bottom drawer of terminals, on every view. */
	terminalOpen: boolean;
	setTerminalOpen: (open: boolean) => void;
	/** The actions that the inspector offers for a ref, or undefined. Set by `ShellProvider`. */
	refActions?: RefActions;
};

/** What a ref offers beyond its backlinks, in the inspector. The app fills it: a feature never imports another. */
export type RefActions = (refId: string, title: string) => ReactNode;

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({
	children,
	refActions,
}: {
	children: ReactNode;
	refActions?: RefActions;
}) {
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [selectedRef, setSelectedRef] = useState<string | null>(null);
	const [detail, setDetail] = useState<{ title: string; node: ReactNode } | null>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [assistantOpen, setAssistantOpen] = useState(false);
	const [explainRef, setExplainRef] = useState<string | null>(null);
	const [prefill, setPrefill] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [commitOpen, setCommitOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [closeGuardOpen, setCloseGuardOpen] = useState(false);
	const [filesOpen, setFilesOpen] = useState(false);
	const [terminalOpen, setTerminalOpen] = useState(false);

	const openRef = useCallback((ref: string) => {
		setSelectedRef(ref);
		setDetail(null);
		setInspectorOpen(true);
	}, []);
	const explain = useCallback((ref: string) => {
		setSelectedRef(ref);
		setAssistantOpen(true);
		setExplainRef(ref);
	}, []);
	const clearExplain = useCallback(() => setExplainRef(null), []);
	const ask = useCallback((text: string) => {
		setAssistantOpen(true);
		setPrefill(text);
	}, []);
	const clearPrefill = useCallback(() => setPrefill(null), []);
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
			assistantOpen,
			setAssistantOpen,
			explainRef,
			explain,
			clearExplain,
			prefill,
			ask,
			clearPrefill,
			syncing,
			syncError,
			sync,
			commitOpen,
			setCommitOpen,
			shortcutsOpen,
			setShortcutsOpen,
			closeGuardOpen,
			setCloseGuardOpen,
			filesOpen,
			setFilesOpen,
			terminalOpen,
			setTerminalOpen,
			refActions,
		}),
		[
			inspectorOpen,
			selectedRef,
			openRef,
			detail,
			openDetail,
			closeDetail,
			paletteOpen,
			assistantOpen,
			explainRef,
			explain,
			clearExplain,
			prefill,
			ask,
			clearPrefill,
			syncing,
			syncError,
			sync,
			commitOpen,
			shortcutsOpen,
			closeGuardOpen,
			filesOpen,
			terminalOpen,
			refActions,
		],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useShell needs ShellProvider");
	return ctx;
}
