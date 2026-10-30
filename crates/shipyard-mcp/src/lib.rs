//! MCP server for the agents: the tools that a run calls. Read-only tools come first.
//! It also proxies the MCP servers of the connections ([`proxy`]) and keeps stdio servers open
//! between agent turns ([`relay`]).
//!
//! The agent tools: [`tools::agent`] (the eight tools and [`tools::agent::AgentEvents`]),
//! [`server`] (JSON-RPC core), [`transport`] (stdio and loopback HTTP), [`session`] (per-run tokens).

pub mod outside;
pub mod proxy;
pub mod relay;
pub mod schema;
pub mod server;
pub mod session;
pub mod tools;
pub mod transport;
