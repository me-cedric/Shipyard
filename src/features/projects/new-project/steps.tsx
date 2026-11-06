import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import type {
	Brief,
	Connection_Serialize,
	CreatorOptions_Serialize,
	CreatorPreview_Serialize,
	NewMember,
} from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { PlusIcon, TrashIcon } from "@/ui/icons";
import { FolderField } from "../first-run";
import { ScopePicker } from "../scope-picker";

const NONE = "none";
const CARD =
	"flex h-12 cursor-pointer items-center gap-2.5 rounded-lg border bg-surface-2 px-3 text-ui text-n-12 shadow-1 transition-colors duration-(--duration-fast) hover:bg-n-3 has-checked:border-accent has-checked:bg-accent-soft has-checked:shadow-glow has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:outline-[length:var(--focus-width,2px)] has-focus-visible:outline-accent";

/** Radio cards: one choice, the arrow keys move it. A choice with a reason is off. */
function Cards({
	label,
	name,
	value,
	onChange,
	items,
}: {
	label: string;
	name: string;
	value: string;
	onChange: (value: string) => void;
	items: { value: string; label: string; reason?: string }[];
}) {
	return (
		<div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{items.map((i) => (
				<label key={i.value} title={i.reason} className={CARD}>
					<input
						type="radio"
						name={name}
						value={i.value}
						checked={value === i.value}
						disabled={i.reason !== undefined}
						aria-description={i.reason}
						onChange={() => onChange(i.value)}
						className="sr-only"
					/>
					<span className="min-w-0 truncate">{i.label}</span>
				</label>
			))}
		</div>
	);
}

export function ProjectStep(p: {
	options: CreatorOptions_Serialize;
	name: string;
	setName: (v: string) => void;
	keyText: string;
	setKey: (v: string) => void;
	parent: string;
	setParent: (v: string) => void;
	stack: string;
	setStack: (v: string) => void;
}) {
	const { t } = useI18n();
	return (
		<div className="flex max-w-xl flex-col gap-3">
			<Input label={t.projects.name} value={p.name} onChange={(e) => p.setName(e.target.value)} />
			<Input label={t.creator.key} value={p.keyText} onChange={(e) => p.setKey(e.target.value)} />
			<FolderField path={p.parent} onPick={p.setParent} />
			<Cards
				label={t.creator.stack}
				name="stack"
				value={p.stack}
				onChange={p.setStack}
				items={p.options.stacks.map((s) => ({
					value: s.id,
					label: t.creator.stacks[s.id as keyof typeof t.creator.stacks] ?? s.id,
				}))}
			/>
		</div>
	);
}

export function LangSelect({
	label,
	value,
	onChange,
	languages,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	languages: string[];
}) {
	const { t } = useI18n();
	return (
		<Select
			label={label}
			value={value}
			onValueChange={onChange}
			items={languages.map((l) => ({
				value: l,
				label: t.creator.lang[l as keyof typeof t.creator.lang] ?? l,
			}))}
			className="w-48"
		/>
	);
}

export function BriefStep(p: {
	options: CreatorOptions_Serialize;
	docsLang: string;
	setDocsLang: (v: string) => void;
	pullsLang: string;
	setPullsLang: (v: string) => void;
	brief: Brief;
	setField: (field: keyof Brief, value: string) => void;
}) {
	const { t } = useI18n();
	return (
		<div className="flex max-w-xl flex-col gap-3">
			<div className="flex gap-2">
				<LangSelect
					label={t.creator.docsLang}
					value={p.docsLang}
					onChange={p.setDocsLang}
					languages={p.options.languages}
				/>
				<LangSelect
					label={t.creator.pullsLang}
					value={p.pullsLang}
					onChange={p.setPullsLang}
					languages={p.options.languages}
				/>
			</div>
			{(["vision", "users", "scope"] as const).map((f) => (
				<Textarea
					key={f}
					label={t.creator[f]}
					value={p.brief[f]}
					onChange={(e) => p.setField(f, e.target.value)}
					rows={f === "vision" ? 2 : 4}
				/>
			))}
		</div>
	);
}

export function TeamStep({
	options,
	members,
	setMembers,
}: {
	options: CreatorOptions_Serialize;
	members: NewMember[];
	setMembers: (m: NewMember[]) => void;
}) {
	const { t } = useI18n();
	const edit = (i: number, patch: Partial<NewMember>) =>
		setMembers(members.map((m, j) => (j === i ? { ...m, ...patch } : m)));
	return (
		<div className="flex max-w-xl flex-col gap-2">
			{members.map((m, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: rows have no id and keep their place
				<div key={i} className="flex items-center gap-2">
					<Input
						label={`${t.creator.member} ${i + 1}`}
						value={m.name}
						onChange={(e) => edit(i, { name: e.target.value })}
					/>
					<Select
						label={`${t.prefs.role} ${i + 1}`}
						value={m.role}
						onValueChange={(role) => edit(i, { role })}
						items={options.roles.map((r) => ({
							value: r,
							label: t.creator.role[r as keyof typeof t.creator.role] ?? r,
						}))}
						className="w-48"
					/>
					{i > 0 ? (
						<IconButton
							label={format(t.creator.removeMember, { name: m.name || String(i + 1) })}
							onClick={() => setMembers(members.filter((_, j) => j !== i))}
						>
							<TrashIcon size={14} />
						</IconButton>
					) : (
						<span className="size-row shrink-0" />
					)}
				</div>
			))}
			<div>
				<Button onClick={() => setMembers([...members, { name: "", role: "developer" }])}>
					<PlusIcon size={14} />
					{t.creator.addMember}
				</Button>
			</div>
		</div>
	);
}

export type RemoteKind = "local" | "existing" | "create";

export function RemoteStep(p: {
	kind: RemoteKind;
	setKind: (k: RemoteKind) => void;
	forges: Connection_Serialize[];
	trackers: Connection_Serialize[];
	url: string;
	setUrl: (v: string) => void;
	forge: string;
	setForge: (v: string) => void;
	slug: string;
	setSlug: (v: string) => void;
	tracker: string;
	setTracker: (v: string) => void;
	scope: string;
	setScope: (v: string) => void;
	connect: () => void;
}) {
	const { t } = useI18n();
	const hosts = p.forges.map((c) => ({ value: c.id, label: c.name }));
	const kinds = (["local", "existing", ...(p.forges.length ? ["create"] : [])] as RemoteKind[]).map(
		(value) => ({ value, label: t.creator.remote[value] }),
	);
	const host = (items: { value: string; label: string }[]) => (
		<Select
			label={t.connections.type.forge}
			value={p.forge || NONE}
			onValueChange={(v) => p.setForge(v === NONE ? "" : v)}
			items={items}
			className="w-64"
		/>
	);
	return (
		<div className="flex max-w-xl flex-col gap-3">
			<Segmented
				label={t.creator.step.remote}
				value={p.kind}
				onValueChange={p.setKind}
				items={kinds}
			/>
			{p.kind === "existing" ? (
				<>
					<Input
						label={t.projects.address}
						value={p.url}
						onChange={(e) => p.setUrl(e.target.value)}
					/>
					{host([{ value: NONE, label: t.projects.noConnection }, ...hosts])}
				</>
			) : null}
			{p.kind === "create" ? (
				<>
					{host(hosts)}
					<Input
						label={t.creator.slug}
						value={p.slug}
						onChange={(e) => p.setSlug(e.target.value)}
					/>
				</>
			) : null}
			{p.forges.length === 0 ? (
				<div>
					<Button onClick={p.connect}>
						<PlusIcon size={14} />
						{t.creator.addCodeHost}
					</Button>
				</div>
			) : null}
			<Select
				label={t.connections.type.tracker}
				value={p.tracker || NONE}
				onValueChange={(v) => p.setTracker(v === NONE ? "" : v)}
				items={[
					{ value: NONE, label: t.projects.noConnection },
					...p.trackers.map((c) => ({ value: c.id, label: c.name })),
				]}
				className="w-64"
			/>
			{p.tracker ? <ScopePicker tracker={p.tracker} value={p.scope} onChange={p.setScope} /> : null}
		</div>
	);
}

export function StartStep({
	preview,
	start,
	setStart,
}: {
	preview: CreatorPreview_Serialize | undefined;
	start: string;
	setStart: (s: string) => void;
}) {
	const { t } = useI18n();
	const [shown, setShown] = useState<string | null>(null);
	const files = preview?.files ?? [];
	const file = files.find((f) => f.path === shown) ?? files[0];
	const reason: Record<string, string | undefined> = {
		run: t.creator.needCodeHost,
		issues: t.creator.needTracker,
	};
	return (
		<div className="flex min-h-0 flex-col gap-3">
			<Cards
				label={t.creator.start}
				name="start"
				value={start}
				onChange={setStart}
				items={(["run", "issues", "later"] as const).map((s) => ({
					value: s,
					label: t.creator.starts[s],
					reason: preview && !preview.starts.includes(s) ? reason[s] : undefined,
				}))}
			/>
			<div className="grid min-h-0 gap-3 md:grid-cols-[16rem_1fr]">
				<ul aria-label={t.creator.files} className="flex flex-col gap-0.5">
					{files.map((f) => (
						<li key={f.path}>
							<Button
								variant="ghost"
								aria-current={f === file ? "true" : undefined}
								className="w-full justify-start font-mono aria-[current=true]:bg-n-4"
								onClick={() => setShown(f.path)}
							>
								{f.path}
							</Button>
						</li>
					))}
				</ul>
				{file ? (
					<Textarea
						label={format(t.creator.text, { path: file.path })}
						value={file.content}
						readOnly
						rows={16}
						className="h-full font-mono"
					/>
				) : null}
			</div>
		</div>
	);
}
