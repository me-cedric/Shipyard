import { useQuery } from "@tanstack/react-query";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { mentionAt, slashQuery } from "@/lib/assistant/slash";
import { format, useI18n } from "@/lib/i18n";
import { type AssistantMode, type Attachment, commands, type Permission, unwrap } from "@/lib/ipc";
import { useRefSearch } from "@/lib/refs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { PaperAirplaneIcon, PlusIcon, StopIcon, XMarkIcon } from "@/ui/icons";
import { CodexTrust } from "./codex-trust";
import { ComposerMenu, type MenuItem } from "./composer-menu";
import { ContextBar } from "./context";
import { SendToFactory } from "./factory-dialog";
import { GaugeBars, GaugeView } from "./gauge";
import { ModelMenu } from "./model-menu";
import { usePermission } from "./permission";
import type { Assistant } from "./use-assistant";

const MODES: AssistantMode[] = ["ask", "plan", "agent"];
/** The three levels of the full page. Bypass shows as Alone; its own switch is in the tools column. */
const LEVELS = ["read_only", "approve", "auto"] as const;
const LEVEL_LABEL = (t: ReturnType<typeof useI18n>["t"]) => ({
	read_only: t.assistant.permission.read_only,
	approve: t.assistant.page.asksFirst,
	auto: t.assistant.page.alone,
});
// An `@` token that ends the text: the ref that the person typed.
const TOKEN = /(^|\s)@(\S+)$/;

/**
 * The message box, and one bar under it: attach, model, permission, context ring and the one primary action.
 * `full` is the composer of the Ask page: the context chips on top, two segmented controls and two bars.
 */
export function Composer({
	a,
	inputRef,
	full,
	onOpenRef,
}: {
	a: Assistant;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	full?: boolean;
	/** The context chips of the full composer open a ref with it. */
	onOpenRef?: (ref: string) => void;
}): ReactNode {
	const { t } = useI18n();
	const listId = useId();
	const { readOnly, levels, pick, change, dialogs } = usePermission(a);
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
	const mode = s ? (
		<Segmented
			label={t.assistant.mode.label}
			value={s.mode}
			onValueChange={(mode) => void a.setSettings({ mode })}
			items={MODES.map((m) => ({ value: m, label: t.assistant.mode[m] }))}
		/>
	) : null;
	const send = a.busy ? (
		<Button onClick={a.stop}>
			<StopIcon size={14} />
			{t.assistant.stop}
		</Button>
	) : (
		<Button variant="primary" disabled={!a.current || !a.draft.trim()} onClick={submit}>
			<PaperAirplaneIcon size={14} />
			{t.assistant.send}
		</Button>
	);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the Attach file button is the keyboard path
		<div
			data-drop-zone
			className={
				full
					? "flex flex-col gap-3 rounded-lg bg-surface-2 p-3.5 shadow-2"
					: "m-2 mt-0 flex flex-col gap-2 rounded-xl border bg-surface-2 p-2 shadow-1"
			}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				void attach(e.dataTransfer.files);
			}}
		>
			{full ? (
				<ContextBar
					a={a}
					full
					onAdd={() => picker.current?.click()}
					onOpenRef={onOpenRef ?? (() => {})}
				/>
			) : (
				mode
			)}
			{!full && s?.runner === "codex" ? <CodexTrust /> : null}
			{dialogs}
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
					rows={full ? 1 : 3}
					className={full ? "min-h-13 resize-none" : undefined}
					placeholder={full ? t.assistant.message : undefined}
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
			{full ? (
				<>
					<div className="flex flex-wrap items-center gap-2.5">
						<div className="flex-none">{mode}</div>
						{s ? (
							<div className="flex-none">
								<Segmented
									label={t.assistant.permission.label}
									value={s.permission === "bypass" ? "auto" : s.permission}
									onValueChange={pick}
									items={LEVELS.filter((p) => levels.includes(p)).map((p) => ({
										value: p,
										label: LEVEL_LABEL(t)[p],
									}))}
								/>
							</div>
						) : null}
						{s ? <ModelMenu split runners={a.runners} settings={s} onChange={change} /> : null}
						<span className="ml-auto flex flex-wrap items-center gap-2.5">
							<SendToFactory a={a} variant="secondary" />
							{send}
						</span>
					</div>
					{a.current ? <GaugeBars gauge={a.current.gauge} /> : null}
				</>
			) : (
				<div className="flex flex-wrap items-center gap-1">
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
							onValueChange={(p) => pick(p as Permission)}
						/>
					) : null}
					<span className="ml-auto flex items-center gap-2">
						{a.current ? <GaugeView gauge={a.current.gauge} /> : null}
						{send}
					</span>
				</div>
			)}
		</div>
	);
}
