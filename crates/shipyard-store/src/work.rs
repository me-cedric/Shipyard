//! Codecs for the work files in the repository (spec `work`, REQ-003, REQ-009, REQ-010, REQ-017,
//! REQ-021). A file holds the decisions and the entries of people. It holds no total and no
//! computed date: an unknown key is refused, so a computed value has no place to live.
//!
//! The functions take and return text. The caller reads and writes the file.

use crate::seal::{self, SealError, Sealer};
use serde::{Serialize, de::DeserializeOwned};
use serde_yaml::Value;
use shipyard_core::refs::{self, Ref};
use shipyard_core::work::{Calendar, Decisions, Sheet, Team, TimeEntry, parse_day};
use std::collections::BTreeSet;

pub const TEAM_PATH: &str = ".shipyard/team.yaml";
pub const DECISIONS_PATH: &str = "docs/planning/plan.yaml";
pub const CALENDAR_PATH: &str = "docs/planning/calendar.yaml";

#[derive(Debug, thiserror::Error)]
pub enum WorkError {
    /// The text is not valid. The message names the reason.
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Seal(#[from] SealError),
}

type Result<T> = std::result::Result<T, WorkError>;

fn invalid<T>(msg: impl Into<String>) -> Result<T> {
    Err(WorkError::Invalid(msg.into()))
}

fn parse<T: DeserializeOwned>(text: &str) -> Result<T> {
    serde_yaml::from_str(text).map_err(|e| WorkError::Invalid(e.to_string()))
}

fn dump<T: Serialize>(value: &T) -> Result<String> {
    serde_yaml::to_string(value).map_err(|e| WorkError::Invalid(e.to_string()))
}

/// The slug or handle that is a path part: lower case letters, digits and `-`.
fn name(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('-')
        && s.bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

// ---------------------------------------------------------------- team

/// The members of `.shipyard/team.yaml`. A sealed day rate opens with `passphrase`. With none, the
/// rates are hidden and `Team::locked` is set (REQ-005).
pub fn read_team(text: &str, passphrase: Option<&str>) -> Result<Team> {
    let mut value: Value = if text.trim().is_empty() {
        Value::Mapping(Default::default())
    } else {
        parse(text)?
    };
    let mut sealer: Option<Sealer> = None;
    let mut locked = false;
    for member in members_of(&mut value) {
        let Some(rate) = member.get_mut("dayRate") else {
            continue;
        };
        let Some(sealed) = rate.as_str().filter(|s| seal::is_sealed(s)) else {
            continue;
        };
        let Some(pass) = passphrase else {
            *rate = Value::Null;
            locked = true;
            continue;
        };
        if sealer.is_none() {
            sealer = Some(Sealer::new(pass)?);
        }
        let plain = sealer.as_mut().expect("set above").open(sealed)?;
        *rate = Value::Number(plain.parse::<f64>().map_err(|_| SealError::Damaged)?.into());
    }
    let mut team: Team =
        serde_yaml::from_value(value).map_err(|e| WorkError::Invalid(e.to_string()))?;
    team.check().map_err(WorkError::Invalid)?;
    team.locked = locked;
    Ok(team)
}

fn members_of(value: &mut Value) -> impl Iterator<Item = &mut Value> {
    value
        .get_mut("members")
        .and_then(Value::as_sequence_mut)
        .into_iter()
        .flatten()
}

/// The team as text. With a passphrase each day rate is sealed (REQ-005). A locked team is
/// refused: the write would drop the sealed rates.
pub fn write_team(team: &Team, passphrase: Option<&str>) -> Result<String> {
    if team.locked {
        return Err(SealError::Locked.into());
    }
    team.check().map_err(WorkError::Invalid)?;
    let mut value = serde_yaml::to_value(team).map_err(|e| WorkError::Invalid(e.to_string()))?;
    if let Some(pass) = passphrase {
        let mut sealer = Sealer::new(pass)?;
        for member in members_of(&mut value) {
            if let Some(rate) = member.get_mut("dayRate") {
                *rate = Value::String(sealer.seal(&rate.as_f64().unwrap_or_default().to_string())?);
            }
        }
    }
    dump(&value)
}

pub struct TeamLoad {
    pub team: Team,
    /// Why the file was refused. The team is then the last valid one.
    pub error: Option<String>,
}

/// Load the team. A refused file names its reason and keeps `last` (REQ-003). No file is an
/// empty team.
pub fn load_team(text: Option<&str>, passphrase: Option<&str>, last: &Team) -> TeamLoad {
    match text.map(|t| read_team(t, passphrase)) {
        None => TeamLoad {
            team: Team::default(),
            error: None,
        },
        Some(Ok(team)) => TeamLoad { team, error: None },
        Some(Err(e)) => TeamLoad {
            team: last.clone(),
            error: Some(e.to_string()),
        },
    }
}

// ---------------------------------------------------------------- sheets

pub fn sheet_path(slug: &str) -> Result<String> {
    if !name(slug) {
        return invalid(format!(
            "`{slug}` is not a sheet name: use lower case letters, digits and `-`"
        ));
    }
    Ok(format!("docs/costing/{slug}.yaml"))
}

/// An estimate sheet. A sealed file opens with `passphrase`; with none it is `Seal(Locked)`.
pub fn read_sheet(text: &str, passphrase: Option<&str>) -> Result<Sheet> {
    let plain = seal::open(passphrase, text)?;
    let sheet: Sheet = parse(&plain)?;
    sheet.check().map_err(WorkError::Invalid)?;
    Ok(sheet)
}

/// A sheet as text. With a passphrase the whole file is sealed (REQ-014).
pub fn write_sheet(sheet: &Sheet, passphrase: Option<&str>) -> Result<String> {
    sheet.check().map_err(WorkError::Invalid)?;
    let text = dump(sheet)?;
    Ok(match passphrase {
        Some(pass) => seal::seal(pass, &text)? + "\n",
        None => text,
    })
}

// ---------------------------------------------------------------- decisions and calendar

fn check_decisions(d: &Decisions) -> Result<()> {
    let task_ref = |r: &str| matches!(refs::parse(r), Some(Ref::Estimate { row: Some(_), .. }));
    for r in d.order.iter().chain(d.tasks.keys()) {
        if !task_ref(r) {
            return invalid(format!("`{r}` is not a task ref: use est:<slug>#<row-id>"));
        }
    }
    for (r, t) in &d.tasks {
        if let Some(day) = t.start.as_deref().filter(|s| parse_day(s).is_none()) {
            return invalid(format!("`{day}` is not a date, in the decision of {r}"));
        }
    }
    Ok(())
}

/// The plan decisions. One file serves all sheets (REQ-017).
pub fn read_decisions(text: &str) -> Result<Decisions> {
    let d: Decisions = if text.trim().is_empty() {
        Decisions::default()
    } else {
        parse(text)?
    };
    check_decisions(&d)?;
    Ok(d)
}

pub fn write_decisions(d: &Decisions) -> Result<String> {
    check_decisions(d)?;
    dump(d)
}

fn check_calendar(c: &Calendar) -> Result<()> {
    if c.working_days.iter().any(|d| !(1..=7).contains(d)) {
        return invalid("a working day is a number from 1 (Monday) to 7 (Sunday)");
    }
    match c.holidays.iter().find(|h| parse_day(h).is_none()) {
        Some(h) => invalid(format!("`{h}` is not a date")),
        None => Ok(()),
    }
}

pub fn read_calendar(text: &str) -> Result<Calendar> {
    let c: Calendar = if text.trim().is_empty() {
        Calendar::default()
    } else {
        parse(text)?
    };
    check_calendar(&c)?;
    Ok(c)
}

pub fn write_calendar(c: &Calendar) -> Result<String> {
    check_calendar(c)?;
    dump(c)
}

// ---------------------------------------------------------------- time

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct TimeFile {
    #[serde(default)]
    entries: Vec<TimeEntry>,
}

/// `docs/time/<handle>/<yyyy-mm>.yaml`: one file for each member and month (REQ-021).
pub fn time_path(handle: &str, day: &str) -> Result<String> {
    if !name(handle) {
        return invalid(format!("`{handle}` is not a handle"));
    }
    if parse_day(day).is_none() {
        return invalid(format!("`{day}` is not a date"));
    }
    Ok(format!("docs/time/{handle}/{}.yaml", &day[..7]))
}

fn check_time(entries: &[TimeEntry]) -> Result<()> {
    let mut ids = BTreeSet::new();
    let mut month = None;
    for e in entries {
        if e.id.trim().is_empty() || !ids.insert(&e.id) {
            return invalid(format!("entry id `{}` is empty or repeated", e.id));
        }
        if parse_day(&e.day).is_none() {
            return invalid(format!("`{}` is not a date", e.day));
        }
        if e.minutes == 0 {
            return invalid(format!("entry `{}` has no duration", e.id));
        }
        if *month.get_or_insert(&e.day[..7]) != &e.day[..7] {
            return invalid("a time file holds one month");
        }
    }
    Ok(())
}

pub fn read_time(text: &str) -> Result<Vec<TimeEntry>> {
    let file: TimeFile = if text.trim().is_empty() {
        TimeFile::default()
    } else {
        parse(text)?
    };
    check_time(&file.entries)?;
    Ok(file.entries)
}

pub fn write_time(entries: &[TimeEntry]) -> Result<String> {
    check_time(entries)?;
    dump(&TimeFile {
        entries: entries.to_vec(),
    })
}

/// Add one entry to the text of a month file (`None` for a new file). The entries stay sorted by
/// day, then id. A repeated id is refused.
pub fn time_add(text: Option<&str>, entry: TimeEntry) -> Result<String> {
    let mut entries = read_time(text.unwrap_or_default())?;
    entries.push(entry);
    entries.sort_by(|a, b| (&a.day, &a.id).cmp(&(&b.day, &b.id)));
    write_time(&entries)
}
