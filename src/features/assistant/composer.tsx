import { useQuery } from "@tanstack/react-query";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { mentionAt, slashQuery } from "@/lib/assistant/slash";
import { format, useI18n } from "@/lib/i18n";
import {
	type AssistantMode,
	type Attachment,
	commands,
	type Permission,
	type ThreadSettings,
	unwrap,
} from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { useRefSearch } from "@/lib/refs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { PaperAirplaneIcon, PlusIcon, StopIcon, XMarkIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";
import { CodexTrust } from "./codex-trust";
import { ComposerMenu, type MenuItem } from "./composer-menu";
import { GaugeView } from "./gauge";
import { ModelMenu } from "./model-menu";
import type { Assistant } from "./use-assistant";

const MODES: AssistantMode[] = ["ask", "plan", "agent"];
const PERMISSIONS: Permission[] = ["approve", "auto", "bypass", "read_only"];
// An `@` token that ends the text: the ref that the person typed.
const TOKEN = /(^|\s)@(\S+)$/;

/** The message box, and one bar under it: attach, model, permission, context ring and the one primary action. */
export function Composer({
	a,
	inputRef,
}: {
	a: Assistant;
	inputRef: RefObject<HTMLTextAreaElement | null>;
}): ReactNode {
	const { t } = useI18n();
	const listId = useId();
	const readOnly = usePrefs().profile.readOnly;
	const s = a.current?.thread.settings;
	// A project with a read only profile gets the read only level and no other.
	const { setSettings } = a;
	const stuck = readOnly && s !== undefined && s.permission !== "read_only";
	useEffect(() => {
		if (stuck) void setSettings({ permission: "read_only" });
	}, [stuck, setSettings]);
	// Files and images join the next turn as quotes: data, never an instruction.
	const [files, setFiles] = useState<Attachment[]>([]);
	const [attachError, setAttachError] = useState<string | null>(null);
	const picker = useRef<HTMLInputElement>(null);
	const thread = a.current?.thread.id;
	const attach = async (list: FileList | File[]) => {
		if (!thread) return;
		setAttachError(null);
		for (const f of Array.from(list)) {
			try {
				const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
				const done = await unwrap(commands.assistantAttach(thread, f.name, bytes));
				setFiles((x) => [...x, done]);
			} catch (e) {
				setAttachError(e instanceof Error ? e.message : String(e));
			}
		}
	};
	/** An image on the clipboard joins as a file. A clipboard names every image the same, so each gets its own name. */
	const paste = (e: React.ClipboardEvent) => {
		const shots = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
		if (shots.length === 0) return;
		// Cells from a sheet carry text and a picture: keep the text paste.
		if (!e.clipboardData.getData("text/plain")) e.preventDefault();
		const stamp = Date.now();
		void attach(
			shots.map(
				(f, i) =>
					new File([f], `screenshot-${stamp}-${i + 1}.${f.type.slice(6).split("+")[0]}`, {
						type: f.type,
					}),
			),
		);
	};
	const submit = () => {
		void a.send(
			a.draft,
			true,
			files.map((f) => ({ source: f.name, text: f.quote })),
		);
		setFiles([]);
	};
	// Auto pre-approves the edit tools: one warning with the effect, and a click, before it applies.
	const [warnAuto, setWarnAuto] = useState(false);
	// Bypass permissions asks once for each project. A project with a read only profile never gets it.
	const project = useActiveProject().data?.id ?? "";
	const [warnBypass, setWarnBypass] = useState(false);
	const bypassKey = `shipyard:bypass-confirmed:${project}`;
	const runner = a.runners.find((r) => r.runner === s?.runner);
	const levels = readOnly
		? PERMISSIONS.filter((p) => p === "read_only")
		: PERMISSIONS.filter((p) => p !== "bypass" || runner?.bypass);
	const applyBypass = async () => {
		if ((await a.setSettings({ permission: "bypass" })) && project)
			localStorage.setItem(bypassKey, "1");
		setWarnBypass(false);
	};
	/** A runner with no Bypass takes the thread back to Edit with approval. */
	const change = (patch: Partial<ThreadSettings>) => {
		const next = patch.runner ? a.runners.find((r) => r.runner === patch.runner) : runner;
		const drop = s?.permission === "bypass" && !next?.bypass;
		void a.setSettings(drop ? { ...patch, permission: "approve" } : patch);
	};
	// The slash menu and the `@` menu share one list. Escape closes it until the draft changes.
	const [active, setActive] = useState(0);
	const [closed, setClosed] = useState<string | null>(null);
	const slash = slashQuery(a.draft);
	// The commands of the runner of the thread: its own files, read when the list opens.
	const listed = useQuery({
		queryKey: ["assistant", "slash", s?.runner],
		queryFn: () => unwrap(commands.assistantSlashCommands(s?.runner ?? "")),
		enabled: slash !== null && !!s,
	}).data;
	const at = slash === null ? mentionAt(a.draft) : null;
	const hits = useRefSearch(at?.query ?? "").data;
	const items: MenuItem[] =
		slash !== null
			? (listed ?? [])
					.filter((c) => c.name.toLowerCase().startsWith(slash.toLowerCase()))
					.map((c) => ({
						id: c.name,
						label: `/${c.name}`,
						hint: c.description,
						// The text goes to the runner as typed.
						pick: () => a.setDraft(`/${c.name} `),
					}))
			: at?.query
				? [...(hits ?? [])]
						.sort((x, y) => Number(y.ref === at.query) - Number(x.ref === at.query))
						.map((h) => ({
							id: h.ref,
							label: `${h.ref} ${h.title}`,
							pick: () => {
								a.setDraft(a.draft.slice(0, at.start));
								void a.addRef(h.ref);
							},
						}))
				: [];
	const menuOpen = items.length > 0 && closed !== a.draft;
	const current = Math.min(active, Math.max(items.length - 1, 0));
	/** A completed `@ref` leaves the text and joins the context. */
	const takeRef = (text: string, end: RegExpExecArray) => {
		a.setDraft(text.slice(0, end.index + (end[1]?.length ?? 0)));
		if (end[2]) void a.addRef(end[2]);
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the Attach file button is the keyboard path
		<div
			data-drop-zone
			className="m-2 mt-0 flex flex-col gap-2 rounded-xl border bg-surface-2 p-2 shadow-1"
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				void attach(e.dataTransfer.files);
			}}
		>
			{s ? (
				<Segmented
					label={t.assistant.mode.label}
					value={s.mode}
					onValueChange={(mode) => void a.setSettings({ mode })}
					items={MODES.map((m) => ({ value: m, label: t.assistant.mode[m] }))}
				/>
			) : null}
			{s?.runner === "codex" ? <CodexTrust /> : null}
			<Dialog
				open={warnAuto}
				onOpenChange={setWarnAuto}
				title={t.assistant.autoWarn.title}
				actions={
					<Button
						variant="primary"
						onClick={() => {
							void a.setSettings({ permission: "auto" });
							setWarnAuto(false);
						}}
					>
						{t.assistant.autoWarn.accept}
					</Button>
				}
			>
				<p className="text-ui text-n-11">{t.assistant.autoWarn.body}</p>
			</Dialog>
			<Dialog
				open={warnBypass}
				onOpenChange={setWarnBypass}
				title={t.assistant.bypassWarn.title}
				actions={
					<Button variant="danger" onClick={() => void applyBypass()}>
						{t.assistant.bypassWarn.accept}
					</Button>
				}
			>
				<p className="text-ui text-n-11">{t.assistant.bypassWarn.body}</p>
			</Dialog>
			<div className="relative">
				{menuOpen ? (
					<ComposerMenu
						label={slash !== null ? t.assistant.slash.menu : t.assistant.mention.menu}
						listId={listId}
						items={items}
						active={current}
					/>
				) : null}
				<Textarea
					ref={inputRef}
					label={t.assistant.message}
					rows={3}
					value={a.draft}
					aria-controls={menuOpen ? listId : undefined}
					aria-activedescendant={menuOpen ? `${listId}-${current}` : undefined}
					onPaste={paste}
					onChange={(e) => {
						const text = e.target.value;
						setActive(0);
						const done = TOKEN.exec(text.trimEnd());
						// A space after the token ends it. Without it the person is still typing.
						if (done && /\s$/.test(text)) takeRef(text.trimEnd(), done);
						else a.setDraft(text);
					}}
					onKeyDown={(e) => {
						if (e.nativeEvent.isComposing) return;
						if (e.key === "Escape" && a.busy && !menuOpen) {
							e.preventDefault();
							a.stop();
							return;
						}
						if (menuOpen) {
							const move = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
							if (move) {
								e.preventDefault();
								setActive((current + move + items.length) % items.length);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								e.stopPropagation();
								setClosed(a.draft);
								return;
							}
							if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
								e.preventDefault();
								items[current]?.pick();
								return;
							}
						}
						if (e.key !== "Enter" || e.shiftKey) return;
						e.preventDefault();
						const token = TOKEN.exec(a.draft);
						if (token) takeRef(a.draft, token);
						else submit();
					}}
				/>
			</div>
			{files.length > 0 || attachError ? (
				<div className="flex flex-wrap items-center gap-1">
					{files.map((f) => (
						<Badge key={f.name} variant="accent" className="gap-1">
							{f.name}
							<IconButton
								label={format(t.doctor.attach.remove, { name: f.name })}
								onClick={() => setFiles((x) => x.filter((y) => y !== f))}
							>
								<XMarkIcon size={12} />
							</IconButton>
						</Badge>
					))}
					{attachError ? (
						<span role="alert" className="text-12 text-danger-text">
							{attachError}
						</span>
					) : null}
				</div>
			) : null}
			<div className="flex flex-wrap items-center gap-1">
				<input
					ref={picker}
					type="file"
					multiple
					hidden
					data-testid="attach-input"
					onChange={(e) => {
						if (e.target.files) void attach(e.target.files);
						e.target.value = "";
					}}
				/>
				<IconButton
					label={t.doctor.attach.add}
					disabled={!a.current || a.busy}
					onClick={() => picker.current?.click()}
				>
					<PlusIcon size={14} />
				</IconButton>
				{s ? <ModelMenu runners={a.runners} settings={s} onChange={change} /> : null}
				{s ? (
					<Select
						label={t.assistant.permission.label}
						value={s.permission}
						disabled={s.mode !== "agent"}
						// Bypass shows in the danger colour for as long as it is on.
						className={s.permission === "bypass" ? "border-danger text-danger-text" : undefined}
						items={levels.map((p) => ({ value: p, label: t.assistant.permission[p] }))}
						onValueChange={(p) => {
							if (p === "auto") setWarnAuto(true);
							else if (p === "bypass" && !localStorage.getItem(bypassKey)) setWarnBypass(true);
							else void a.setSettings({ permission: p as Permission });
						}}
					/>
				) : null}
				<span className="ml-auto flex items-center gap-2">
					{a.current ? <GaugeView gauge={a.current.gauge} /> : null}
					{a.busy ? (
						<Button onClick={a.stop}>
							<StopIcon size={14} />
							{t.assistant.stop}
						</Button>
					) : (
						<Button variant="primary" disabled={!a.current || !a.draft.trim()} onClick={submit}>
							<PaperAirplaneIcon size={14} />
							{t.assistant.send}
						</Button>
					)}
				</span>
			</div>
		</div>
	);
}
