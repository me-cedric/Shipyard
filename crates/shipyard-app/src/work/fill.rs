//! Fill from my work (`shell-setup-rights` REQ-005): time entries from the runs of the tickets of
//! a person and from the commits of the person on one day. The entries are the person's to edit:
//! the sheet saves a change when the person leaves a field.

use serde::Serialize;
use specta::Type;

use super::*;

/// One run of a ticket of the person, on the day: the ticket, the title and how long it ran.
#[derive(Debug, Clone, PartialEq)]
struct RunPart {
    key: String,
    title: String,
    minutes: u32,
}

/// What a Fill wrote: the entries that are new.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct Filled {
    pub entries: Vec<TimeEntry>,
}

/// The least that a run counts, and the most: five minutes to eight hours, in steps of five.
fn run_minutes(first_ms: u64, last_ms: u64) -> u32 {
    let m = last_ms.saturating_sub(first_ms).div_ceil(60_000);
    (m.div_ceil(5) * 5).clamp(5, 480) as u32
}

/// shortcut: 15 minutes for each commit, a guess. The person edits it. Use the time between the
/// commits when a guess is not enough.
const COMMIT_MINUTES: u32 = 15;
const MAX_COMMIT_MINUTES: u32 = 120;

/// The key of a ticket in a commit message: `PROJ-5` in `PROJ-5 add export`.
fn key_in(text: &str, known: &[String]) -> Option<String> {
    text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
        .find(|w| known.iter().any(|k| k == w))
        .map(String::from)
}

/// The rows of a Fill: one for each run, one for the commits of each ticket, one for the commits
/// with no known ticket. A row that the day has already (same ticket and note) is left out, so a
/// second Fill adds nothing.
fn plan(
    runs: &[RunPart],
    commits: &[String],
    known: &[String],
    have: &[TimeEntry],
) -> Vec<(Option<String>, String, u32)> {
    let mut rows: Vec<(Option<String>, String, u32)> = runs
        .iter()
        .map(|r| (Some(r.key.clone()), r.title.clone(), r.minutes))
        .collect();
    let mut grouped: Vec<(Option<String>, Vec<&str>)> = Vec::new();
    for summary in commits {
        let key = key_in(summary, known);
        match grouped.iter_mut().find(|(k, _)| *k == key) {
            Some((_, list)) => list.push(summary),
            None => grouped.push((key, vec![summary])),
        }
    }
    for (key, list) in grouped {
        let minutes = (list.len() as u32 * COMMIT_MINUTES).min(MAX_COMMIT_MINUTES);
        rows.push((key, list.join("; ").chars().take(200).collect(), minutes));
    }
    rows.retain(|(key, note, _)| {
        !have
            .iter()
            .any(|e| e.ticket == *key && e.note.trim() == note.trim())
    });
    rows
}

/// True when this assignee is the member: by handle, account or e-mail, or by name.
fn is_mine(team: &work::Team, member: &str, who: &shipyard_core::work_item::Person) -> bool {
    [who.id.as_str(), who.name.as_str()]
        .into_iter()
        .any(|id| team.resolve(id).is_some_and(|m| m.handle == member))
}

/// The runs of this project that ran on `day` for a ticket of the member.
fn runs_of(s: &AppState, c: &Ctx, member: &str, day: &str, items: &[WorkItem]) -> Vec<RunPart> {
    let team = c.team().team;
    let offset = s.work.offset.load(Ordering::Relaxed);
    let log = s.factory.log();
    s.factory
        .factory
        .runs()
        .into_iter()
        .filter(|r| r.project == c.project)
        .filter(|r| {
            items
                .iter()
                .find(|i| i.key == r.key)
                .and_then(|i| i.assignee.as_ref())
                .is_some_and(|who| is_mine(&team, member, who))
        })
        .filter_map(|r| {
            let events = log.run(&r.id).ok()?;
            let (first, last) = (events.first()?.ts, events.last()?.ts);
            (local_day(first / 1000, offset) == day).then(|| RunPart {
                key: r.key,
                title: r.title,
                minutes: run_minutes(first, last),
            })
        })
        .collect()
}

/// The summaries of the commits of the person on `day`, newest first. The person is the git
/// e-mail of the repository.
fn commits_of(s: &AppState, c: &Ctx, day: &str) -> Vec<String> {
    let offset = s.work.offset.load(Ordering::Relaxed);
    let Ok(repo) = Repo::open(&c.root) else {
        return Vec::new();
    };
    let Some(email) = repo.user_email() else {
        return Vec::new();
    };
    let Ok(page) = repo.log(0, 300) else {
        return Vec::new();
    };
    page.commits
        .into_iter()
        .filter(|k| k.author_email.trim().eq_ignore_ascii_case(&email))
        .filter(|k| local_day(u64::from(k.time), offset) == day)
        .map(|k| k.summary)
        .collect()
}

/// Make the entries of a day from the work of the member. It needs the click of a person and
/// `work.edit`, like any entry. It sends nothing to the issue tracker.
pub fn time_fill(s: &AppState, member: Option<&str>, day: &str, click: bool) -> Res<Filled> {
    need_click(s, click, Right::WorkEdit, "time_fill", "")?;
    let c = ctx(s)?;
    let handle = member_of(&c, member)?;
    // The commits are read with the git e-mail of this computer: only the signed-in person fills.
    let team = c.team().team;
    if me_of(&conn_of(s)?, &team, &c.root).as_deref() != Some(handle.as_str()) {
        return Err("Fill from my work fills only your own sheet".into());
    }
    let items = tracker(s)
        .and_then(|t| mirror_items(s, &t))
        .unwrap_or_default();
    let known: Vec<String> = items.iter().map(|i| i.key.clone()).collect();
    let have: Vec<TimeEntry> = month_entries(&c, &handle, &day[..day.len().min(7)])?
        .into_iter()
        .filter(|e| e.day == day)
        .collect();
    let rows = plan(
        &runs_of(s, &c, &handle, day, &items),
        &commits_of(s, &c, day),
        &known,
        &have,
    );
    let mut entries = Vec::new();
    for (ticket, note, minutes) in rows {
        entries.push(time_write(
            s,
            Some(&handle),
            day,
            minutes,
            &note,
            ticket.as_deref(),
        )?);
    }
    Ok(Filled { entries })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::tests::fx;

    fn run(key: &str, title: &str, minutes: u32) -> RunPart {
        RunPart {
            key: key.into(),
            title: title.into(),
            minutes,
        }
    }

    #[test]
    fn a_run_counts_from_five_minutes_to_eight_hours_in_steps_of_five() {
        assert_eq!(run_minutes(0, 0), 5);
        assert_eq!(run_minutes(0, 61_000), 5);
        assert_eq!(run_minutes(0, 6 * 60_000), 10);
        assert_eq!(run_minutes(0, 20 * 3_600_000), 480);
        assert_eq!(run_minutes(9, 3), 5, "a clock that runs back");
    }

    #[test]
    fn the_rows_hold_the_run_and_the_commits_by_ticket_and_a_second_fill_adds_none() {
        let known = vec!["PROJ-5".to_string()];
        let commits = [
            "PROJ-5 add export".to_string(),
            "tidy".to_string(),
            "PROJ-5 fix export".to_string(),
        ];
        let runs = [run("PROJ-5", "Export", 40)];
        let rows = plan(&runs, &commits, &known, &[]);
        assert_eq!(
            rows,
            [
                (Some("PROJ-5".into()), "Export".into(), 40),
                (
                    Some("PROJ-5".into()),
                    "PROJ-5 add export; PROJ-5 fix export".into(),
                    30
                ),
                (None, "tidy".into(), 15),
            ]
        );
        let have: Vec<TimeEntry> = rows
            .iter()
            .map(|(t, n, m)| TimeEntry {
                id: "x".into(),
                day: "2026-11-20".into(),
                minutes: *m,
                note: n.clone(),
                ticket: t.clone(),
                ..TimeEntry::default()
            })
            .collect();
        assert!(plan(&runs, &commits, &known, &have).is_empty());
        let many: Vec<String> = (0..20).map(|n| format!("c{n}")).collect();
        assert_eq!(plan(&[], &many, &[], &[])[0].2, 120, "capped");
    }

    #[test]
    fn a_fill_needs_a_click_and_writes_nothing_without_one() {
        let f = fx();
        assert!(time_fill(&f.s, None, "2026-11-20", false).is_err());
        assert!(!f.repo.path().join("docs/time").exists());
    }

    #[test]
    fn a_fill_of_another_member_is_refused() {
        let f = fx();
        let member = |h: &str, tr: &str| Member {
            name: h.into(),
            handle: h.into(),
            trackers: vec![tr.into()],
            role: "techlead".into(),
            admin: true,
            capacity: 5.0,
            ..Member::default()
        };
        let team = work::Team {
            members: vec![
                member("ana", "ana@acme.test"),
                member("bob", "bob@acme.test"),
            ],
            ..work::Team::default()
        };
        team_save(&f.s, team).unwrap();
        let day = today(&f.s);
        let err = time_fill(&f.s, Some("bob"), &day, true).unwrap_err();
        assert!(err.contains("only your own"), "{err}");
        assert!(!f.repo.path().join("docs/time").exists());
    }

    #[test]
    fn my_commits_of_the_day_make_rows_and_a_second_fill_makes_none() {
        let f = fx();
        let mut ticket = shipyard_engine::fake::todo("PROJ-5").item;
        ticket.assignee = Some(shipyard_core::work_item::Person {
            id: "acc-ana".into(),
            name: "ANA".into(),
        });
        f.put(vec![ticket]);
        let team = work::Team {
            members: vec![Member {
                name: "ANA".into(),
                handle: "ana".into(),
                trackers: vec!["acc-ana".into(), "ana@acme.test".into()],
                role: "techlead".into(),
                admin: true,
                capacity: 5.0,
                ..Member::default()
            }],
            ..work::Team::default()
        };
        team_save(&f.s, team).unwrap();
        for msg in ["PROJ-5 add export", "tidy"] {
            let out = std::process::Command::new("git")
                .args(["-c", "user.name=Ana", "commit", "--allow-empty", "-m", msg])
                .current_dir(f.repo.path())
                .output()
                .unwrap();
            assert!(
                out.status.success(),
                "{}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
        let day = today(&f.s);
        let first = time_fill(&f.s, None, &day, true).unwrap();
        let mut rows: Vec<(Option<String>, u32)> = first
            .entries
            .iter()
            .map(|e| (e.ticket.clone(), e.minutes))
            .collect();
        rows.sort();
        assert_eq!(rows, [(None, 15), (Some("PROJ-5".into()), 15)]);
        let saved = time_month(&f.s, None, &day[..7]).unwrap();
        assert_eq!(saved.rows.len(), 2);
        assert!(
            time_fill(&f.s, None, &day, true)
                .unwrap()
                .entries
                .is_empty()
        );
        assert_eq!(time_month(&f.s, None, &day[..7]).unwrap().rows.len(), 2);
    }
}
