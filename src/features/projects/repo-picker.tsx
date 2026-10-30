import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, pickFolder, unwrap } from "@/lib/ipc";
import { useProjectActions } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { FolderOpenIcon, PlusIcon } from "@/ui/icons";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A key from a folder name: letters and digits, at most six, `PRJ` when none are left. */
const keyOf = (name: string) =>
	name
		.replace(/[^A-Za-z0-9]/g, "")
		.slice(0, 6)
		.toUpperCase() || "PRJ";

/**
 * Picks the repository to clone: a forge account, its repositories with a search and a marker
 * for the ones that the account cannot push to, a new remote repository and a new local one.
 * Legacy source: `components/repo-picker.tsx` and `new-repo-forms.tsx`.
 */
export function RepoPicker({
	onPick,
	onDone,
}: {
	onPick: (url: string) => void;
	onDone: () => void;
}) {
	const { t } = useI18n();
	const w = t.workspace.picker;
	const qc = useQueryClient();
	const { create } = useProjectActions();
	const accounts = (
		useQuery({
			queryKey: ["connections", "list"],
			queryFn: () => unwrap(commands.connectionsList()),
		}).data ?? []
	).filter((c) => c.group === "forge");
	const [chosen, setChosen] = useState<string | null>(null);
	const account = chosen ?? accounts[0]?.id ?? null;
	const repos = useQuery({
		queryKey: ["connections", "repos", account],
		queryFn: () => unwrap(commands.connectionsRepos(account ?? "", null)),
		enabled: account !== null,
		retry: false,
	});
	const [query, setQuery] = useState("");
	const [slug, setSlug] = useState("");
	const [error, setError] = useState<string | null>(null);
	const fail = (e: unknown) => setError(message(e));
	const found = (repos.data?.items ?? []).filter((r) =>
		r.slug.toLowerCase().includes(query.trim().toLowerCase()),
	);
	const makeRemote = async () => {
		try {
			setError(null);
			const made = await unwrap(commands.connectionsCreateRepo(account ?? "", slug.trim(), true));
			await qc.invalidateQueries({ queryKey: ["connections", "repos", account] });
			setSlug("");
			onPick(made.url);
		} catch (e) {
			fail(e);
		}
	};
	const makeLocal = async () => {
		try {
			setError(null);
			const folder = await pickFolder();
			if (!folder) return;
			const name = folder.split(/[\\/]/).filter(Boolean).pop() ?? "project";
			const out = await create(folder, name, keyOf(name));
			if (out.status === "opened") onDone();
			else setError(out.message ?? out.status);
		} catch (e) {
			fail(e);
		}
	};
	return (
		<div className="flex flex-col gap-2">
			{accounts.length > 0 ? (
				<>
					<Select
						label={w.account}
						value={account ?? ""}
						onValueChange={setChosen}
						items={accounts.map((a) => ({ value: a.id, label: a.name }))}
					/>
					<Input
						label={w.search}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<ul aria-label={w.search} className="flex max-h-40 flex-col overflow-y-auto">
						{found.map((r) => (
							<li key={r.slug} className="flex items-center gap-2">
								<Button
									variant="ghost"
									aria-label={format(w.use, { slug: r.slug })}
									onClick={() => onPick(r.url)}
								>
									<FolderOpenIcon size={14} />
									{r.slug}
								</Button>
								{r.canPush === false ? <Badge variant="warning">{w.cannotPush}</Badge> : null}
							</li>
						))}
					</ul>
					<div className="flex items-end gap-2">
						<Input
							label={w.newRemote}
							placeholder={w.slug}
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
						/>
						<Button disabled={!slug.trim()} onClick={() => void makeRemote()}>
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
