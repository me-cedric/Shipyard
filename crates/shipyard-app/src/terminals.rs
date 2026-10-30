//! Outside terminal apps: find the ones that are installed and open one in a folder of the project.
//!
//! This is not the terminal of Code (`terminal.rs`, a shell on a PTY inside the window). The person
//! picks the app in the preferences (`Prefs::terminal_app`). Every start uses a fixed argument
//! list and never a shell string. A folder outside the open project is refused.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;
use shipyard_agents::which::{quiet, search_dirs, which};
use shipyard_store::prefs::Prefs;
use specta::Type;
use tauri::AppHandle;

use crate::commands::{Api, AppState, Res, blocking, err};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TerminalApp {
    /// The value of `Prefs::terminal_app`.
    pub id: String,
    pub label: String,
}

struct Def {
    id: &'static str,
    label: &'static str,
    /// Command names, tried in order, on `PATH` and in the tool folders. Empty for a Mac-only app.
    cli: &'static [&'static str],
    /// The `.app` of macOS, without the suffix. Empty when there is none.
    mac_app: &'static str,
}

/// The apps that Shipyard knows, in the order of the list. The preference holds one of these ids.
const DEFS: &[Def] = &[
    Def {
        id: "apple-terminal",
        label: "Terminal",
        cli: &[],
        mac_app: "Terminal",
    },
    Def {
        id: "iterm2",
        label: "iTerm2",
        cli: &[],
        mac_app: "iTerm",
    },
    Def {
        id: "warp",
        label: "Warp",
        cli: &[],
        mac_app: "Warp",
    },
    Def {
        id: "ghostty",
        label: "Ghostty",
        cli: &["ghostty"],
        mac_app: "Ghostty",
    },
    Def {
        id: "wezterm",
        label: "WezTerm",
        cli: &["wezterm"],
        mac_app: "WezTerm",
    },
    Def {
        id: "kitty",
        label: "kitty",
        cli: &["kitty"],
        mac_app: "kitty",
    },
    Def {
        id: "alacritty",
        label: "Alacritty",
        cli: &["alacritty"],
        mac_app: "Alacritty",
    },
    Def {
        id: "windows-terminal",
        label: "Windows Terminal",
        cli: &["wt"],
        mac_app: "",
    },
    Def {
        id: "powershell",
        label: "PowerShell",
        cli: &["pwsh", "powershell"],
        mac_app: "",
    },
];

/// How to start an app that was found.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Found {
    /// A macOS `.app`, started with `open`.
    MacApp(&'static str),
    Exe(PathBuf),
}

fn mac_app_exists(app: &str) -> bool {
    if app.is_empty() || !cfg!(target_os = "macos") {
        return false;
    }
    let name = format!("{app}.app");
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    dirs.extend(std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Applications")));
    dirs.iter().any(|d| d.join(&name).exists())
}

fn find(def: &Def) -> Option<Found> {
    if mac_app_exists(def.mac_app) {
        return Some(Found::MacApp(def.mac_app));
    }
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut dirs = search_dirs();
    // `wt.exe` is an app alias in this folder.
    #[cfg(windows)]
    dirs.extend(
        std::env::var_os("LOCALAPPDATA")
            .map(|d| PathBuf::from(d).join("Microsoft").join("WindowsApps")),
    );
    def.cli.iter().find_map(|c| which(c, &dirs)).map(Found::Exe)
}

/// The apps that are installed on this machine, in the order of the table.
pub fn available() -> Vec<TerminalApp> {
    DEFS.iter()
        .filter(|d| find(d).is_some())
        .map(|d| TerminalApp {
            id: d.id.into(),
            label: d.label.into(),
        })
        .collect()
}

/// The program, the arguments and the working folder of one start.
#[derive(Debug, PartialEq, Eq)]
struct Launch {
    program: PathBuf,
    args: Vec<OsString>,
    cwd: Option<PathBuf>,
}

/// The fixed argument list. `dir` is absolute: it starts with `/` or a drive, never with `-`.
fn plan(id: &str, found: &Found, dir: &Path) -> Launch {
    let d = dir.as_os_str().to_owned();
    let pair = |flag: &str| [OsString::from(flag), d.clone()];
    match found {
        Found::MacApp(app) => {
            // A new instance for the apps that take a folder flag. The others take the folder.
            let mut args: Vec<OsString> = match id {
                "ghostty" => ["-na", app, "--args"].map(Into::into).into(),
                "wezterm" => ["-na", app, "--args", "start"].map(Into::into).into(),
                "kitty" | "alacritty" => ["-na", app, "--args"].map(Into::into).into(),
                _ => ["-a", app].map(Into::into).into(),
            };
            match id {
                "ghostty" => {
                    let mut flag = OsString::from("--working-directory=");
                    flag.push(&d);
                    args.push(flag);
                }
                "wezterm" => args.extend(pair("--cwd")),
                "kitty" => args.extend(pair("--directory")),
                "alacritty" => args.extend(pair("--working-directory")),
                _ => args.push(d),
            }
            Launch {
                program: "open".into(),
                args,
                cwd: None,
            }
        }
        Found::Exe(exe) => Launch {
            program: exe.clone(),
            args: match id {
                "windows-terminal" => pair("-d").into(),
                "powershell" => vec!["-NoLogo".into()],
                _ => vec![],
            },
            // The other apps start in the working folder that they inherit.
            cwd: Some(dir.to_path_buf()),
        },
    }
}

/// `folder` as an existing folder inside `root`. A relative path starts at `root`. The path is
/// resolved, so `..` and a link that leaves the project are refused.
fn inside(root: &Path, folder: &str) -> Res<PathBuf> {
    let root = root.canonicalize().map_err(err)?;
    let p = Path::new(folder.trim());
    let full = if folder.trim().is_empty() {
        root.clone()
    } else if p.is_absolute() {
        p.into()
    } else {
        root.join(p)
    };
    let full = full
        .canonicalize()
        .map_err(|_| format!("{folder} is not a folder of the project"))?;
    if !full.is_dir() || !full.starts_with(&root) {
        return Err(format!("{folder} is not a folder of the project"));
    }
    Ok(plain(full))
}

/// Windows gives `\\?\C:\x`: a terminal does not take that form.
fn plain(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) => PathBuf::from(rest),
        None => p,
    }
}

/// Open the app of the preferences in `folder` (empty is the project folder). It needs the click
/// of a person. An unknown or missing app is an error: no other app opens in its place.
pub fn launch(s: &AppState, folder: &str, click: bool) -> Res<()> {
    if !click {
        return Err("this change needs the click of a person".into());
    }
    let e = s.registry()?.active().cloned().ok_or("no active project")?;
    let dir = inside(Path::new(&e.path), folder)?;
    let chosen = Prefs::load(&s.dir).terminal_app;
    let def = if chosen.is_empty() {
        DEFS.iter()
            .find(|d| find(d).is_some())
            .ok_or("no terminal app was found on this machine")?
    } else {
        DEFS.iter()
            .find(|d| d.id == chosen)
            .ok_or_else(|| format!("unknown terminal app: {chosen}"))?
    };
    let found = find(def).ok_or_else(|| format!("{} is not installed", def.label))?;
    let l = plan(def.id, &found, &dir);
    let mut cmd = Command::new(&l.program);
    cmd.args(&l.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(cwd) = &l.cwd {
        cmd.current_dir(cwd);
    }
    // An app that starts from the Dock has a short `PATH`: the terminal would miss the tools.
    if let Ok(path) = std::env::join_paths(search_dirs()) {
        cmd.env("PATH", path);
    }
    let mut child = quiet(&mut cmd)
        .spawn()
        .map_err(|e| format!("{} did not start: {e}", def.label))?;
    // Wait on a thread, so a short-lived `open` leaves no zombie process.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_apps(app: AppHandle) -> Api<Vec<TerminalApp>> {
    blocking(app, |_| Ok(available())).await
}

/// Opens the terminal app of the preferences in a folder of the open project.
#[tauri::command]
#[specta::specta]
pub async fn terminal_launch(app: AppHandle, folder: String, click: bool) -> Api<()> {
    blocking(app, move |s| launch(s, &folder, click)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use shipyard_store::prefs::PrefsPatch;

    fn args(l: &Launch) -> Vec<String> {
        l.args.iter().map(|a| a.to_string_lossy().into()).collect()
    }

    #[test]
    fn the_table_has_unique_ids_and_a_way_to_find_each_app() {
        let mut ids: Vec<_> = DEFS.iter().map(|d| d.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), DEFS.len());
        assert!(
            DEFS.iter()
                .all(|d| !d.cli.is_empty() || !d.mac_app.is_empty())
        );
        for t in available() {
            assert!(DEFS.iter().any(|d| d.id == t.id));
        }
    }

    #[test]
    fn a_mac_app_starts_with_open_and_a_fixed_list() {
        let dir = Path::new("/p/a b;rm");
        let run = |id: &str, app| plan(id, &Found::MacApp(app), dir);
        assert_eq!(args(&run("iterm2", "iTerm")), ["-a", "iTerm", "/p/a b;rm"]);
        assert_eq!(
            args(&run("kitty", "kitty")),
            ["-na", "kitty", "--args", "--directory", "/p/a b;rm"]
        );
        assert_eq!(
            args(&run("ghostty", "Ghostty")),
            ["-na", "Ghostty", "--args", "--working-directory=/p/a b;rm"]
        );
        assert_eq!(
            args(&run("wezterm", "WezTerm")),
            ["-na", "WezTerm", "--args", "start", "--cwd", "/p/a b;rm"]
        );
        assert_eq!(run("warp", "Warp").program, PathBuf::from("open"));
    }

    #[test]
    fn an_executable_starts_in_the_folder_and_windows_terminal_takes_a_flag() {
        let dir = Path::new("/p");
        let exe = |p: &str| Found::Exe(p.into());
        let k = plan("kitty", &exe("/bin/kitty"), dir);
        assert_eq!((args(&k), k.cwd), (vec![], Some(dir.into())));
        assert_eq!(
            args(&plan("windows-terminal", &exe("wt"), dir)),
            ["-d", "/p"]
        );
        assert_eq!(args(&plan("powershell", &exe("pwsh"), dir)), ["-NoLogo"]);
    }

    #[test]
    fn a_folder_outside_the_project_is_refused() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("proj");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::create_dir_all(tmp.path().join("other")).unwrap();
        std::fs::write(root.join("file.txt"), "x").unwrap();
        let ok = |f: &str| inside(&root, f).unwrap();
        assert_eq!(ok(""), root.canonicalize().unwrap());
        assert_eq!(ok("src"), root.canonicalize().unwrap().join("src"));
        let abs = root.join("src");
        assert_eq!(
            ok(abs.to_str().unwrap()),
            root.canonicalize().unwrap().join("src")
        );
        for bad in ["..", "../other", "nope", "file.txt"] {
            assert!(inside(&root, bad).is_err(), "{bad}");
        }
        let other = tmp.path().join("other");
        assert!(inside(&root, other.to_str().unwrap()).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&other, root.join("link")).unwrap();
            assert!(
                inside(&root, "link").is_err(),
                "a link that leaves the project"
            );
        }
    }

    #[test]
    fn the_launch_needs_a_click_and_a_known_app() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("proj");
        std::fs::create_dir_all(&root).unwrap();
        std::process::Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["init", "-q"])
            .status()
            .unwrap();
        let s = AppState::new(tmp.path().join("data"));
        crate::commands::projects::open(&s, root.to_str().unwrap()).unwrap();
        assert!(launch(&s, "", false).unwrap_err().contains("click"));
        crate::commands::prefs::set(
            &s,
            PrefsPatch {
                terminal_app: Some("not-a-terminal".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(
            launch(&s, "", true)
                .unwrap_err()
                .contains("unknown terminal app")
        );
        assert!(launch(&s, "../x", true).is_err());
    }
}
