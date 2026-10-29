import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

type ShellState = {
	inspectorOpen: boolean;
	setInspectorOpen: (open: boolean) => void;
	/** The ref that the inspector shows, or null. */
	selectedRef: string | null;
	openRef: (ref: string) => void;
	paletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	syncing: boolean;
	sync: () => void;
};

const Ctx = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [selectedRef, setSelectedRef] = useState<string | null>(null);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [syncing, setSyncing] = useState(false);

	// Placeholder: the real sync comes with `add-sync`.
	useEffect(() => {
		if (!syncing) return;
		const id = setTimeout(() => setSyncing(false), 1000);
		return () => clearTimeout(id);
	}, [syncing]);

	const openRef = useCallback((ref: string) => {
		setSelectedRef(ref);
		setInspectorOpen(true);
	}, []);
	const sync = useCallback(() => setSyncing(true), []);

	const value = useMemo(
		() => ({
			inspectorOpen,
			setInspectorOpen,
			selectedRef,
			openRef,
			paletteOpen,
			setPaletteOpen,
			syncing,
			sync,
		}),
		[inspectorOpen, selectedRef, openRef, paletteOpen, syncing, sync],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useShell needs ShellProvider");
	return ctx;
}
