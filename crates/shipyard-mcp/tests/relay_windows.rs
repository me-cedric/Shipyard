//! The relay on a Windows named pipe (spec `windows-relay`, REQ-001, REQ-002). Windows only: this
//! file runs in the `relay (windows-latest)` job of the CI.
#![cfg(windows)]

use serde_json::json;
use shipyard_agents::mcp_control::{McpConfig, McpControl};
use shipyard_mcp::proxy::Proxy;
use shipyard_mcp::relay::{Relay, pipe_name, serve, socket_path};
use shipyard_secrets::MemoryStore;
use std::io::{BufRead, BufReader, Cursor, Write};
use std::sync::Arc;

fn proxy() -> Arc<Proxy> {
    let control = McpControl::new(Arc::new(MemoryStore::default()), McpConfig::default());
    Arc::new(Proxy::new(Arc::new(control)))
}

#[test]
fn a_request_goes_through_the_pipe_and_the_pipe_goes_away_with_the_relay() {
    let dir = tempfile::tempdir().unwrap();
    let socket = socket_path(dir.path());
    let relay = Relay::listen(proxy(), &socket).unwrap();
    // The name is taken: a second listener is refused.
    assert!(Relay::listen(proxy(), &socket).is_err());

    let pipe = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(pipe_name(&socket))
        .unwrap();
    writeln!(
        &pipe,
        r#"{{"server":"none","method":"tools/list","params":{{}}}}"#
    )
    .unwrap();
    let mut line = String::new();
    BufReader::new(&pipe).read_line(&mut line).unwrap();
    assert_eq!(line.trim(), r#"{"response":null}"#);

    drop(pipe);
    drop(relay);
    assert!(std::fs::File::open(pipe_name(&socket)).is_err());
}

#[test]
fn a_relay_without_the_app_answers_with_an_error_and_does_not_hang() {
    let dir = tempfile::tempdir().unwrap();
    let request = format!(
        "{}\n",
        json!({"jsonrpc":"2.0","id":1,"method":"tools/list"})
    );
    let fallback = proxy();
    let mut out = Vec::new();
    serve(
        "custom-none",
        &socket_path(dir.path()),
        &fallback,
        Cursor::new(request),
        &mut out,
    )
    .unwrap();
    let answer: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(answer["id"], 1);
    assert_eq!(answer["error"]["code"], -32603);
}

/// Another user of the machine cannot open the pipe: its access list is protected and holds one
/// entry, for the owner. A test cannot sign in as a second user, so it reads the list.
#[test]
fn the_pipe_gives_access_to_its_owner_only() {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Authorization::{
        ConvertSecurityDescriptorToStringSecurityDescriptorW, GetSecurityInfo, SDDL_REVISION_1,
        SE_KERNEL_OBJECT,
    };
    use windows_sys::Win32::Security::DACL_SECURITY_INFORMATION;

    let dir = tempfile::tempdir().unwrap();
    let socket = socket_path(dir.path());
    let _relay = Relay::listen(proxy(), &socket).unwrap();
    let pipe = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(pipe_name(&socket))
        .unwrap();
    let mut descriptor = std::ptr::null_mut();
    // SAFETY: the handle is open, and each out pointer is valid or null as the call allows.
    let code = unsafe {
        GetSecurityInfo(
            pipe.as_raw_handle(),
            SE_KERNEL_OBJECT,
            DACL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut descriptor,
        )
    };
    assert_eq!(code, 0, "GetSecurityInfo");
    let mut text = std::ptr::null_mut();
    let mut len = 0u32;
    // SAFETY: the descriptor comes from the call above, and both out pointers are valid.
    let ok = unsafe {
        ConvertSecurityDescriptorToStringSecurityDescriptorW(
            descriptor,
            SDDL_REVISION_1,
            DACL_SECURITY_INFORMATION,
            &mut text,
            &mut len,
        )
    };
    assert_ne!(
        ok, 0,
        "ConvertSecurityDescriptorToStringSecurityDescriptorW"
    );
    // SAFETY: the call gave `len` UTF-16 units at `text`.
    let sddl = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, len as usize) });
    let sddl = sddl.trim_end_matches('\0').to_string();
    // SAFETY: both blocks come from the system and are freed once.
    unsafe {
        LocalFree(text.cast());
        LocalFree(descriptor);
    }
    assert!(sddl.starts_with("D:P"), "the list is protected: {sddl}");
    assert_eq!(sddl.matches("(A;").count(), 1, "one entry: {sddl}");
    assert!(
        sddl.contains(";;;OW)"),
        "the entry is for the owner: {sddl}"
    );
}
