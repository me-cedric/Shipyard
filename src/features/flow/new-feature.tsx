import { Link, useSearch } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { TicketPicker } from "@/features/factory/ticket-picker";
import { useGuard } from "@/features/work/guard";
import { ENDED, useFactoryWrites, useRunActions, useRuns, useWorkflows } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { Right } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { useFormIntent, useShell } from "@/lib/shell";
import { useSpecsActions } from "@/lib/specs";
import { useBacklogActions, useWorkItems } from "@/lib/sync";
import { memberName, useTeam, useWorkActions } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { XMarkIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { TILE_GRID, Tile } from "@/ui/molecules/tile";

type Kind = "feature" | "bug" | "idea";
type Way = "agent" | "mine" | "build";

/** The rights that each way needs: the ticket, the change, the run. */
const NEEDS: Record<Way | "idea", Right[]> = {
	agent: ["work.edit", "specs.edit", "runs.start"],
	mine: ["specs.edit"],
	build: ["work.edit", "runs.start"],
	idea: ["specs.edit"],
};

/** A document for the spec writer: Markdown, PDF or Word, up to 20 MiB (`runs-recipes` REQ-004). */
const DOCUMENT = /\.(md|markdown|pdf|docx?)$/i;
const MAX_DOCUMENT = 20 * 1024 * 1024;

const NO_FILTER = {};
const SHOWN = 5;

/** The recipe has no display name yet: its id, as words with a capital. */
const recipeName = (id: string) => {
	const words = id.replace(/[-_]+/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Flow / New feature (`spec:app-redesign#REQ-003`): one title, a kind, three ways to go on, and the
 * tickets that have no run. Each way first makes a spec change, then calls the commands of the Specs
 * and Factory pages of before.
 */
export function NewFeature() {
	const { t } = useI18n();
	const n = t.flow.new;
	const c = t.flow.look.create;
	const { openRef } = useShell();
	const { gate, person } = useRights();
	const members = useTeam().data?.team.members ?? [];
	const specs = useSpecsActions();
	const work = useWorkActions();
	const { adopt } = useBacklogActions();
	const runs = useRunActions();
	const budgets = useFactoryWrites();
	const workflows = useWorkflows().data ?? [];
	const items = useWorkItems(NO_FILTER).data ?? [];
	const all = useRuns().data;
	const { failure, run: guard } = useGuard();
	const [title, setTitle] = useState("");
	const search: { kind?: "idea" } = useSearch({ strict: false });
	const [kind, setKind] = useState<Kind>(search.kind ?? "feature");
	const [way, setWay] = useState<Way>("agent");
	const [recipe, setRecipe] = useState("");
	const [key, setKey] = useState("");
	const [docs, setDocs] = useState<File[]>([]);
	const [refused, setRefused] = useState<string | null>(null);
	const [limit, setLimit] = useState("");
	const picker = useRef<HTMLInputElement>(null);
	const find = useRef<HTMLInputElement>(null);
	const r = t.factory.runsRecipes;
	const addDocuments = (list: FileList) => {
		setRefused(null);
		for (const f of Array.from(list)) {
			if (!DOCUMENT.test(f.name)) setRefused(format(r.documentKinds, { name: f.name }));
			else if (f.size > MAX_DOCUMENT)
				setRefused(format(r.tooLarge, { name: f.name, size: "20 MiB" }));
			else setDocs((x) => (x.some((d) => d.name === f.name) ? x : [...x, f]));
		}
	};
	// Get started asks to start a run: the old Ticket field is "Find a ticket" here.
	useFormIntent("run", () => find.current?.focus());
	// A ticket with a run that has not ended cannot start another one.
	const live = useMemo(
		() => new Map((all ?? []).filter((r) => !ENDED.includes(r.state)).map((r) => [r.key, r.id])),
		[all],
	);
	const skip = useMemo(() => new Set(live.keys()), [live]);
	// The typed key of a ticket that has a live run: refuse it and link that run.
	const taken = live.get(key.trim());
	const free = items.filter((i) => !skip.has(i.key) && i.category !== "done");
	const chosen = recipe || workflows[0]?.id || "";
	const mode = kind === "idea" ? "idea" : way;
	// The first right that the person lacks turns Create off, with its reason.
	const off = NEEDS[mode].map(gate).find((g) => g.disabled);
	// The ticket cites the change by its ref `change:<id>`, a real ref. The kind goes on it as a label.
	const ticket = async (change: string) => {
		const row = await work.createItem({
			reference: `change:${change}`,
			kind: "story",
			title: title.trim(),
			description: "",
		});
		if (row.error || !row.key) throw new Error(row.error ?? "no ticket");
		// The new ticket is not in the mirror yet: a run needs it there.
		await adopt(row.key);
		await work.addLabel(row.key, kind);
		return row.key;
	};
	// Each way first makes the change. Its title is the text of the person, so the proposal holds it.
	const create = async () => {
		// The limit of the feature goes in the file by its ticket key: it needs a ticket.
		const usd = limit.trim() === "" ? null : Number(limit);
		if (usd !== null && !(Number.isFinite(usd) && usd > 0)) throw new Error(r.limitError);
		const made = (await specs.createChange(title.trim())).id;
		for (const f of docs)
			await specs.addInput(made, f.name, Array.from(new Uint8Array(await f.arrayBuffer())));
		const limited = async (k: string) => {
			if (usd !== null) await budgets.budget("feature", k, usd);
			return k;
		};
		if (mode === "build") await runs.start(await limited(await ticket(made)));
		else if (mode === "agent") await specs.delegate(await limited(await ticket(made)), chosen);
		openRef(`change:${made}`);
	};
	const start = (k: string) =>
		void guard(async () => {
			if (live.has(k.trim())) return;
			openRef(`run:${await runs.start(k)}`);
			setKey("");
		});
	return (
		<div className="mx-auto flex w-full max-w-200 flex-col gap-5 p-6">
			<BackLink label={c.back} render={(props) => <Link to="/flow/flow" {...props} />} />
			<h1 className="text-44 font-semibold text-n-12">{n.heading}</h1>
			<Textarea
				autoFocus
				label={n.title}
				className="min-h-40 rounded-xl border-2 border-accent p-5 text-20 focus-visible:outline-none"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<fieldset aria-label={n.kind} className="flex min-w-0 flex-wrap gap-2">
					{(["feature", "bug", "idea"] as const).map((id) => (
						<Chip
							key={id}
							selected={id === kind}
							className={id === kind ? undefined : "bg-surface-2"}
							onClick={() => setKind(id)}
						>
							{n.kinds[id]}
						</Chip>
					))}
				</fieldset>
				<input
					ref={picker}
					type="file"
					multiple
					hidden
					data-testid="document-input"
					onChange={(e) => {
						if (e.target.files) addDocuments(e.target.files);
						e.target.value = "";
					}}
				/>
				<Button variant="ghost" onClick={() => picker.current?.click()}>
					{r.addDocument}
				</Button>
			</div>
			{docs.length > 0 ? (
				<ul aria-label={r.addDocument} className="flex flex-wrap gap-2">
					{docs.map((d) => (
						<li key={d.name}>
							<Badge variant="accent" className="gap-1">
								{d.name}
								<IconButton
									label={format(r.removeDocument, { name: d.name })}
									onClick={() => setDocs((x) => x.filter((y) => y !== d))}
								>
									<XMarkIcon size={12} />
								</IconButton>
							</Badge>
						</li>
					))}
				</ul>
			) : null}
			{refused ? (
				<p role="alert" className="text-ui text-danger-text">
					{refused}
				</p>
			) : null}
			{kind === "idea" ? null : (
				<fieldset aria-label={n.way} className={TILE_GRID}>
					{(["agent", "mine", "build"] as const).map((id) => (
						<Tile
							key={id}
							selected={id === way}
							// The design shows the avatar with no tile behind it: Tile draws one, so strip it here.
							className="[&>span:first-child]:size-auto [&>span:first-child]:justify-start [&>span:first-child]:bg-transparent"
							onClick={() => setWay(id)}
							icon={
								<Avatar
									name={
										id === "mine"
											? person?.member
												? memberName(members, person.member)
												: c.avatars[id]
											: c.avatars[id]
									}
									agent={id !== "mine"}
								/>
							}
							label={n.ways[id]}
						/>
					))}
				</fieldset>
			)}
			<div className="flex flex-wrap items-center gap-3">
				{mode === "agent" ? (
					<>
						<span className="text-n-11">{n.recipe}</span>
						<Select
							label={n.recipe}
							value={chosen}
							className="font-semibold"
							onValueChange={setRecipe}
							items={workflows.map((w) => ({ value: w.id, label: recipeName(w.id) }))}
						/>
					</>
				) : null}
				{mode === "agent" || mode === "build" ? (
					<>
						<span className="text-n-11">{r.limit}</span>
						<span aria-hidden="true">$</span>
						<Input
							label={r.limitAmount}
							type="number"
							min="0"
							step="any"
							className="w-24 font-semibold"
							value={limit}
							onChange={(e) => setLimit(e.target.value)}
						/>
					</>
				) : null}
				<Button
					variant="primary"
					size="lg"
					className="ml-auto min-w-40 disabled:opacity-100"
					disabled={title.trim() === "" || off !== undefined}
					reason={off?.reason}
					onClick={() => void guard(create)}
				>
					{n.create}
				</Button>
			</div>
			<ErrorNotice error={failure} />
			<section
				aria-label={n.fromTicket}
				className="flex flex-col gap-1 rounded-lg bg-surface-2 py-2 shadow-2"
			>
				<h2 className="px-6 pt-3 pb-1.5 text-13 font-semibold text-n-11">{n.fromTicket}</h2>
				<ul className="flex flex-col">
					{free.slice(0, SHOWN).map((i) => (
						<li key={i.key} className="flex min-h-control items-center gap-3 px-6">
							<span className="min-w-0 flex-1 truncate font-semibold">{i.title}</span>
							<Badge>{i.kind}</Badge>
							<RightButton
								right="runs.start"
								className="min-h-control"
								aria-label={`${n.startAgent} ${i.key}`}
								onClick={() => start(i.key)}
							>
								{n.startAgent}
							</RightButton>
						</li>
					))}
				</ul>
				<div className="flex items-center gap-2 px-6 pt-1">
					<TicketPicker
						ref={find}
						label={n.find}
						className="min-h-control"
						value={key}
						onChange={setKey}
						onSubmit={() => start(key)}
						skip={skip}
					/>
					{key ? (
						<RightButton right="runs.start" className="min-h-control" onClick={() => start(key)}>
							{n.startAgent}
						</RightButton>
					) : null}
				</div>
				{taken ? (
					<p role="alert" className="flex items-center gap-2 px-6 pt-1 text-danger-text">
						{format(t.factory.runActive, { key: key.trim() })}
						<Button className="min-h-control" onClick={() => openRef(`run:${taken}`)}>
							{t.factory.openRun}
						</Button>
					</p>
				) : null}
			</section>
		</div>
	);
}
