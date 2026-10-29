//! Refs: one stable text form for each entity kind (spec `refs`, REQ-001).

use std::fmt;

/// Kinds whose ref is `<kind>:<name>` with a plain name.
macro_rules! slug_kinds {
    ($($v:ident => $s:literal),* $(,)?) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub enum SlugKind { $($v),* }

        impl SlugKind {
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$v => $s),* }
            }

            fn from_prefix(p: &str) -> Option<Self> {
                match p { $($s => Some(Self::$v),)* _ => None }
            }
        }
    };
}

slug_kinds! {
    Project => "project", Member => "member", Diagram => "diagram", Model => "model",
    Api => "api", Data => "data", Flow => "flow", Screen => "screen", Change => "change",
    Test => "test", Estimate => "est", Workflow => "wf", Connection => "conn",
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Ref {
    /// `project:`, `member:`, `diagram:`, `model:`, `api:`, `data:`, `flow:`, `screen:`,
    /// `change:`, `test:`, `est:`, `wf:` and `conn:`.
    Slug(SlugKind, String),
    /// `adr:NNNN`. The digits stay text so that the form round-trips.
    Adr(String),
    /// `spec:<capability>` or `spec:<capability>#REQ-NNN`.
    Spec {
        capability: String,
        req: Option<String>,
    },
    /// `q:Q-NNN`. Holds the digits.
    Question(String),
    /// `wi:<KEY-N>`.
    WorkItem(String),
    /// `run:<ulid>` or `run:<ulid>/<step-id>`.
    Run { id: String, step: Option<String> },
    /// `pr:<forge>:<number>`.
    Pr { forge: String, number: u64 },
    /// `commit:<sha>`.
    Commit(String),
    /// `doc:<path>`.
    Doc(String),
}

fn is_name(s: &str) -> bool {
    let mut b = s.bytes();
    matches!(b.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && b.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

fn digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit())
}

/// Positive integer without a leading zero.
fn positive(s: &str) -> bool {
    digits(s) && !s.starts_with('0')
}

fn is_work_item(s: &str) -> bool {
    let Some((key, n)) = s.split_once('-') else {
        return false;
    };
    let mut k = key.bytes();
    matches!(k.next(), Some(c) if c.is_ascii_uppercase())
        && k.all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        && positive(n)
}

fn is_ulid(s: &str) -> bool {
    const CROCKFORD: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    s.len() == 26
        && matches!(s.as_bytes()[0], b'0'..=b'7')
        && s.bytes().all(|c| CROCKFORD.contains(&c))
}

fn is_doc_path(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('/')
        && !s.contains('\\')
        && !s.contains(char::is_whitespace)
        && s.split('/').all(|seg| seg != "..")
}

pub fn parse(s: &str) -> Option<Ref> {
    let (kind, rest) = s.split_once(':')?;
    if let Some(k) = SlugKind::from_prefix(kind) {
        return is_name(rest).then(|| Ref::Slug(k, rest.to_string()));
    }
    match kind {
        "adr" => (rest.len() == 4 && digits(rest)).then(|| Ref::Adr(rest.to_string())),
        "spec" => {
            let (cap, req) = match rest.split_once('#') {
                Some((c, r)) => {
                    let n = r.strip_prefix("REQ-")?;
                    if n.len() < 3 || !digits(n) {
                        return None;
                    }
                    (c, Some(n.to_string()))
                }
                None => (rest, None),
            };
            is_name(cap).then(|| Ref::Spec {
                capability: cap.to_string(),
                req,
            })
        }
        "q" => {
            let n = rest.strip_prefix("Q-")?;
            (n.len() >= 3 && digits(n)).then(|| Ref::Question(n.to_string()))
        }
        "wi" => is_work_item(rest).then(|| Ref::WorkItem(rest.to_string())),
        "run" => {
            let (id, step) = match rest.split_once('/') {
                Some((i, st)) => (i, Some(st)),
                None => (rest, None),
            };
            (is_ulid(id) && step.is_none_or(is_name)).then(|| Ref::Run {
                id: id.to_string(),
                step: step.map(str::to_string),
            })
        }
        "pr" => {
            let (forge, n) = rest.split_once(':')?;
            if !is_name(forge) || !positive(n) {
                return None;
            }
            Some(Ref::Pr {
                forge: forge.to_string(),
                number: n.parse().ok()?,
            })
        }
        "commit" => ((7..=40).contains(&rest.len())
            && rest.bytes().all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'f')))
        .then(|| Ref::Commit(rest.to_string())),
        "doc" => is_doc_path(rest).then(|| Ref::Doc(rest.to_string())),
        _ => None,
    }
}

impl fmt::Display for Ref {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Ref::Slug(k, n) => write!(f, "{}:{n}", k.as_str()),
            Ref::Adr(n) => write!(f, "adr:{n}"),
            Ref::Spec {
                capability,
                req: None,
            } => write!(f, "spec:{capability}"),
            Ref::Spec {
                capability,
                req: Some(n),
            } => write!(f, "spec:{capability}#REQ-{n}"),
            Ref::Question(n) => write!(f, "q:Q-{n}"),
            Ref::WorkItem(k) => write!(f, "wi:{k}"),
            Ref::Run { id, step: None } => write!(f, "run:{id}"),
            Ref::Run { id, step: Some(s) } => write!(f, "run:{id}/{s}"),
            Ref::Pr { forge, number } => write!(f, "pr:{forge}:{number}"),
            Ref::Commit(sha) => write!(f, "commit:{sha}"),
            Ref::Doc(p) => write!(f, "doc:{p}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ULID: &str = "01JD0000000000000000000000";

    /// One valid and one rejected form for each of the 21 kinds.
    #[test]
    fn each_kind_has_a_valid_and_a_rejected_form() {
        let ulid_bad = "81JD0000000000000000000000";
        let cases: [(&str, String, String); 21] = [
            ("project", "project:shipyard".into(), "project:Ship".into()),
            ("member", "member:ada-1".into(), "member:-ada".into()),
            ("diagram", "diagram:context".into(), "diagram:a_b".into()),
            ("model", "model:domain".into(), "model:".into()),
            ("adr", "adr:0004".into(), "adr:12".into()),
            ("api", "api:ipc".into(), "api:IPC".into()),
            ("data", "data:run-log".into(), "data:run log".into()),
            ("flow", "flow:onboarding".into(), "flow:-x".into()),
            ("screen", "screen:home".into(), "screen:Home".into()),
            ("change", "change:add-refs".into(), "change:add_refs".into()),
            ("spec", "spec:auth#REQ-003".into(), "spec:auth#REQ-3".into()),
            ("test", "test:smoke".into(), "test:".into()),
            ("q", "q:Q-012".into(), "q:Q-12".into()),
            ("wi", "wi:SHIP-42".into(), "wi:ship-42".into()),
            ("est", "est:v1".into(), "est:V1".into()),
            ("wf", "wf:deliver".into(), "wf:de liver".into()),
            ("run", format!("run:{ULID}/plan"), format!("run:{ulid_bad}")),
            ("pr", "pr:github:42".into(), "pr:github:0".into()),
            ("commit", "commit:abc1234".into(), "commit:abc123".into()),
            ("doc", "doc:docs/plan.md".into(), "doc:../x".into()),
            ("conn", "conn:github-1".into(), "conn:a:b".into()),
        ];
        for (kind, ok, bad) in cases {
            assert!(parse(&ok).is_some(), "{kind}: {ok} must parse");
            assert!(parse(&bad).is_none(), "{kind}: {bad} must not parse");
        }
    }

    #[test]
    fn spec_scenarios() {
        for ok in [
            "adr:0004",
            "q:Q-012",
            "wi:SHIP-42",
            "pr:github:42",
            "spec:auth#REQ-003",
            "run:01JD0000000000000000000000/plan",
        ] {
            assert!(parse(ok).is_some(), "{ok}");
        }
        assert!(parse("foo:bar").is_none());
        assert!(parse("adr:12").is_none());
    }

    #[test]
    fn edge_forms() {
        assert!(parse("spec:auth").is_some());
        assert!(parse("spec:auth#REQ-0003").is_some());
        assert!(parse("spec:auth#REQ-").is_none());
        assert!(parse("spec:auth#X-003").is_none());
        assert!(parse("run:01JD0000000000000000000000").is_some());
        assert!(parse("run:01JD0000000000000000000000/").is_none());
        assert!(parse("run:01JD000000000000000000000U").is_none());
        assert!(parse("wi:SHIP-0").is_none());
        assert!(parse("wi:S1-9").is_some());
        assert!(parse("commit:ABC1234").is_none());
        assert!(parse(&format!("commit:{}", "a".repeat(41))).is_none());
        assert!(parse("doc:/etc/passwd").is_none());
        assert!(parse("doc:a\\b").is_none());
        assert!(parse("doc:a/../b").is_none());
        assert!(parse("doc:a/b..c").is_some());
        assert!(parse("pr:github:1x").is_none());
        assert!(parse("").is_none());
        assert!(parse("adr").is_none());
    }

    #[test]
    fn display_round_trips() {
        for s in [
            "project:shipyard",
            "est:v1",
            "wf:deliver",
            "conn:gh",
            "adr:0004",
            "spec:auth",
            "spec:auth#REQ-003",
            "q:Q-012",
            "wi:SHIP-42",
            "run:01JD0000000000000000000000",
            "run:01JD0000000000000000000000/plan",
            "pr:github:42",
            "commit:abc1234",
            "doc:docs/plan.md",
        ] {
            assert_eq!(parse(s).unwrap().to_string(), s);
        }
    }
}
