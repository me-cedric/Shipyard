import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { ArrowPathIcon, LinkIcon, PlusIcon, XMarkIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";

export const learningKey = ["knowledge", "learning"] as const;
const feedsKey = ["knowledge", "learning", "feeds"] as const;

/** Opens an address in the browser of the system. The backend accepts http and https only. */
export const openAddress = (url: string) => void unwrap(commands.openLink(url)).catch(() => {});

/**
 * The feeds of the project. The backend reads them and gives plain text: no HTML of a feed reaches
 * the view. A feed that fails shows its error and keeps its last copy.
 */
export function LearnFeeds() {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const [url, setUrl] = useState("");
	const [refreshing, setRefreshing] = useState(false);
	const feeds = useQuery({
		queryKey: feedsKey,
		queryFn: () => unwrap(commands.learningFeedsRead(false)),
	});
	const reload = () => qc.invalidateQueries({ queryKey: learningKey });
	const refresh = async () => {
		setRefreshing(true);
		try {
			qc.setQueryData(feedsKey, await unwrap(commands.learningFeedsRead(true)));
		} finally {
			setRefreshing(false);
		}
	};
	const rows = feeds.data ?? [];
	return (
		<Panel
			title={k.feeds}
			count={rows.length}
			icon={<LinkIcon size={14} />}
			toolbar={
				<IconButton
					label={k.refresh}
					disabled={refreshing || rows.length === 0}
					onClick={() => void run(refresh)}
				>
					<ArrowPathIcon size={14} />
				</IconButton>
			}
			bodyClassName="flex flex-col gap-3 p-3"
		>
			<form
				className="flex items-end gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void run(async () => {
						await unwrap(commands.learningFeedAdd(url.trim(), true));
						setUrl("");
						await reload();
					});
				}}
			>
				<Input
					label={k.feedAddress}
					type="url"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
				/>
				<Button type="submit" disabled={!url.trim()}>
					<PlusIcon size={14} />
					{k.subscribe}
				</Button>
			</form>
			<ErrorNotice error={failure} />
			{rows.map((f) => {
				const name = f.feed.title || f.url;
				return (
					<section key={f.url} aria-label={name} className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<h3 className="min-w-0 flex-1 truncate font-medium text-ui text-n-12">{name}</h3>
							<IconButton
								label={format(k.unsubscribe, { name })}
								onClick={() =>
									void run(async () => {
										await unwrap(commands.learningFeedRemove(f.url, true));
										await reload();
									})
								}
							>
								<XMarkIcon size={14} />
							</IconButton>
						</div>
						<ErrorNotice error={f.error} />
						<ul className="flex flex-col">
							{f.feed.items.map((item) => (
								<li
									key={`${item.link}-${item.title}`}
									className="flex flex-col gap-0.5 border-b py-1.5 last:border-b-0"
								>
									{item.link ? (
										<button
											type="button"
											onClick={() => openAddress(item.link)}
											className="truncate rounded-sm text-left text-ui text-n-12 hover:underline"
										>
											{item.title}
										</button>
									) : (
										<span className="truncate text-ui text-n-12">{item.title}</span>
									)}
									{item.published ? (
										<span className="font-mono text-12 text-n-10">{item.published}</span>
									) : null}
									{item.summary ? (
										<span className="line-clamp-2 text-12 text-n-11">{item.summary}</span>
									) : null}
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</Panel>
	);
}
