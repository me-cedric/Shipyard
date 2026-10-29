//! A fake `Http` for contract tests: canned answers, and a log of each request.
//! No network. Routes match in the order added: add the specific route first.

use crate::{Error, Http, Method, Request, Response};
use std::sync::Mutex;

struct Route {
    method: Method,
    url_has: String,
    body_has: String,
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

#[derive(Default)]
pub struct FakeHttp {
    routes: Mutex<Vec<Route>>,
    log: Mutex<Vec<Request>>,
}

impl FakeHttp {
    pub fn new() -> Self {
        Self::default()
    }

    /// Answer a `GET` whose URL contains `url_has`.
    pub fn get(&self, url_has: &str, status: u16, body: &str) -> &Self {
        self.add(Method::Get, url_has, "", status, &[], body)
    }

    /// Answer a `GET` with response headers.
    pub fn get_with(
        &self,
        url_has: &str,
        status: u16,
        headers: &[(&str, &str)],
        body: &str,
    ) -> &Self {
        self.add(Method::Get, url_has, "", status, headers, body)
    }

    /// Answer a `POST` whose URL contains `url_has` and whose JSON body contains `body_has`.
    pub fn post(&self, url_has: &str, body_has: &str, status: u16, body: &str) -> &Self {
        self.add(Method::Post, url_has, body_has, status, &[], body)
    }

    /// Answer a `PUT` whose URL contains `url_has` and whose JSON body contains `body_has`.
    pub fn put(&self, url_has: &str, body_has: &str, status: u16, body: &str) -> &Self {
        self.add(Method::Put, url_has, body_has, status, &[], body)
    }

    /// Answer a `PATCH` whose URL contains `url_has` and whose JSON body contains `body_has`.
    pub fn patch(&self, url_has: &str, body_has: &str, status: u16, body: &str) -> &Self {
        self.add(Method::Patch, url_has, body_has, status, &[], body)
    }

    /// Answer a `DELETE` whose URL contains `url_has`.
    pub fn delete(&self, url_has: &str, status: u16, body: &str) -> &Self {
        self.add(Method::Delete, url_has, "", status, &[], body)
    }

    fn add(
        &self,
        method: Method,
        url_has: &str,
        body_has: &str,
        status: u16,
        headers: &[(&str, &str)],
        body: &str,
    ) -> &Self {
        self.routes.lock().expect("routes lock").push(Route {
            method,
            url_has: url_has.into(),
            body_has: body_has.into(),
            status,
            headers: headers
                .iter()
                .map(|(k, v)| (k.to_ascii_lowercase(), v.to_string()))
                .collect(),
            body: body.into(),
        });
        self
    }

    /// Every request the code under test sent.
    pub fn requests(&self) -> Vec<Request> {
        self.log.lock().expect("log lock").clone()
    }
}

impl Http for FakeHttp {
    fn send(&self, req: &Request) -> Result<Response, Error> {
        self.log.lock().expect("log lock").push(req.clone());
        let body = req
            .body
            .as_ref()
            .map(ToString::to_string)
            .unwrap_or_default();
        let routes = self.routes.lock().expect("routes lock");
        let route = routes
            .iter()
            .find(|r| {
                r.method == req.method && req.url.contains(&r.url_has) && body.contains(&r.body_has)
            })
            .ok_or_else(|| {
                Error::Transport(format!("no fake route for {:?} {}", req.method, req.url))
            })?;
        Ok(Response {
            status: route.status,
            headers: route.headers.clone(),
            body: route.body.clone().into_bytes(),
        })
    }
}
