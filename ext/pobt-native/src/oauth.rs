//! Path of Exile 2's characters, which its site gives only to an app the
//! account has let in (OAuth): signing in as Path of Building 2 does, in the
//! browser, with the site sending the browser back to a server here on
//! `localhost` with a code, which becomes a token (PKCE, no secret); the
//! token then asks `api.pathofexile.com`, and is renewed by its refresh token.

use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::account::Account;

/// Path of Building's client on the site, and the ports its sign-in comes
/// back to: those the site sends the browser to.
const CLIENT: &str = "pob";
const PORTS: [u16; 3] = [49082, 49083, 49084];
const SCOPES: &str = "account:profile account:characters";
const SITE: &str = "https://www.pathofexile.com/";
const API: &str = "https://api.pathofexile.com";
/// How long the user has to sign in, in the browser.
const WAIT: Duration = Duration::from_secs(300);

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn agent() -> String {
    format!(
        "POBT/{} (+https://github.com/huacnlee/pobt)",
        env!("CARGO_PKG_VERSION")
    )
}

/// `n` random bytes, base64url: the verifier and the state of a sign-in.
fn random(n: usize) -> String {
    let mut bytes = vec![0u8; n];
    getrandom::getrandom(&mut bytes).expect("no randomness");
    URL_SAFE_NO_PAD.encode(bytes)
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// A query's value, decoded.
fn param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| decode(v))
    })
}

fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' => match s
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                Some(v) => {
                    out.push(v);
                    i += 2;
                }
                None => out.push(b'%'),
            },
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The page the browser shows once back here.
fn page(ok: bool) -> String {
    let (title, text) = if ok {
        (
            "Signed in",
            "POBT has your Path of Exile 2 characters: you can close this page.",
        )
    } else {
        (
            "Not signed in",
            "The site did not let POBT in. Go back to POBT and try again.",
        )
    };
    format!(
        "<!doctype html><meta charset=utf-8><title>POBT</title><body style=\"background:#0b0b0d;color:#e8dcc0;font:16px system-ui;\
         display:flex;align-items:center;justify-content:center;height:90vh\"><div><h1 style=\"color:#d9b46c\">{title}</h1><p>{text}</p></div>"
    )
}

/// The first request with a code or an error that the browser makes to
/// `listener`, answered; its query.
fn wait_for_code(listener: &TcpListener) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("network: {e}"))?;
    let until = Instant::now() + WAIT;
    while Instant::now() < until {
        let stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => return Err(format!("network: {e}")),
        };
        // Anything else that connects (a favicon, a scanner) is answered and waited past.
        if let Some(query) = answer(stream) {
            return Ok(query);
        }
    }
    Err("signinTimeout".into())
}

fn answer(mut stream: TcpStream) -> Option<String> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut line = String::new();
    BufReader::new(&stream).read_line(&mut line).ok()?;
    let target = line.split_whitespace().nth(1).unwrap_or("");
    let query = target
        .split_once('?')
        .map(|(_, q)| q.to_string())
        .unwrap_or_default();
    let found = param(&query, "code").is_some() || param(&query, "error").is_some();
    let (status, body) = if found {
        ("200 OK", page(param(&query, "code").is_some()))
    } else {
        ("404 Not Found", String::new())
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
    found.then_some(query)
}

/// A token from the site's answer, kept in `account`.
fn keep(account: &mut Account, v: &Value) -> Result<(), String> {
    let token = v
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("signinFailed")?;
    account.token = token.to_string();
    account.refresh = v
        .get("refresh_token")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    account.expires = now() + v.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
    if let Some(name) = v.get("username").and_then(Value::as_str) {
        account.name = name.to_string();
    }
    Ok(())
}

/// A page that checks for a browser (Cloudflare's), in place of the site's answer: it refuses calls from programs on
/// some networks.
fn is_challenge(body: &str) -> bool {
    body.trim_start().starts_with('<')
        && (body.contains("Just a moment") || body.contains("_cf_chl"))
}

fn challenged(r: ureq::Response) -> bool {
    is_challenge(&r.into_string().unwrap_or_default())
}

fn token_call(form: &[(&str, &str)]) -> Result<Value, String> {
    let r = ureq::post(&format!("{SITE}oauth/token"))
        .timeout(Duration::from_secs(30))
        .set("User-Agent", &agent())
        .send_form(form);
    match r {
        Ok(r) => r
            .into_string()
            .ok()
            .and_then(|b| serde_json::from_str(&b).ok())
            .ok_or_else(|| "network: not JSON".into()),
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            log::warn!(
                "oauth: token HTTP {code}: {}",
                body.chars().take(300).collect::<String>()
            );
            Err(if code == 403 && is_challenge(&body) {
                "blocked"
            } else {
                "signinFailed"
            }
            .into())
        }
        Err(e) => Err(format!("network: {e}")),
    }
}

/// Signs in, in the browser: the account's token, and its name.
pub fn sign_in(account: &mut Account) -> Result<(), String> {
    let (listener, port) = PORTS
        .iter()
        .find_map(|&p| TcpListener::bind(("127.0.0.1", p)).ok().map(|l| (l, p)))
        .ok_or("signinPort")?;
    let verifier = random(48);
    let state = random(16);
    let redirect = format!("http://localhost:{port}");
    let url = format!(
        "{SITE}oauth/authorize?client_id={CLIENT}&response_type=code&scope={}&state={state}&redirect_uri={redirect}&code_challenge={}&code_challenge_method=S256",
        SCOPES.replace(' ', "%20"),
        challenge(&verifier),
    );
    crate::host::open_url(&url).map_err(|e| format!("network: {e}"))?;
    let query = wait_for_code(&listener)?;
    if param(&query, "state").as_deref() != Some(state.as_str()) {
        return Err("signinFailed".into());
    }
    let Some(code) = param(&query, "code") else {
        log::warn!(
            "oauth: {}",
            param(&query, "error_description")
                .or_else(|| param(&query, "error"))
                .unwrap_or_default()
        );
        return Err("signinDenied".into());
    };
    let v = token_call(&[
        ("client_id", CLIENT),
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", &redirect),
        ("scope", SCOPES),
        ("code_verifier", &verifier),
    ])?;
    keep(account, &v)?;
    if account.name.is_empty() {
        if let Ok(profile) = call(account, "/profile") {
            account.name = profile
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
        }
    }
    Ok(())
}

/// A new token by the refresh token, when there is one the site still takes.
fn refresh(account: &mut Account) -> bool {
    if account.refresh.is_empty() {
        return false;
    }
    let refresh = account.refresh.clone();
    match token_call(&[
        ("client_id", CLIENT),
        ("grant_type", "refresh_token"),
        ("refresh_token", &refresh),
    ]) {
        Ok(v) => keep(account, &v).is_ok(),
        Err(_) => false,
    }
}

/// One call with the token as it is; `Err("expired")` when the site no longer takes it.
fn call(account: &Account, path: &str) -> Result<Value, String> {
    log::info!("oauth: GET {API}{path}");
    let r = ureq::get(&format!("{API}{path}"))
        .timeout(Duration::from_secs(30))
        .set("User-Agent", &agent())
        .set("Authorization", &format!("Bearer {}", account.token))
        .call();
    match r {
        Ok(r) => r
            .into_string()
            .ok()
            .and_then(|b| serde_json::from_str(&b).ok())
            .ok_or_else(|| "network: not JSON".into()),
        Err(ureq::Error::Status(401, _)) => Err("expired".into()),
        Err(ureq::Error::Status(403, r)) => {
            Err(if challenged(r) { "blocked" } else { "private" }.into())
        }
        Err(ureq::Error::Status(404, _)) => Err("notFound".into()),
        Err(ureq::Error::Status(429, r)) => Err(format!(
            "rateLimited:{}",
            r.header("Retry-After").unwrap_or_default()
        )),
        Err(ureq::Error::Status(code, _)) => Err(format!("network: HTTP {code}")),
        Err(e) => Err(format!("network: {e}")),
    }
}

/// A call to the API as the account: its token renewed when it has expired,
/// or signed in again (`signing_in` said first) when it cannot be.
pub fn api(account: &mut Account, path: &str, signing_in: &dyn Fn()) -> Result<Value, String> {
    let mut fresh = false;
    if account.token.is_empty() || account.expires <= now() + 60 {
        fresh = refresh(account);
        if !fresh {
            signing_in();
            sign_in(account)?;
            fresh = true;
        }
    }
    match call(account, path) {
        Err(e) if e == "expired" && !fresh => {
            if !refresh(account) {
                signing_in();
                sign_in(account)?;
            }
            call(account, path).map_err(|e| {
                if e == "expired" {
                    "signinFailed".into()
                } else {
                    e
                }
            })
        }
        Err(e) if e == "expired" => Err("signinFailed".into()),
        out => out,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_queries() {
        assert_eq!(
            param("code=a%2Fb&state=x+y", "code").as_deref(),
            Some("a/b")
        );
        assert_eq!(
            param("code=a%2Fb&state=x+y", "state").as_deref(),
            Some("x y")
        );
        assert_eq!(param("code=a", "error"), None);
        assert_eq!(decode("100%"), "100%");
    }

    #[test]
    fn knows_a_browser_check() {
        assert!(is_challenge(
            "<!DOCTYPE html><html><head><title>Just a moment...</title>"
        ));
        assert!(!is_challenge(r#"{"error":"invalid_grant"}"#));
    }

    /// The challenge of RFC 7636's example verifier.
    #[test]
    fn pkce_challenge() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_ne!(random(16), random(16));
    }

    /// The browser's request answered, and its query given back; others not.
    #[test]
    fn answers_the_browser() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for target in ["/favicon.ico", "/?code=abc&state=s"] {
                let mut s = TcpStream::connect(addr).unwrap();
                write!(s, "GET {target} HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
                let mut out = String::new();
                let _ = std::io::Read::read_to_string(&mut s, &mut out);
            }
        });
        assert_eq!(wait_for_code(&listener).unwrap(), "code=abc&state=s");
    }
}
