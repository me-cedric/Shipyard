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
    Test => "test", Workflow => "wf", Connection => "conn",
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Ref {
    /// `project:`, `member:`, `diagram:`, `model:`, `api:`, `data:`, `flow:`, `screen:`,
    /// `change:`, `test:`, `wf:` and `conn:`.
    Slug(SlugKind, String),
    /// `est:<slug>` or `est:<slug>#<row-id>`.
    Estimate { sheet: String, row: Option<String> },
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
        "est" => {
            let (sheet, row) = match rest.split_once('#') {
                Some((s, r)) => (s, Some(r)),
                None => (rest, None),
            };
            (is_name(sheet) && row.is_none_or(is_name)).then(|| Ref::Estimate {
                sheet: sheet.to_string(),
                row: row.map(str::to_string),
            })
        }
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
            Ref::Estimate { sheet, row: None } => write!(f, "est:{sheet}"),
            Ref::Estimate {
                sheet,
                row: Some(r),
            } => write!(f, "est:{sheet}#{r}"),
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

impl Ref {
    /// The kind prefix of the ref, such as `adr` or `wi`.
    pub fn kind(&self) -> &'static str {
        match self {
            Ref::Slug(k, _) => k.as_str(),
            Ref::Estimate { .. } => "est",
            Ref::Adr(_) => "adr",
            Ref::Spec { .. } => "spec",
            Ref::Question(_) => "q",
            Ref::WorkItem(_) => "wi",
            Ref::Run { .. } => "run",
            Ref::Pr { .. } => "pr",
            Ref::Commit(_) => "commit",
            Ref::Doc(_) => "doc",
        }
    }
}

/// A ref found in a text, with its byte range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    pub target: Ref,
    pub start: usize,
    pub end: usize,
}

/// Finds each valid ref in a text. Skips code spans and fenced code blocks (Q-011, option 1).
// shortcut: a code span ends on its own line, and a fence needs its own closing line. Upgrade with a Markdown parser if a case needs it.
pub fn detect(text: &str) -> Vec<Found> {
    let mut out = Vec::new();
    let mut fence: Option<(u8, usize)> = None;
    let mut base = 0;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        match (fence, fence_marker(trimmed)) {
            (Some((c, n)), Some((c2, n2)))
                if c == c2 && n2 >= n && trimmed[n2..].trim().is_empty() =>
            {
                fence = None;
            }
            (Some(_), _) => {}
            (None, Some(m)) => fence = Some(m),
            (None, None) => scan_line(line, base, &mut out),
        }
        base += line.len();
    }
    out
}

/// A fence line starts with three or more backticks or tildes. Returns the char and the count.
fn fence_marker(line: &str) -> Option<(u8, usize)> {
    let c = *line
        .as_bytes()
        .first()
        .filter(|c| matches!(c, b'`' | b'~'))?;
    let n = line.bytes().take_while(|b| *b == c).count();
    (n >= 3).then_some((c, n))
}

fn run_len(b: &[u8], i: usize) -> usize {
    b[i..].iter().take_while(|c| **c == b'`').count()
}

/// Index of the next run of exactly `n` backticks at or after `from`.
fn find_run(b: &[u8], from: usize, n: usize) -> Option<usize> {
    let mut j = from;
    while j < b.len() {
        if b[j] == b'`' {
            let m = run_len(b, j);
            if m == n {
                return Some(j);
            }
            j += m;
        } else {
            j += 1;
        }
    }
    None
}

fn scan_line(line: &str, base: usize, out: &mut Vec<Found>) {
    let b = line.as_bytes();
    let (mut i, mut seg) = (0, 0);
    while i < b.len() {
        if b[i] != b'`' {
            i += 1;
            continue;
        }
        let n = run_len(b, i);
        match find_run(b, i + n, n) {
            Some(close) => {
                tokens(line, seg, i, base, out);
                i = close + n;
                seg = i;
            }
            None => i += n,
        }
    }
    tokens(line, seg, b.len(), base, out);
}

fn is_ref_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, ':' | '#' | '/' | '.' | '-' | '_')
}

fn tokens(line: &str, from: usize, to: usize, base: usize, out: &mut Vec<Found>) {
    let seg = &line[from..to];
    let mut start = None;
    let mut flush = |s: usize, e: usize| {
        let piece = seg[s..e].trim_end_matches(['.', ':']);
        if let Some(target) = parse(piece) {
            out.push(Found {
                target,
                start: base + from + s,
                end: base + from + s + piece.len(),
            });
        }
    };
    for (i, c) in seg.char_indices() {
        match (is_ref_char(c), start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                flush(s, i);
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        flush(s, seg.len());
    }
}
