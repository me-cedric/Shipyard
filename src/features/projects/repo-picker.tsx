import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ConnectionForm } from "@/features/settings/connections/connection-form";
import { connectionKeys } from "@/features/settings/connections/keys";
import { format, useI18n } from "@/lib/i18n";
import { commands, pickFolder, type Repository, unwrap } from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { outcomeError, useProjectActions } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ClipboardIcon, LockClosedIcon, PlusIcon } from "@/ui/icons";
import { Loading } from "@/ui/molecules/loading";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The list stops here: a longer list is not loaded. */
export const REPO_CAP = 1000;
const ALL = "*";

/** A key from a folder name: letters and digits, at most six, `PRJ` when none are left. */
const keyOf = (name: string) =>
	name
		.replace(/[^A-Za-z0-9]/g, "")
		.slice(0, 6)
		.toUpperCase() || "PRJ";

/** Every page of the repositories of an account, up to `REPO_CAP`. */
async function allRepos(id: string) {
	const items: Repository[] = [];
	let cursor: string | null = null;
	do {
		const page: { items: Repository[]; next?: string | null } = await unwrap(
			commands.connectionsRepos(id, cursor),
		);
		items.push(...page.items);
		cursor = page.next ?? null;
	} while (cursor && items.length < REPO_CAP);
	return { items: items.slice(0, REPO_CAP), capped: cursor !== null };
}

const ownerOf = (slug: string) => slug.slice(0, slug.lastIndexOf("/"));

/**
 * Picks the repository to clone: an account (a saved connection or a login of `gh` or `glab`),
 * its repositories with one search and an owner filter, a new remote repository and a new local
 * one. A click on a repository, or Enter, clones it into `folder` and opens the project.
 */
export function RepoPicker({ folder, onDone }: { folder: string; onDone?: () => void }) {
	const { t } = useI18n();
	const w = t.workspace.picker;
	const qc = useQueryClient();
	const { create, clone } = useProjectActions();
	const connections = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	});
	const logins = useQuery({
		queryKey: [...connectionKeys.list, "logins"],
		queryFn: () => unwrap(commands.connectionsDetect()),
	});
	const saved = (connections.data ?? []).filter((c) => c.group === "forge");
	// A login that a saved connection already covers is not listed twice.
	const open = (logins.data ?? []).filter((l) => !saved.some((c) => c.url.includes(`//${l.host}`)));
	const [chosen, setChosen] = useState<string | null>(null);
	const account = chosen ?? saved[0]?.id ?? null;
	const repos = useQuery({
		queryKey: ["connections", "repos", account],
		queryFn: () => allRepos(account ?? ""),
		enabled: account !== null,
		retry: false,
	});
	const [query, setQuery] = useState("");
	const [owner, setOwner] = useState(ALL);
	const [active, setActive] = useState(0);
	const [slug, setSlug] = useState("");
	const [adding, setAdding] = useState(false);
	const [cloning, setCloning] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fail = (e: unknown) => setError(message(e));
	const all = repos.data?.items ?? [];
	const owners = [...new Set(all.map((r) => ownerOf(r.slug)))].sort();
	const needle = query.trim().toLowerCase();
	const found = all.filter(
		(r) =>
			(owner === ALL || ownerOf(r.slug) === owner) &&
			`${r.slug} ${r.description}`.toLowerCase().includes(needle),
	);
	// A new search or filter starts at the first row.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on these inputs only
	useEffect(() => setActive(0), [needle, owner, account]);

	const pickAccount = async (value: string) => {
		const rest = value.slice(2);
		if (value.startsWith("c:")) return setChosen(rest);
		const tool = rest.split(":")[0] ?? "";
		try {
			setError(null);
			const made = await unwrap(
				commands.connectionsUseLogin(tool, rest.slice(tool.length + 1), true),
			);
			await qc.invalidateQueries({ queryKey: connectionKeys.list });
			setChosen(made.id);
		} catch (e) {
			fail(e);
		}
	};
	const cloneRepo = async (r: { slug: string; url: string }) => {
		if (!folder) return;
		setError(null);
		setCloning(r.slug);
		try {
			const name = r.slug.split("/").pop() ?? r.slug;
			const out = await clone(r.url, `${folder}/${name}`);
			const failed = outcomeError(t, out);
			if (failed) setError(failed);
			else onDone?.();
		} catch (e) {
			fail(e);
		} finally {
			setCloning(null);
		}
	};
	const makeRemote = async () => {
		setCreating(true);
		try {
			setError(null);
			const made = await unwrap(commands.connectionsCreateRepo(account ?? "", slug.trim(), true));
			await qc.invalidateQueries({ queryKey: ["connections", "repos", account] });
			setSlug("");
			await cloneRepo(made);
		} catch (e) {
			fail(e);
		} finally {
			setCreating(false);
		}
	};
	const makeLocal = async () => {
		try {
			setError(null);
			const picked = await pickFolder();
			if (!picked) return;
			const name = picked.split(/[\\/]/).filter(Boolean).pop() ?? "project";
			const out = await create(picked, name, keyOf(name));
			if (out.status === "opened") onDone?.();
			else setError(out.message ?? out.status);
		} catch (e) {
			fail(e);
		}
	};
	const added = async () => {
		const before = new Set(saved.map((c) => c.id));
		setAdding(false);
		const list = await qc.fetchQuery({
			queryKey: connectionKeys.list,
			queryFn: () => unwrap(commands.connectionsList()),
			staleTime: 0,
		});
		const fresh = list.find((c) => c.group === "forge" && !before.has(c.id));
		if (fresh) setChosen(fresh.id);
	};
	const keys = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			setActive((i) => Math.min(Math.max(i + step, 0), Math.max(found.length - 1, 0)));
		} else if (e.key === "Enter" && found[active] && !cloning && folder) {
			e.preventDefault();
			void cloneRepo(found[active]);
		}
	};

	const accounts = [
		...saved.map((c) => ({
			value: `c:${c.id}`,
			label: `${c.name} (${w.saved})`,
		})),
		...open.map((l) => ({
			value: `l:${l.tool}:${l.host}`,
			label: `${l.user} (${l.tool})`,
		})),
	];
	const none = accounts.length === 0;
	return (
		<div className="flex flex-col gap-2">
			{none ? (
				<div className="flex flex-col gap-1">
					<p className="text-14 font-medium text-n-11">{w.noAccount}</p>
					{["gh auth login", "glab auth login"].map((command) => (
						<div key={command} className="flex items-center gap-2">
							<code className="rounded bg-n-3 px-2 py-1 font-mono text-12">{command}</code>
							<Button
								variant="ghost"
								aria-label={format(w.copy, { command })}
								onClick={() => copyText(command)}
							>
								<ClipboardIcon size={14} />
							</Button>
						</div>
					))}
				</div>
			) : (
				<Select
					label={w.account}
					value={account ? `c:${account}` : ""}
					onValueChange={(v) => void pickAccount(v)}
					items={accounts}
				/>
			)}
			{adding ? (
				<ConnectionForm initialGroup="forge" onDone={() => void added()} />
			) : (
				<div>
					<Button variant="ghost" onClick={() => setAdding(true)}>
						<PlusIcon size={14} />
						{w.addAccount}
					</Button>
				</div>
			)}
			{account !== null ? (
				<>
					<div className="flex items-end gap-2">
						<Input
							label={w.search}
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={keys}
						/>
						{owners.length > 1 ? (
							<Select
								label={w.owner}
								value={owner}
								onValueChange={setOwner}
								items={[
									{ value: ALL, label: w.allOwners },
									...owners.map((o) => ({ value: o, label: o })),
								]}
							/>
						) : null}
					</div>
					{repos.isLoading ? (
						<Loading rows={3} />
					) : (
						<ul aria-label={w.search} className="flex max-h-64 flex-col overflow-y-auto">
							{found.map((r, i) => (
								<li key={r.slug}>
									<button
										type="button"
										aria-label={format(w.use, { slug: r.slug })}
										title={r.description || undefined}
										aria-current={i === active}
										disabled={cloning !== null || !folder}
										onClick={() => void cloneRepo(r)}
										className={cn(
											"flex w-full cursor-pointer flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left hover:bg-n-3 disabled:cursor-not-allowed",
											i === active && "bg-n-3",
										)}
									>
										<span className="flex w-full items-center gap-2 text-ui text-n-12">
											{r.private ? (
												<span role="img" aria-label={w.private} className="flex">
													<LockClosedIcon size={14} />
												</span>
											) : null}
											<span className="min-w-0 flex-1 truncate">{r.slug}</span>
											{r.canPush === false ? <Badge variant="warning">{w.readOnly}</Badge> : null}
											<span className="font-mono text-11 text-n-10">{r.defaultBranch}</span>
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
					{!repos.isLoading && found.length === 0 && !repos.error ? (
						<p className="text-ui text-n-10">{w.none}</p>
					) : null}
					{repos.data?.capped ? (
						<span title={format(w.capped, { count: REPO_CAP })} className="self-start">
							<Badge variant="neutral">{REPO_CAP}+</Badge>
						</span>
					) : null}
					{cloning ? (
						<p role="status" className="text-ui text-n-11">
							{format(w.cloning, { slug: cloning })}
						</p>
					) : null}
					<div className="flex items-end gap-2">
						<Input
							label={w.newRemote}
							placeholder={w.slug}
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
						/>
						<Button disabled={!slug.trim()} busy={creating} onClick={() => void makeRemote()}>
							<PlusIcon size={14} />
							{w.create}
						</Button>
					</div>
				</>
			) : null}
			<div>
				<Button variant="ghost" onClick={() => void makeLocal()}>
					<PlusIcon size={14} />
					{w.newLocal}
				</Button>
			</div>
			{repos.error || error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error ?? message(repos.error)}
				</p>
			) : null}
		</div>
	);
}
