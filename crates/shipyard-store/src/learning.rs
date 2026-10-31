//! Knowledge / Learn (spec `knowledge`): the learning file of the project and the feed reader.
//!
//! The file `.shipyard/learning.yaml` holds the feed addresses, the learning paths (courses,
//! certifications, readings, with experts from the team) and the progress of each person.
//! A feed is RSS or Atom. The reader keeps plain text only: tags are removed, no HTML or script
//! goes to the view, and a link that is not `https` or `http` is dropped.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::Result;
use crate::project::write_atomic;

pub const LEARNING_PATH: &str = ".shipyard/learning.yaml";
const MAX_FEEDS: usize = 50;
const MAX_PATHS: usize = 100;
const MAX_STEPS: usize = 200;
const MAX_TITLE: usize = 200;
const MAX_ITEMS: usize = 30;
const MAX_SUMMARY: usize = 280;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum StepKind {
    Course,
    Certification,
    Reading,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LearningStep {
    /// Unique in its path. Derived from the title when empty.
    #[serde(default)]
    pub id: String,
    pub kind: StepKind,
    pub title: String,
    /// An `https` address of the course or the exam.
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LearningPath {
    /// Derived from the title when empty.
    #[serde(default)]
    pub id: String,
    pub title: String,
    /// The handles of the team members who can help.
    #[serde(default)]
    pub experts: Vec<String>,
    #[serde(default)]
    pub steps: Vec<LearningStep>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Learning {
    #[serde(default)]
    pub feeds: Vec<String>,
    #[serde(default)]
    pub paths: Vec<LearningPath>,
    /// The handle of a person, then the `<path>/<step>` keys that this person finished.
    #[serde(default)]
    pub progress: BTreeMap<String, Vec<String>>,
}

/// The file of the project. A missing file is an empty one.
pub fn read(root: &Path) -> Result<Learning> {
    match std::fs::read_to_string(root.join(LEARNING_PATH)) {
        Ok(text) => Ok(serde_yaml::from_str(&text).map_err(|e| format!("{LEARNING_PATH}: {e}"))?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Learning::default()),
        Err(e) => Err(e.into()),
    }
}

fn write(root: &Path, l: &Learning) -> Result<Learning> {
    write_atomic(
        &root.join(LEARNING_PATH),
        serde_yaml::to_string(l)?.as_bytes(),
    )?;
    Ok(l.clone())
}

/// A lowercase id of letters, digits and hyphens.
pub fn slug(text: &str) -> String {
    let s: String = text
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    s.split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// An address that a person can open: `https`, no space, no user part.
pub fn check_address(url: &str) -> Result<()> {
    let rest = url.strip_prefix("https://").unwrap_or("");
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty()
        || host.contains('@')
        || url.len() > 2048
        || url.chars().any(char::is_whitespace)
    {
        return Err(format!("bad address: {url}").into());
    }
    Ok(())
}

fn check_title(title: &str) -> Result<String> {
    let t = title.trim();
    if slug(t).is_empty() || t.chars().count() > MAX_TITLE {
        return Err("the title needs a letter or a digit and at most 200 characters".into());
    }
    Ok(t.to_string())
}

/// Adds a feed address. An address that the file has is not added twice.
pub fn feed_add(root: &Path, url: &str) -> Result<Learning> {
    let url = url.trim();
    check_address(url)?;
    let mut l = read(root)?;
    if !l.feeds.iter().any(|f| f == url) {
        if l.feeds.len() >= MAX_FEEDS {
            return Err(format!("a project holds at most {MAX_FEEDS} feeds").into());
        }
        l.feeds.push(url.into());
    }
    write(root, &l)
}

pub fn feed_remove(root: &Path, url: &str) -> Result<Learning> {
    let mut l = read(root)?;
    l.feeds.retain(|f| f != url);
    write(root, &l)
}

/// Creates or replaces a path, by its id. The ids come from the titles when they are empty.
pub fn path_save(root: &Path, mut p: LearningPath) -> Result<Learning> {
    p.title = check_title(&p.title)?;
    if p.id.is_empty() {
        p.id = slug(&p.title);
    }
    if slug(&p.id) != p.id {
        return Err(format!("bad path id: {}", p.id).into());
    }
    if p.steps.len() > MAX_STEPS {
        return Err(format!("a path holds at most {MAX_STEPS} steps").into());
    }
    let mut seen = Vec::new();
    for s in &mut p.steps {
        s.title = check_title(&s.title)?;
        if s.id.is_empty() {
            s.id = slug(&s.title);
        }
        if slug(&s.id) != s.id || seen.contains(&s.id) {
            return Err(format!("bad or repeated step id: {}", s.id).into());
        }
        seen.push(s.id.clone());
        s.url = s
            .url
            .take()
            .map(|u| u.trim().to_string())
            .filter(|u| !u.is_empty());
        if let Some(u) = &s.url {
            check_address(u)?;
        }
    }
    p.experts.retain(|e| !e.trim().is_empty());
    p.experts.dedup();
    let mut l = read(root)?;
    let full = l.paths.len() >= MAX_PATHS;
    match l.paths.iter_mut().find(|x| x.id == p.id) {
        Some(x) => *x = p,
        None if full => {
            return Err(format!("a project holds at most {MAX_PATHS} paths").into());
        }
        None => l.paths.push(p),
    }
    write(root, &l)
}

/// Removes a path and the progress on it.
pub fn path_delete(root: &Path, id: &str) -> Result<Learning> {
    let mut l = read(root)?;
    l.paths.retain(|p| p.id != id);
    let prefix = format!("{id}/");
    for done in l.progress.values_mut() {
        done.retain(|k| !k.starts_with(&prefix));
    }
    l.progress.retain(|_, done| !done.is_empty());
    write(root, &l)
}

/// Marks one step done or not done for one person. The step must exist.
pub fn progress_set(root: &Path, person: &str, step: &str, done: bool) -> Result<Learning> {
    let person = person.trim();
    if person.is_empty() || person.len() > 100 {
        return Err("a person is needed".into());
    }
    let mut l = read(root)?;
    let known = l
        .paths
        .iter()
        .any(|p| p.steps.iter().any(|s| format!("{}/{}", p.id, s.id) == step));
    if !known {
        return Err(format!("unknown step: {step}").into());
    }
    let list = l.progress.entry(person.into()).or_default();
    list.retain(|k| k != step);
    if done {
        list.push(step.into());
        list.sort();
    }
    l.progress.retain(|_, d| !d.is_empty());
    write(root, &l)
}

// ---------------------------------------------------------------- feeds

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FeedItem {
    pub title: String,
    /// An `https` or `http` address, or empty.
    pub link: String,
    /// The date as the feed gives it, or empty.
    pub published: String,
    /// Plain text, cut short.
    pub summary: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Feed {
    pub title: String,
    pub items: Vec<FeedItem>,
}

/// The text between `<name ...>` and `</name>` in `xml`, from `from`. Returns the text and the end.
fn element<'a>(xml: &'a str, name: &str, from: usize) -> Option<(&'a str, &'a str, usize)> {
    let open = format!("<{name}");
    let mut at = from;
    loop {
        let start = at + xml.get(at..)?.find(&open)?;
        let after = start + open.len();
        // `<link` must not match `<linkedin`.
        match xml[after..].chars().next()? {
            '>' | ' ' | '/' | '\n' | '\r' | '\t' => {}
            _ => {
                at = after;
                continue;
            }
        }
        let tag_end = after + xml[after..].find('>')?;
        let attrs = &xml[after..tag_end];
        if attrs.ends_with('/') {
            return Some((attrs, "", tag_end + 1));
        }
        let close = format!("</{name}>");
        let body_end = tag_end + 1 + xml[tag_end + 1..].find(&close)?;
        return Some((attrs, &xml[tag_end + 1..body_end], body_end + close.len()));
    }
}

fn attr(attrs: &str, name: &str) -> Option<String> {
    let at = attrs.find(&format!("{name}="))?;
    let rest = &attrs[at + name.len() + 1..];
    let q = rest.chars().next()?;
    if q != '"' && q != '\'' {
        return None;
    }
    rest[1..].split(q).next().map(entities)
}

fn entities(s: &str) -> String {
    let mut out = s
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&#039;", "'")
        .replace("&nbsp;", " ")
        .replace("&#8217;", "\u{2019}")
        .replace("&#8211;", "\u{2013}");
    // `&amp;` last, so `&amp;lt;` stays `&lt;`.
    out = out.replace("&amp;", "&");
    out
}

/// Plain text: no CDATA marks, no tags, entities read, spaces joined.
pub fn plain(raw: &str) -> String {
    let raw = raw.replace("<![CDATA[", "").replace("]]>", "");
    // An escaped HTML body becomes tags first, then the tags go.
    let raw = if raw.contains("&lt;") {
        entities(&raw)
    } else {
        raw
    };
    let mut text = String::with_capacity(raw.len());
    let mut inside = false;
    for c in raw.chars() {
        match c {
            '<' => inside = true,
            '>' if inside => {
                inside = false;
                text.push(' ');
            }
            _ if !inside => text.push(c),
            _ => {}
        }
    }
    entities(&text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn cut(text: String, max: usize) -> String {
    if text.chars().count() <= max {
        return text;
    }
    let mut s: String = text.chars().take(max).collect();
    s.push('\u{2026}');
    s
}

fn safe_link(link: String) -> String {
    let l = link.trim();
    if l.starts_with("https://") || l.starts_with("http://") {
        l.to_string()
    } else {
        String::new()
    }
}

fn first_text(block: &str, names: &[&str]) -> String {
    names
        .iter()
        .find_map(|n| element(block, n, 0).map(|(_, body, _)| plain(body)))
        .filter(|t| !t.is_empty())
        .unwrap_or_default()
}

fn item_of(block: &str, atom: bool) -> FeedItem {
    let link = if atom {
        // The `alternate` link, else the first one.
        let mut at = 0;
        let mut first = None;
        let mut alternate = None;
        while let Some((attrs, _, end)) = element(block, "link", at) {
            let href = attr(attrs, "href");
            let rel = attr(attrs, "rel");
            if first.is_none() {
                first = href.clone();
            }
            if rel.as_deref().is_none_or(|r| r == "alternate") && alternate.is_none() {
                alternate = href;
            }
            at = end;
        }
        alternate.or(first).unwrap_or_default()
    } else {
        first_text(block, &["link", "guid"])
    };
    FeedItem {
        title: first_text(block, &["title"]),
        link: safe_link(link),
        published: first_text(block, &["pubDate", "published", "updated", "dc:date"]),
        summary: cut(
            first_text(
                block,
                &["description", "summary", "content:encoded", "content"],
            ),
            MAX_SUMMARY,
        ),
    }
}

/// Reads an RSS or Atom document. At most 30 items, in the order of the feed.
pub fn parse_feed(xml: &str) -> Result<Feed> {
    let atom = xml.contains("<feed") && !xml.contains("<rss") && !xml.contains("<rdf:RDF");
    if !atom && !xml.contains("<rss") && !xml.contains("<rdf:RDF") {
        return Err("this address does not hold an RSS or Atom feed".into());
    }
    let tag = if atom { "entry" } else { "item" };
    let head_end = xml.find(&format!("<{tag}")).unwrap_or(xml.len());
    let title = first_text(&xml[..head_end], &["title"]);
    let mut items = Vec::new();
    let mut at = 0;
    while let Some((_, body, end)) = element(xml, tag, at) {
        let item = item_of(body, atom);
        if !item.title.is_empty() {
            items.push(item);
        }
        if items.len() == MAX_ITEMS {
            break;
        }
        at = end;
    }
    Ok(Feed { title, items })
}

#[cfg(test)]
mod tests {
    use super::*;

    const RSS: &str = r#"<?xml version="1.0"?><rss version="2.0"><channel><title>Team &amp; news</title>
<item><title><![CDATA[First <b>post</b>]]></title><link>https://example.com/1</link>
<pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate>
<description>&lt;p&gt;Hello &lt;script&gt;alert(1)&lt;/script&gt;world&lt;/p&gt;</description></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
<item><title></title><link>https://example.com/empty</link></item>
</channel></rss>"#;

    const ATOM: &str = r#"<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom log</title>
<entry><title>One</title><link rel="self" href="https://example.com/self"/>
<link rel="alternate" href="https://example.com/one"/><updated>2026-10-01T00:00:00Z</updated>
<summary>Short text</summary></entry></feed>"#;

    #[test]
    fn an_rss_feed_gives_plain_items_and_safe_links() {
        let f = parse_feed(RSS).unwrap();
        assert_eq!(f.title, "Team & news");
        assert_eq!(f.items.len(), 2, "an item with no title is dropped");
        assert_eq!(f.items[0].title, "First post");
        assert_eq!(f.items[0].link, "https://example.com/1");
        assert!(f.items[0].published.starts_with("Mon"));
        // The tags of the escaped body go, the script tag too: plain text only.
        assert!(!f.items[0].summary.contains('<'));
        assert!(f.items[0].summary.starts_with("Hello"));
        assert_eq!(f.items[1].link, "", "a javascript link is dropped");
    }

    #[test]
    fn an_atom_feed_takes_the_alternate_link() {
        let f = parse_feed(ATOM).unwrap();
        assert_eq!(f.title, "Atom log");
        assert_eq!(f.items[0].link, "https://example.com/one");
        assert_eq!(f.items[0].summary, "Short text");
        assert!(parse_feed("<html><body>no</body></html>").is_err());
    }

    #[test]
    fn paths_progress_and_feeds_round_trip_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert_eq!(read(root).unwrap(), Learning::default());
        assert!(feed_add(root, "http://example.com/feed").is_err());
        assert!(feed_add(root, "https://user@example.com/feed").is_err());
        feed_add(root, "https://example.com/feed").unwrap();
        let l = feed_add(root, "https://example.com/feed").unwrap();
        assert_eq!(l.feeds.len(), 1);
        let path = LearningPath {
            id: String::new(),
            title: "Rust basics".into(),
            experts: vec!["ana".into()],
            steps: vec![
                LearningStep {
                    id: String::new(),
                    kind: StepKind::Course,
                    title: "The book".into(),
                    url: Some("https://doc.rust-lang.org/book/".into()),
                },
                LearningStep {
                    id: String::new(),
                    kind: StepKind::Certification,
                    title: "Exam".into(),
                    url: None,
                },
            ],
        };
        let l = path_save(root, path.clone()).unwrap();
        assert_eq!(l.paths[0].id, "rust-basics");
        assert_eq!(l.paths[0].steps[0].id, "the-book");
        let mut bad = path.clone();
        bad.steps[0].url = Some("javascript:alert(1)".into());
        assert!(path_save(root, bad).is_err());
        assert!(progress_set(root, "ana", "rust-basics/none", true).is_err());
        let l = progress_set(root, "ana", "rust-basics/exam", true).unwrap();
        assert_eq!(l.progress["ana"], vec!["rust-basics/exam".to_string()]);
        let l = progress_set(root, "ana", "rust-basics/exam", false).unwrap();
        assert!(l.progress.is_empty());
        progress_set(root, "bo", "rust-basics/the-book", true).unwrap();
        let l = path_delete(root, "rust-basics").unwrap();
        assert!(l.paths.is_empty() && l.progress.is_empty());
        assert_eq!(
            feed_remove(root, "https://example.com/feed")
                .unwrap()
                .feeds
                .len(),
            0
        );
    }
}
