import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton, RightIconButton } from "@/lib/rights";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { ArrowPathIcon, XMarkIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";

export const learningKey = ["knowledge", "learning"] as const;
const feedsKey = ["knowledge", "learning", "feeds"] as const;

/** Opens an address in the browser of the system. The backend accepts http and https only. */
export const openAddress = (url: string) => void unwrap(commands.openLink(url)).catch(() => {});

/** A card of the Learn page: a small title, an optional toolbar, then the body. */
export function LearnCard({
	title,
	toolbar,
	children,
}: {
	title: string;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card pad className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-center gap-2.5">
				<h2 className="mr-auto text-13 font-semibold text-n-11">{title}</h2>
				{toolbar}
			</div>
			{children}
		</Card>
	);
}

/**
 * The feeds of the project. The backend reads them and gives plain text: no HTML of a feed reaches
 * the view. A feed that fails shows its error and keeps its last copy.
 */
export function LearnFeeds() {
	const { t, code } = useI18n();
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
		<LearnCard
			title={k.feeds}
			toolbar={
				<IconButton
					label={k.refresh}
					disabled={refreshing || rows.length === 0}
					onClick={() => void run(refresh)}
				>
					<ArrowPathIcon size={14} />
				</IconButton>
			}
		>
			<ErrorNotice error={failure} />
			{rows.map((f) => {
				const name = f.feed.title || f.url;
				return (
					<section key={f.url} aria-label={name} className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<h3 className="min-w-0 flex-1 truncate font-medium text-ui text-n-12">{name}</h3>
							<RightIconButton
								right="knowledge.edit"
								label={format(k.unsubscribe, { name })}
								onClick={() =>
									void run(async () => {
										await unwrap(commands.learningFeedRemove(f.url, true));
										await reload();
									})
								}
							>
								<XMarkIcon size={14} />
							</RightIconButton>
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
											className="truncate rounded-sm text-left text-ui font-semibold text-accent"
										>
											{item.title}
										</button>
									) : (
										<span className="truncate text-ui text-n-12">{item.title}</span>
									)}
									{item.published ? (
										<span className="text-12 text-n-10">
											{Number.isNaN(Date.parse(item.published))
												? item.published
												: new Date(item.published).toLocaleDateString(code, { dateStyle: "long" })}
										</span>
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
				<RightButton right="knowledge.edit" type="submit" disabled={!url.trim()}>
					{k.subscribe}
				</RightButton>
			</form>
		</LearnCard>
	);
}
