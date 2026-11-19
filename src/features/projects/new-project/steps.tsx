import { type ComponentType, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import type {
	Brief,
	Connection_Serialize,
	CreatorOptions_Serialize,
	CreatorPreview_Serialize,
	NewMember,
	Row_Serialize,
} from "@/lib/ipc";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import {
	ArrowsRightLeftIcon,
	CodeBracketIcon,
	CommandLineIcon,
	CpuChipIcon,
	PlusIcon,
	Squares2X2Icon,
} from "@/ui/icons";
import { Row } from "@/ui/molecules/row";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { Tile } from "@/ui/molecules/tile";
import { FolderField } from "../first-run";
import { ScopePicker } from "../scope-picker";

const NONE = "none";

/**
 * The class of a card of rows. shortcut: `SettingsRow` keeps its control at 20rem; a row whose id
 * starts with `wide-` takes the width of its control. Drop it when the row has a width prop.
 */
export const ROWS = "py-2 [&>[id^=wide-]>div:last-child]:flex-none";

/** One choice of a short list, as radio buttons in a grey track. A choice with a reason is off. */
function Choice({
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
		<div
			role="radiogroup"
			aria-label={label}
			className="inline-flex max-w-full flex-wrap rounded-md bg-n-4 p-1"
		>
			{items.map((i) => (
				<label
					key={i.value}
					title={i.reason}
					className="flex min-h-control cursor-pointer items-center rounded-sm px-3.5 font-medium text-n-10 transition-colors duration-(--duration-fast) hover:text-n-12 has-checked:bg-surface-1 has-checked:text-n-12 has-checked:shadow-1 has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:outline-[length:var(--focus-width,2px)] has-focus-visible:outline-accent"
				>
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
					{i.label}
				</label>
			))}
		</div>
	);
}

type IconProps = { size?: number };
const STACK_ICON: Record<string, ComponentType<IconProps>> = {
	node: CodeBracketIcon,
	rust: CpuChipIcon,
	python: CommandLineIcon,
	java: Squares2X2Icon,
	go: ArrowsRightLeftIcon,
};

/** The name of a stack. The stack with no tool set reads as a plain choice. */
function useStackLabel() {
	const { t } = useI18n();
	return (id: string) => t.creator.stacks[id as keyof typeof t.creator.stacks] ?? id;
}

/** The guided step Kind of product: one tile for each stack. */
export function KindStep({
	options,
	stack,
	setStack,
	className,
}: {
	options: CreatorOptions_Serialize;
	stack: string;
	setStack: (v: string) => void;
	className: string;
}) {
	const { t } = useI18n();
	const label = useStackLabel();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset needs a legend, and the question is the h1
		<div role="group" aria-label={t.creator.guided.kind} className={className}>
			{options.stacks.map((s) => {
				const Icon = STACK_ICON[s.id] ?? PlusIcon;
				return (
					<Tile
						key={s.id}
						icon={<Icon size={24} />}
						label={s.id === "other" ? t.creator.somethingElse : label(s.id)}
						selected={stack === s.id}
						onClick={() => setStack(s.id)}
					/>
				);
			})}
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
	const label = useStackLabel();
	return (
		<>
			<SettingsRow label={t.projects.name}>
				<Input label={t.projects.name} value={p.name} onChange={(e) => p.setName(e.target.value)} />
			</SettingsRow>
			<SettingsRow label={t.creator.key}>
				<Input label={t.creator.key} value={p.keyText} onChange={(e) => p.setKey(e.target.value)} />
			</SettingsRow>
			<SettingsRow id="wide-stack" label={t.creator.stack}>
				{p.options.stacks.map((s) => (
					<Chip key={s.id} selected={p.stack === s.id} onClick={() => p.setStack(s.id)}>
						{label(s.id)}
					</Chip>
				))}
			</SettingsRow>
			<SettingsRow id="wide-folder" label={t.projects.folder}>
				<FolderField path={p.parent} onPick={p.setParent} />
			</SettingsRow>
		</>
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
		<>
			{(["vision", "users", "scope"] as const).map((f) => (
				<SettingsRow key={f} label={t.creator[f]}>
					<Textarea
						label={t.creator[f]}
						value={p.brief[f]}
						onChange={(e) => p.setField(f, e.target.value)}
						rows={f === "vision" ? 2 : 4}
					/>
				</SettingsRow>
			))}
			<SettingsRow id="wide-docs" label={t.creator.docsLang}>
				<LangSelect
					label={t.creator.docsLang}
					value={p.docsLang}
					onChange={p.setDocsLang}
					languages={p.options.languages}
				/>
			</SettingsRow>
			<SettingsRow id="wide-pulls" label={t.creator.pullsLang}>
				<LangSelect
					label={t.creator.pullsLang}
					value={p.pullsLang}
					onChange={p.setPullsLang}
					languages={p.options.languages}
				/>
			</SettingsRow>
		</>
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
		<>
			{members.map((m, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: rows have no id and keep their place
				<Row key={i} className="py-2">
					<span aria-hidden="true" className="flex">
						<Avatar name={m.name || t.creator.member} size="s" />
					</span>
					<Input
						label={`${t.creator.member} ${i + 1}`}
						value={m.name}
						onChange={(e) => edit(i, { name: e.target.value })}
						className="w-auto flex-[1_1_10rem]"
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
					{/* The first member stays: a project starts with one person. */}
					{i > 0 ? (
						<Button
							className="min-h-control"
							aria-label={format(t.creator.removeMember, { name: m.name || String(i + 1) })}
							onClick={() => setMembers(members.filter((_, j) => j !== i))}
						>
							{t.creator.remove}
						</Button>
					) : null}
				</Row>
			))}
			<Row className="justify-end py-2">
				<Button
					className="min-h-control"
					onClick={() => setMembers([...members, { name: "", role: "developer" }])}
				>
					{t.creator.addMember}
				</Button>
			</Row>
		</>
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
	// A new repository needs a code host: the choice shows when one is connected.
	const kinds = (["local", "existing", ...(p.forges.length ? ["create"] : [])] as RemoteKind[]).map(
		(value) => ({ value, label: t.creator.remote[value] }),
	);
	const host = (items: { value: string; label: string }[]) => (
		<SettingsRow label={t.connections.type.forge}>
			<Select
				label={t.connections.type.forge}
				value={p.forge || NONE}
				onValueChange={(v) => p.setForge(v === NONE ? "" : v)}
				items={items}
			/>
		</SettingsRow>
	);
	return (
		<>
			<SettingsRow id="wide-repository" label={t.creator.repository}>
				<Choice
					label={t.creator.repository}
					name="remote"
					value={p.kind}
					onChange={(v) => p.setKind(v as RemoteKind)}
					items={kinds}
				/>
			</SettingsRow>
			{p.kind === "create" ? (
				<SettingsRow label={t.creator.slug}>
					<Input
						label={t.creator.slug}
						value={p.slug}
						onChange={(e) => p.setSlug(e.target.value)}
					/>
				</SettingsRow>
			) : null}
			{p.kind === "existing" ? (
				<SettingsRow label={t.projects.address}>
					<Input
						label={t.projects.address}
						value={p.url}
						onChange={(e) => p.setUrl(e.target.value)}
					/>
				</SettingsRow>
			) : null}
			{p.forges.length === 0 ? (
				<SettingsRow id="wide-host" label={t.connections.type.forge}>
					<Badge variant="you">{t.creator.needCodeHost}</Badge>
					<Button className="min-h-control" onClick={p.connect}>
						{t.creator.addCodeHost}
					</Button>
				</SettingsRow>
			) : p.kind === "existing" ? (
				host([{ value: NONE, label: t.projects.noConnection }, ...hosts])
			) : p.kind === "create" ? (
				host(hosts)
			) : null}
			<SettingsRow label={t.connections.type.tracker}>
				<Select
					label={t.connections.type.tracker}
					value={p.tracker || NONE}
					onValueChange={(v) => p.setTracker(v === NONE ? "" : v)}
					items={[
						{ value: NONE, label: t.projects.noConnection },
						...p.trackers.map((c) => ({ value: c.id, label: c.name })),
					]}
				/>
			</SettingsRow>
			{p.tracker ? (
				<SettingsRow id="wide-scope" label={t.projects.trackerScope}>
					<ScopePicker tracker={p.tracker} value={p.scope} onChange={p.setScope} />
				</SettingsRow>
			) : null}
		</>
	);
}

export function StartStep({
	preview,
	start,
	setStart,
	issues,
	removeIssue,
}: {
	preview: CreatorPreview_Serialize | undefined;
	start: string;
	setStart: (s: string) => void;
	/** The first tickets that Create the tickets makes. */
	issues: Row_Serialize[];
	removeIssue: (reference: string) => void;
}) {
	const { t } = useI18n();
	const [read, setRead] = useState(false);
	const [shown, setShown] = useState<string | null>(null);
	const files = preview?.files ?? [];
	const file = files.find((f) => f.path === shown) ?? files[0];
	const reason: Record<string, string | undefined> = {
		run: t.creator.needCodeHost,
		issues: t.creator.needTracker,
	};
	return (
		<>
			<SettingsRow id="wide-start" label={t.creator.firstMove}>
				<Choice
					label={t.creator.firstMove}
					name="start"
					value={start}
					onChange={setStart}
					items={(["run", "issues", "later"] as const).map((s) => ({
						value: s,
						label: t.creator.starts[s],
						reason: preview && !preview.starts.includes(s) ? reason[s] : undefined,
					}))}
				/>
			</SettingsRow>
			{start === "issues"
				? issues.map((r) => (
						<SettingsRow key={r.reference} label={r.title}>
							<Button
								className="min-h-control"
								aria-label={format(t.creator.removeIssue, { title: r.title })}
								onClick={() => removeIssue(r.reference)}
							>
								{t.creator.remove}
							</Button>
						</SettingsRow>
					))
				: null}
			<SettingsRow label={t.creator.files}>
				<span className="text-n-11">{format(t.creator.fileCount, { count: files.length })}</span>
				<Button className="min-h-control" aria-expanded={read} onClick={() => setRead(!read)}>
					{t.creator.read}
				</Button>
			</SettingsRow>
			{read ? (
				<div className="grid gap-3 border-t border-n-6 px-6 py-4 md:grid-cols-[16rem_1fr]">
					<ul aria-label={t.creator.files} className="flex flex-col gap-0.5">
						{files.map((f) => (
							<li key={f.path}>
								<Button
									variant="ghost"
									aria-current={f === file ? "true" : undefined}
									className="min-h-control w-full justify-start font-mono aria-[current=true]:bg-n-4"
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
			) : null}
		</>
	);
}
