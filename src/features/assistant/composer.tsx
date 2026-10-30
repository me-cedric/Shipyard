import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { mentionAt, slashFor, slashQuery } from "@/lib/assistant/slash";
import { format, useI18n } from "@/lib/i18n";
import { type AssistantMode, type Attachment, commands, type Permission, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useRefSearch } from "@/lib/refs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { PaperAirplaneIcon, PlusIcon, XMarkIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";
import { CodexTrust } from "./codex-trust";
import { ComposerMenu, type MenuItem } from "./composer-menu";
import { GaugeView } from "./gauge";
import type { Assistant } from "./use-assistant";

const MODES: AssistantMode[] = ["ask", "plan", "agent"];
const PERMISSIONS: Permission[] = ["approve", "auto", "read_only"];
const DEFAULT = "default";
// An `@` token that ends the text: the ref that the person typed.
const TOKEN = /(^|\s)@(\S+)$/;

/** The pickers of the thread, the input and the one primary action. */
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
	const levels = readOnly ? PERMISSIONS.filter((p) => p === "read_only") : PERMISSIONS;
	// The slash menu and the `@` menu share one list. Escape closes it until the draft changes.
	const [active, setActive] = useState(0);
	const [closed, setClosed] = useState<string | null>(null);
	const slash = slashQuery(a.draft);
	const at = slash === null ? mentionAt(a.draft) : null;
	const hits = useRefSearch(at?.query ?? "").data;
	const items: MenuItem[] =
		slash !== null
			? slashFor(a.view, slash).map((id) => ({
					id,
					label: `/${id}`,
					pick: () => a.setDraft(t.assistant.slash[id]),
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
	const runner = a.runners.find((r) => r.runner === s?.runner);
	const pick = (list: string[]) => [
		{ value: DEFAULT, label: t.assistant.default },
		...list.map((v) => ({ value: v, label: v })),
	];
	const value = (v: string | null | undefined) => v ?? DEFAULT;
	const back = (v: string) => (v === DEFAULT ? null : v);
	/** A completed `@ref` leaves the text and joins the context. */
	const takeRef = (text: string, end: RegExpExecArray) => {
		a.setDraft(text.slice(0, end.index + (end[1]?.length ?? 0)));
		if (end[2]) void a.addRef(end[2]);
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the Attach file button is the keyboard path
		<div
			className="m-2 mt-0 flex flex-col gap-2 rounded-xl border bg-surface-2 p-2 shadow-1"
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				void attach(e.dataTransfer.files);
			}}
		>
			{s ? (
				<div className="flex flex-wrap gap-1">
					<ToggleGroup
						aria-label={t.assistant.mode.label}
						value={[s.mode]}
						onValueChange={(v) => {
							// A pressed pill stays pressed: one mode is always on.
							if (v[0]) void a.setSettings({ mode: v[0] as AssistantMode });
						}}
						className="flex w-full items-center gap-0.5 rounded-full border bg-n-2 p-0.5"
					>
						{MODES.map((m) => (
							<Toggle
								key={m}
								value={m}
								className="h-6 flex-1 rounded-full px-2 text-12 text-n-11 transition-colors duration-(--duration-fast) hover:text-n-12 data-[pressed]:bg-accent-gradient data-[pressed]:text-accent-fg data-[pressed]:shadow-1"
							>
								{t.assistant.mode[m]}
							</Toggle>
						))}
					</ToggleGroup>
					<Select
						label={t.assistant.runner}
						value={s.runner}
						items={a.runners.map((r) => ({ value: r.runner, label: r.runner }))}
						onValueChange={(r) => void a.setSettings({ runner: r })}
					/>
					<Select
						label={t.assistant.model}
						value={value(s.model)}
						items={pick(runner?.models ?? [])}
						onValueChange={(v) => void a.setSettings({ model: back(v) })}
					/>
					<Select
						label={t.assistant.effort}
						value={value(s.effort)}
						items={pick(runner?.efforts ?? [])}
						onValueChange={(v) => void a.setSettings({ effort: back(v) })}
					/>
					<Select
						label={t.assistant.permission.label}
						value={s.permission}
						disabled={s.mode !== "agent"}
						items={levels.map((p) => ({ value: p, label: t.assistant.permission[p] }))}
						onValueChange={(p) =>
							p === "auto" ? setWarnAuto(true) : void a.setSettings({ permission: p as Permission })
						}
					/>
				</div>
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
			<div className="flex items-center justify-between gap-2">
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
				{a.current ? <GaugeView gauge={a.current.gauge} /> : <span />}
				<IconButton
					label={t.doctor.attach.add}
					disabled={!a.current || a.busy}
					onClick={() => picker.current?.click()}
				>
					<PlusIcon size={14} />
				</IconButton>
				<Button
					variant="primary"
					disabled={!a.current || a.busy || !a.draft.trim()}
					onClick={submit}
				>
					<PaperAirplaneIcon size={14} />
					{t.assistant.send}
				</Button>
			</div>
		</div>
	);
}
