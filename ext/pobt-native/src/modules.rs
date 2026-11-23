//! Stand-ins for the native modules POB ships for Windows only (`lcurl`,
//! `lzip`, `lua-utf8`), for every Lua state on other systems: the Lua half is
//! `modules.lua`, over the natives here.

use std::{io::Read, time::Duration};

use crate::{lua::Lua, native};

const MODULES: &str = include_str!("modules.lua");

/// Puts the stand-ins in `package.preload` of `l`.
pub fn open(l: Lua) {
    l.load(MODULES.as_bytes(), "pobt/modules.lua").expect("modules.lua");
    l.new_table();
    l.register(-1, "Http", n_http);
    l.register(-1, "ZipRead", n_zip_read);
    if let Err(e) = l.pcall(1, 0) {
        log::error!("modules.lua: {e}");
    }
}

// An HTTP request for `lcurl`: (url, post body or nil, headers one per line,
// user agent, proxy, follow redirects). Returns status, response headers
// (as curl passes them), body and the redirect's URL; or nil and an error.
native!(n_http, |l| {
    let url = l.string(1).unwrap_or_default();
    let body = l.bytes(2).map(<[u8]>::to_vec);
    let headers = l.string(3).unwrap_or_default();
    let agent = l.string(4).filter(|s| !s.is_empty());
    let proxy = l.string(5).filter(|s| !s.is_empty());
    let follow = l.bool(6);
    match http(&url, body.as_deref(), &headers, agent, proxy, follow) {
        Ok((status, head, body, redirect)) => {
            l.push_int(status as i64);
            l.push_str(&head);
            l.push_bytes(&body);
            match redirect {
                Some(r) => l.push_str(&r),
                None => l.push_nil(),
            }
            4
        }
        Err(e) => {
            log::warn!("{url}: {e}");
            l.push_nil();
            l.push_str(&e);
            2
        }
    }
});

type Response = (u16, String, Vec<u8>, Option<String>);

fn http(
    url: &str,
    body: Option<&[u8]>,
    headers: &str,
    agent: Option<String>,
    proxy: Option<String>,
    follow: bool,
) -> Result<Response, String> {
    let mut builder = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .redirects(if follow { 10 } else { 0 });
    if let Some(agent) = agent {
        builder = builder.user_agent(&agent);
    }
    if let Some(proxy) = proxy {
        builder = builder.proxy(ureq::Proxy::new(&proxy).map_err(|e| e.to_string())?);
    }
    let mut req = builder.build().request(if body.is_some() { "POST" } else { "GET" }, url);
    for line in headers.lines() {
        if let Some((name, value)) = line.split_once(':') {
            req = req.set(name.trim(), value.trim());
        }
    }
    let res = match body {
        Some(b) => req.send_bytes(b),
        None => req.call(),
    };
    let res = match res {
        Ok(r) | Err(ureq::Error::Status(_, r)) => r,
        Err(e) => return Err(e.to_string()),
    };
    let status = res.status();
    let mut head = format!("{} {} {}\r\n", res.http_version(), status, res.status_text());
    for name in res.headers_names() {
        for value in res.all(&name) {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
    }
    head.push_str("\r\n");
    let redirect = (300..400)
        .contains(&status)
        .then(|| res.header("location").map(str::to_string))
        .flatten()
        .map(|loc| absolute(res.get_url(), loc));
    let mut out = Vec::new();
    res.into_reader().read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok((status, head, out, redirect))
}

/// A redirect's `Location` as a whole URL, as curl reports it.
fn absolute(base: &str, loc: String) -> String {
    if loc.contains("://") {
        return loc;
    }
    // scheme://host, before the path.
    let host_start = base.find("://").map_or(0, |i| i + 3);
    let origin = &base[..base[host_start..].find('/').map_or(base.len(), |i| host_start + i)];
    if loc.starts_with('/') {
        format!("{origin}{loc}")
    } else {
        let dir = base.rsplit_once('/').filter(|(d, _)| d.len() >= origin.len()).map_or(origin, |(d, _)| d);
        format!("{dir}/{loc}")
    }
}

// One file of a zip archive for `lzip`: (archive, name) -> contents or nil.
native!(n_zip_read, |l| {
    let (archive, name) = (l.string(1).unwrap_or_default(), l.string(2).unwrap_or_default());
    let read = || -> Option<Vec<u8>> {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&archive).ok()?).ok()?;
        let mut file = zip.by_name(&name).ok()?;
        let mut out = Vec::new();
        file.read_to_end(&mut out).ok()?;
        Some(out)
    };
    match read() {
        Some(b) => l.push_bytes(&b),
        None => l.push_nil(),
    }
    1
});

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lua::Value;

    fn eval(code: &str) -> Vec<String> {
        crate::lua::init(&std::env::temp_dir()).unwrap();
        let l = Lua::new().unwrap();
        let base = l.top();
        l.load(code.as_bytes(), "test").unwrap();
        l.pcall(0, crate::lua::LUA_MULTRET).unwrap();
        let out = l.values_from(base + 1);
        l.close();
        out.iter()
            .map(|v| match v {
                Value::Str(s) => String::from_utf8_lossy(s).into_owned(),
                Value::Num(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                Value::Nil => "nil".into(),
            })
            .collect()
    }

    #[test]
    fn utf8_counts_characters() {
        let out = eval(
            r#"local u = require("lua-utf8")
            local s = "a火焰b"
            return u.len(s), u.sub(s, 2, 3), u.reverse(s), (u.next(s, 2, 1)), (u.next(s, 5, -1)),
                u.next(s, 8, 1), u.next(s, 1, -1), #u.match("ab 火焰", "%w*$"), u.find(s, "b", 1, true),
                (u.gsub(u.reverse("1234567"), "(%d%d%d)", "%1,"))"#,
        );
        assert_eq!(out, ["4", "火焰", "b焰火a", "5", "2", "nil", "nil", "6", "4", "765,432,1"]);
    }

    #[test]
    fn lcurl_and_lzip_load() {
        let out = eval(
            r#"local curl = require("lcurl.safe")
            local e = curl.easy()
            e:setopt_url("x"):setopt(curl.OPT_FOLLOWLOCATION, 1)
            return curl.OPT_FOLLOWLOCATION, e.opts.url, e.opts.followlocation, e:escape("a b/é"),
                require("lzip").open("/no/such.zip")"#,
        );
        assert_eq!(out, ["followlocation", "x", "1", "a%20b%2F%C3%A9", "nil"]);
    }

    #[test]
    #[ignore = "network"]
    fn lcurl_downloads() {
        let out = eval(
            r#"local curl = require("lcurl.safe")
            local e, body, head = curl.easy(), "", ""
            e:setopt_url("https://example.com/")
            e:setopt(curl.OPT_ACCEPT_ENCODING, "")
            e:setopt_headerfunction(function(d) head = head .. d return true end)
            e:setopt_writefunction(function(d) body = body .. d return true end)
            local ok, err = e:perform()
            return ok ~= nil, e:getinfo(curl.INFO_RESPONSE_CODE), body:match("<title>(.-)</title>"),
                head:match("^HTTP/%S+ 200") ~= nil"#,
        );
        assert_eq!(out, ["true", "200", "Example Domain", "true"]);
    }

    #[test]
    fn redirects_are_absolute() {
        assert_eq!(absolute("https://a.com/x/y?q", "/z".into()), "https://a.com/z");
        assert_eq!(absolute("https://a.com/x/y", "z".into()), "https://a.com/x/z");
        assert_eq!(absolute("https://a.com", "z".into()), "https://a.com/z");
        assert_eq!(absolute("https://a.com/x", "https://b.com/".into()), "https://b.com/");
    }
}
