//! Desktop Hub login bridge: open the system browser on a free loopback port.
//! The embedded Tauri WebKit webview cannot reliably hold Nimiq Hub keys.
//! Real Chrome/Safari can.
//!
//! Binds `127.0.0.1:0` so the OS assigns an empty port.
//! Login page uses full-page Hub redirects (no popups).
//! Hub return is parsed from the URL hash without requiring document.referrer
//! (HTTPS Hub → HTTP localhost often strips referrer, which stuck HubApi).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde::Serialize;

const APP_NAME: &str = "VeriLock";
const API_BASE: &str = "https://verilock.online";
const HUB_ENDPOINT: &str = "https://hub.nimiq.com";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// Bundled Hub client so we do not depend on CDN availability.
const HUB_API_JS: &str =
  include_str!("../../node_modules/@nimiq/hub-api/dist/standalone/HubApi.standalone.umd.js");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSession {
  pub token: String,
  pub address: String,
}

/// Bind an ephemeral port (OS picks a free one), open system browser, wait for session POST.
pub fn run_hub_login_bridge() -> Result<BridgeSession, String> {
  let listener =
    TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Could not bind login port: {e}"))?;
  listener
    .set_nonblocking(false)
    .map_err(|e| format!("Could not configure login port: {e}"))?;
  let port = listener
    .local_addr()
    .map_err(|e| e.to_string())?
    .port();
  let base = format!("http://127.0.0.1:{port}");
  let login_url = format!("{base}/");

  let (tx, rx) = mpsc::channel::<Result<BridgeSession, String>>();

  let base_for_page = base.clone();
  thread::spawn(move || {
    if let Err(e) = serve_login_bridge(listener, base_for_page, tx.clone()) {
      let _ = tx.send(Err(e));
    }
  });

  open::that(&login_url).map_err(|e| {
    format!("Could not open your browser at {login_url}. Open that URL manually. ({e})")
  })?;

  match rx.recv_timeout(LOGIN_TIMEOUT) {
    Ok(Ok(session)) => Ok(session),
    Ok(Err(e)) => Err(e),
    Err(mpsc::RecvTimeoutError::Timeout) => Err(
      "Login timed out. In the browser tab, click Continue, wait until Hub shows addresses, then approve."
        .into(),
    ),
    Err(mpsc::RecvTimeoutError::Disconnected) => {
      Err("Login bridge closed before a session was received.".into())
    }
  }
}

fn serve_login_bridge(
  listener: TcpListener,
  base_url: String,
  tx: mpsc::Sender<Result<BridgeSession, String>>,
) -> Result<(), String> {
  for _ in 0..256 {
    let (mut stream, _) = match listener.accept() {
      Ok(v) => v,
      Err(e) => {
        let _ = tx.send(Err(format!("Login bridge accept failed: {e}")));
        return Err(e.to_string());
      }
    };

    let mut buf = vec![0u8; 65536];
    let n = stream.read(&mut buf).unwrap_or(0);
    let raw = String::from_utf8_lossy(&buf[..n]);
    let (method, path, body) = parse_http_request(&raw);

    match (method.as_str(), path.as_str()) {
      ("GET", "/") | ("GET", "/index.html") => {
        let html = login_page_html(&base_url);
        write_response(&mut stream, 200, "text/html; charset=utf-8", &html);
      }
      ("GET", "/hub-api.js") => {
        write_response(
          &mut stream,
          200,
          "application/javascript; charset=utf-8",
          HUB_API_JS,
        );
      }
      ("POST", "/session") => match parse_session_body(&body) {
        Ok(session) => {
          write_response(&mut stream, 200, "application/json", r#"{"ok":true}"#);
          let _ = tx.send(Ok(session));
          return Ok(());
        }
        Err(e) => {
          write_response(
            &mut stream,
            400,
            "application/json",
            &format!(r#"{{"ok":false,"error":{}}}"#, json_escape(&e)),
          );
        }
      },
      ("GET", "/done") => {
        write_response(&mut stream, 200, "text/html; charset=utf-8", DONE_HTML);
      }
      ("GET", "/favicon.ico") => {
        write_response(&mut stream, 204, "text/plain", "");
      }
      ("OPTIONS", _) => {
        write_cors_options(&mut stream);
      }
      _ => {
        write_response(&mut stream, 404, "text/plain", "Not found");
      }
    }
  }
  let _ = tx.send(Err("Login bridge stopped without a session.".into()));
  Ok(())
}

fn parse_http_request(raw: &str) -> (String, String, String) {
  let mut lines = raw.split("\r\n");
  let request_line = lines.next().unwrap_or("GET / HTTP/1.1");
  let mut parts = request_line.split_whitespace();
  let method = parts.next().unwrap_or("GET").to_string();
  let path = parts.next().unwrap_or("/").to_string();
  let path = path.split('?').next().unwrap_or("/").to_string();

  let mut content_length = 0usize;
  for line in lines.by_ref() {
    if line.is_empty() {
      break;
    }
    let lower = line.to_ascii_lowercase();
    if let Some(v) = lower.strip_prefix("content-length:") {
      content_length = v.trim().parse().unwrap_or(0);
    }
  }
  let body = if let Some(idx) = raw.find("\r\n\r\n") {
    let b = &raw[idx + 4..];
    if content_length > 0 && b.len() >= content_length {
      b[..content_length].to_string()
    } else {
      b.to_string()
    }
  } else {
    String::new()
  };
  (method, path, body)
}

fn parse_session_body(body: &str) -> Result<BridgeSession, String> {
  let v: serde_json::Value =
    serde_json::from_str(body).map_err(|e| format!("Invalid session JSON: {e}"))?;
  let token = v
    .get("token")
    .and_then(|x| x.as_str())
    .unwrap_or("")
    .trim()
    .to_string();
  let address = v
    .get("address")
    .and_then(|x| x.as_str())
    .unwrap_or("")
    .trim()
    .to_string();
  if token.is_empty() || address.is_empty() {
    return Err("Session missing token or address".into());
  }
  if token.len() > 200 || address.len() > 80 {
    return Err("Session fields too large".into());
  }
  Ok(BridgeSession { token, address })
}

fn write_response(stream: &mut impl Write, status: u16, content_type: &str, body: &str) {
  let reason = match status {
    200 => "OK",
    204 => "No Content",
    400 => "Bad Request",
    404 => "Not Found",
    _ => "Error",
  };
  let header = format!(
    "HTTP/1.1 {status} {reason}\r\n\
     Content-Type: {content_type}\r\n\
     Content-Length: {}\r\n\
     Connection: close\r\n\
     Access-Control-Allow-Origin: *\r\n\
     Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
     Access-Control-Allow-Headers: content-type\r\n\
     Cache-Control: no-store\r\n\
     \r\n",
    body.len()
  );
  let _ = stream.write_all(header.as_bytes());
  let _ = stream.write_all(body.as_bytes());
  let _ = stream.flush();
}

fn write_cors_options(stream: &mut impl Write) {
  let header = "HTTP/1.1 204 No Content\r\n\
     Connection: close\r\n\
     Access-Control-Allow-Origin: *\r\n\
     Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
     Access-Control-Allow-Headers: content-type\r\n\
     Content-Length: 0\r\n\
     \r\n";
  let _ = stream.write_all(header.as_bytes());
  let _ = stream.flush();
}

fn json_escape(s: &str) -> String {
  serde_json::to_string(s).unwrap_or_else(|_| "\"error\"".into())
}

const DONE_HTML: &str = r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Logged in</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#0f172a}
  .ok{color:#047857;font-weight:650}
</style></head><body>
  <p class="ok">You're logged in.</p>
  <p>Return to the VeriLock Offline app. You can close this tab.</p>
</body></html>"#;

fn login_page_html(base_url: &str) -> String {
  format!(
    r##"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>VeriLock · Nimiq login</title>
  <style>
    :root {{ font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #fafdfc; }}
    body {{ max-width: 26rem; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.5; }}
    h1 {{ font-size: 1.25rem; letter-spacing: -0.02em; margin: 0 0 0.5rem; }}
    p {{ color: #64748b; margin: 0 0 1rem; }}
    button {{
      appearance: none; border: 0; background: #0d9488; color: #fff;
      font: inherit; font-weight: 650; padding: 0.7rem 1.1rem; border-radius: 8px; cursor: pointer;
    }}
    button:disabled {{ opacity: 0.55; cursor: not-allowed; }}
    .status {{ font-weight: 600; margin-top: 1rem; white-space: pre-wrap; }}
    .err {{ color: #b91c1c; }}
    .ok {{ color: #047857; }}
    .pending {{ color: #0d9488; }}
    code {{ font-size: 0.85em; }}
  </style>
</head>
<body>
  <h1>Log in with Nimiq</h1>
  <p>
    Click the button when ready. Nimiq Hub opens <strong>in this tab</strong> (no popup).
    Wait until your addresses finish loading, then approve.
  </p>
  <p>
    Document files never leave the offline app. Only a short session is created on
    <code>verilock.online</code>.
  </p>
  <button type="button" id="go">Continue with Nimiq</button>
  <p id="status" class="status" role="status"></p>
  <script src="/hub-api.js"></script>
  <script>
    const API = {api_base};
    const HUB = {hub};
    const APP = {app};
    const RETURN_URL = {return_url};
    const RPC_KEY = 'rpcRequests';
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('go');

    function setStatus(msg, cls) {{
      statusEl.textContent = msg || '';
      statusEl.className = 'status' + (cls ? ' ' + cls : '');
    }}

    function bytesToHex(bytes) {{
      if (!bytes) return '';
      if (typeof bytes === 'string') {{
        // already hex?
        if (/^[0-9a-fA-F]+$/.test(bytes) && bytes.length % 2 === 0) return bytes.toLowerCase();
        // base64 fallback
        try {{
          const bin = atob(bytes);
          let hex = '';
          for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
          return hex;
        }} catch (_) {{ return bytes; }}
      }}
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }}

    // Hub JSON revives Uint8Array as {{__:0, v:"base64..."}}
    function parseHubJson(raw) {{
      return JSON.parse(raw, (_k, v) => {{
        if (v && typeof v === 'object' && v.__ === 0 && typeof v.v === 'string') {{
          const bin = atob(v.v);
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          return out;
        }}
        return v;
      }});
    }}

    function friendlyError(err) {{
      const msg = (err && err.message) ? err.message : String(err || '');
      if (/keyId not found|Fetching Addresses|Syncing with the network|Could not read Login File/i.test(msg)) {{
        return 'Hub was still syncing your wallet. Wait until addresses fully load in Hub, then try again.';
      }}
      if (/cancel/i.test(msg)) return 'Login canceled.';
      if (/popup|blocked/i.test(msg)) return 'Popup blocked — use the button so Hub opens in this tab.';
      return msg || 'Login failed';
    }}

    function getHub() {{
      if (typeof HubApi === 'undefined') throw new Error('Hub library failed to load.');
      return new HubApi(HUB);
    }}

    function redirectBehavior(state) {{
      return new HubApi.RedirectRequestBehavior(RETURN_URL, state || {{}});
    }}

    /** Read Hub return payload without requiring document.referrer (often empty HTTPS→HTTP). */
    function peekRedirect() {{
      const frag = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      if (!frag.has('id') || !frag.has('status') || !frag.has('result')) return null;
      const id = parseInt(frag.get('id'), 10);
      if (!Number.isFinite(id)) return null;
      const status = frag.get('status') === 'ok' ? 'ok' : 'error';
      let result;
      try {{ result = parseHubJson(frag.get('result')); }}
      catch (e) {{ return {{ id, status: 'error', result: {{ message: 'Could not parse Hub response' }} }}; }}
      return {{ id, status, result }};
    }}

    function consumeRedirectHash() {{
      const url = new URL(location.href);
      const frag = new URLSearchParams((url.hash || '').replace(/^#/, ''));
      frag.delete('id'); frag.delete('status'); frag.delete('result');
      url.hash = frag.toString() ? '#' + frag.toString() : '';
      history.replaceState(history.state, '', url.href);
    }}

    function loadStoredRpc(id) {{
      try {{
        const raw = sessionStorage.getItem(RPC_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const entry = parsed[id] || parsed[String(id)];
        if (!entry) return null;
        return {{ command: entry[0], state: entry[1] }};
      }} catch (_) {{ return null; }}
    }}

    function clearStoredRpc(id) {{
      try {{
        const raw = sessionStorage.getItem(RPC_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        delete parsed[id];
        delete parsed[String(id)];
        sessionStorage.setItem(RPC_KEY, JSON.stringify(parsed));
      }} catch (_) {{}}
    }}

    async function challengeFor(address) {{
      const chRes = await fetch(API + '/api/auth/challenge', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
        body: JSON.stringify({{ address }}),
      }});
      if (!chRes.ok) {{
        const t = await chRes.text().catch(() => '');
        throw new Error('Login challenge failed (' + chRes.status + ')' + (t ? ': ' + t.slice(0, 120) : ''));
      }}
      return chRes.json();
    }}

    async function finishLogin(result) {{
      setStatus('Verifying with verilock.online…', 'pending');
      const publicKey = bytesToHex(result.publicKey);
      const signature = bytesToHex(result.signature);
      if (!publicKey || !signature) throw new Error('Hub did not return a complete signature.');
      const vRes = await fetch(API + '/api/auth/verify', {{
        method: 'POST',
        headers: {{
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer ' + result.token,
        }},
        body: JSON.stringify({{ publicKey, signature, authScheme: 'hub' }}),
      }});
      if (!vRes.ok) {{
        const t = await vRes.text().catch(() => '');
        throw new Error('Wallet signature was not accepted' + (t ? ': ' + t.slice(0, 120) : ''));
      }}
      const verified = await vRes.json();
      if (!verified.ok) throw new Error('Wallet signature was not accepted');
      const session = {{
        token: result.token,
        address: verified.address || result.address,
      }};
      setStatus('Sending session to the desktop app…', 'pending');
      const post = await fetch('/session', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify(session),
      }});
      if (!post.ok) throw new Error('Could not return session to the desktop app');
      setStatus('Logged in — return to VeriLock Offline. You can close this tab.', 'ok');
      btn.disabled = true;
      btn.textContent = 'Done';
    }}

    async function handleChooseAddress(chosen) {{
      btn.disabled = true;
      setStatus('Address chosen — preparing signature…', 'pending');
      const address = chosen.address;
      if (!address) throw new Error('Hub did not return an address.');
      const challenge = await challengeFor(address);
      setStatus('Redirecting to Nimiq Hub to sign…', 'pending');
      const hub = getHub();
      await hub.signMessage(
        {{ appName: APP, message: challenge.nonce, signer: address }},
        redirectBehavior({{ token: challenge.token }}),
      );
    }}

    async function handleSignMessage(signed, state) {{
      const token = state && state.token;
      if (!token) throw new Error('Login session expired — click Continue and try again.');
      btn.disabled = true;
      await finishLogin({{
        token,
        address: signed.signer,
        publicKey: signed.signerPublicKey,
        signature: signed.signature,
      }});
    }}

    /** Process Hub return using URL hash + sessionStorage (no referrer required). */
    async function processLenientReturn() {{
      const redirect = peekRedirect();
      if (!redirect) return false;

      const stored = loadStoredRpc(redirect.id);
      const command = stored ? stored.command : null;
      const state = stored ? stored.state : null;

      consumeRedirectHash();
      clearStoredRpc(redirect.id);

      if (redirect.status === 'error') {{
        const msg = (redirect.result && redirect.result.message) || 'Hub request failed';
        throw new Error(msg);
      }}

      // choose-address step
      if (command === 'choose-address' || command === HubApi.RequestType.CHOOSE_ADDRESS ||
          (redirect.result && redirect.result.address && !redirect.result.signer)) {{
        await handleChooseAddress(redirect.result);
        return true;
      }}

      // sign-message step
      if (command === 'sign-message' || command === HubApi.RequestType.SIGN_MESSAGE ||
          (redirect.result && redirect.result.signer)) {{
        await handleSignMessage(redirect.result, state || {{}});
        return true;
      }}

      throw new Error('Unexpected Hub return (command: ' + (command || 'unknown') + '). Click Continue to try again.');
    }}

    async function startLogin() {{
      btn.disabled = true;
      setStatus('Redirecting to Nimiq Hub…', 'pending');
      try {{
        // If a prior Hub return is still in the hash, process it first.
        if (peekRedirect()) {{
          await processLenientReturn();
          return;
        }}
        const hub = getHub();
        await hub.chooseAddress(
          {{ appName: APP }},
          redirectBehavior({{ flow: 'login' }}),
        );
        setStatus('Waiting for Nimiq Hub…', 'pending');
      }} catch (err) {{
        setStatus(friendlyError(err), 'err');
        btn.disabled = false;
        btn.textContent = 'Try again';
      }}
    }}

    btn.addEventListener('click', () => {{ void startLogin(); }});

    // On load: if this is a Hub return, process automatically (no second popup/start).
    (async function boot() {{
      try {{
        if (typeof HubApi === 'undefined') {{
          setStatus('Hub library failed to load.', 'err');
          return;
        }}
        if (peekRedirect()) {{
          btn.disabled = true;
          setStatus('Returning from Nimiq Hub…', 'pending');
          await processLenientReturn();
        }}
      }} catch (err) {{
        setStatus(friendlyError(err), 'err');
        btn.disabled = false;
        btn.textContent = 'Try again';
      }}
    }})();
  </script>
</body>
</html>
"##,
    api_base = serde_json::to_string(API_BASE).unwrap(),
    hub = serde_json::to_string(HUB_ENDPOINT).unwrap(),
    app = serde_json::to_string(APP_NAME).unwrap(),
    return_url = serde_json::to_string(base_url).unwrap(),
  )
}
