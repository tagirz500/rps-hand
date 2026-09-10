// Networking for RPS Hand. No server of ours: PeerJS's free public broker only introduces two browsers to each
// other (signalling); the hand streams and game messages then go browser-to-browser over WebRTC data channels.
// Roles:  player  = a phone with the camera (tracks, streams its hands)
//         screen  = a PC browser linked to a player by the player's 6-digit code (renders, no camera)
// Matchmaking with no backend: lobby slots are PeerJS ids "rpsh-lobby-<k>". The first player to claim a slot waits
// there; the next player finds the id taken, dials it, and both then talk over their own player ids.
// Requires window.Peer (peerjs.min.js loaded by a classic <script> before this module).

const ICE = { iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },   // free public TURN relay for strict mobile NATs
] };
const LOBBIES = 6;
let wake = null;
async function keepAwake() {   // a sleeping phone drops the broker socket and its code; ask the screen to stay on while online
  try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(); });
const CODE_LEN = 3;   // owner: 3 digits are enough to type across the room
const rnd = () => String(Math.floor(10 ** (CODE_LEN - 1) + Math.random() * 9 * 10 ** (CODE_LEN - 1)));

export function myCode() {   // the player's "account": a short numeric code kept in this browser
  let c = null;
  try { c = localStorage.getItem("rpsh_code" + CODE_LEN); if (!c) { c = rnd(); localStorage.setItem("rpsh_code" + CODE_LEN, c); } } catch { c = rnd(); }
  return c;
}

// cb: { status(text), hands(pkt, from), game(msg, from), matched(role), lost(who) }
export function createNet(cb) {
  const code = myCode();
  const net = { code, peer: null, opp: null, screen: null, host: false, waiting: null, stats: { sent: 0, recv: 0, bytes: 0 } };
  const say = t => cb.status?.(t);

  function wire(conn, who) {                                  // attach a data connection as the opponent or the screen
    conn.on("data", m => {
      net.stats.recv++;
      if (m?.t === "h") { cb.hands?.(m, who); if (who === "opp" && net.screen?.open) net.screen.send({ ...m, who: "opp" }); }
      else if (m?.t === "g") { cb.game?.(m, who); if (who === "opp" && net.screen?.open) net.screen.send(m); }
    });
    conn.on("close", () => { if (net[who] === conn) { net[who] = null; cb.lost?.(who); say(who === "opp" ? "opponent left" : "screen disconnected"); } });
    conn.on("error", e => console.warn("conn error", who, e));
  }

  let retries = 0;
  function ensurePeer() {                                     // the player's own peer, id rpsh-<code>
    if (net.peer && !net.peer.destroyed) return net.peer;
    const p = net.peer = new Peer("rpsh-" + code, { config: ICE });
    p.on("open", () => { retries = 0; say("online as " + code); keepAwake(); });
    p.on("disconnected", () => { say("reconnecting…"); setTimeout(() => { if (!p.destroyed) p.reconnect(); }, 1000); });   // broker socket dropped (phone slept): come back
    p.on("error", e => {
      console.warn("peer error", e);
      if (e.type === "unavailable-id") {   // a stale registration from an earlier load of this page holds the code for up to a minute: retry
        if (retries++ < 20) { say("code " + code + " still registered, retrying… (" + retries + ")"); p.destroy(); setTimeout(ensurePeer, 3000); }
        else say("code " + code + " is in use elsewhere: close other tabs of this page");
      } else if (e.type === "network" || e.type === "server-error") { say("broker unreachable, retrying…"); p.destroy(); setTimeout(ensurePeer, 3000); }
    });
    p.on("connection", conn => {
      conn.on("open", () => {
        conn.once("data", m => {
          if (m?.t === "hello" && m.role === "screen") { net.screen = conn; wire(conn, "screen"); say("PC linked"); conn.send({ t: "hello", role: "player", code }); }
          else if (m?.t === "hello" && m.role === "player") { net.opp = conn; wire(conn, "opp"); net.host = false; say("matched (guest)"); conn.send({ t: "hello", role: "player", code }); cb.matched?.("guest"); }
        });
      });
    });
    return p;
  }

  net.findMatch = () => {                                     // random opponent: claim a lobby slot or join whoever holds one
    ensurePeer(); say("looking for a player…");
    const tryLobby = k => {
      if (k > LOBBIES) { say("no free lobby, tap ONLINE again"); return; }
      const id = "rpsh-lobby-" + k;
      const lobby = new Peer(id, { config: ICE });
      lobby.on("open", () => {                                // slot is free: wait here
        net.waiting = lobby; say("waiting for a player… (code " + code + ")");
        lobby.on("connection", c => c.on("open", () => c.once("data", m => {
          if (m?.t !== "hello" || !m.code) return;
          const conn = net.peer.connect("rpsh-" + m.code, { reliable: true });   // talk over player ids from now on
          conn.on("open", () => { conn.send({ t: "hello", role: "player", code }); net.opp = conn; wire(conn, "opp"); net.host = true; say("matched (host)"); cb.matched?.("host"); });
          setTimeout(() => { c.close(); lobby.destroy(); net.waiting = null; }, 1500);   // free the slot for the next pair
        })));
      });
      lobby.on("error", e => {
        if (e.type !== "unavailable-id") { console.warn("lobby error", e); return; }
        lobby.destroy();
        const c = net.peer.connect(id, { reliable: true });   // someone is waiting there: knock
        let answered = false;
        c.on("open", () => { c.send({ t: "hello", role: "player", code }); say("joining…"); });
        c.on("close", () => { if (!net.opp && !answered) setTimeout(() => tryLobby(k + 1), 300); });
        setTimeout(() => { if (!net.opp) { answered = true; c.close(); tryLobby(k + 1); } }, 6000);
      });
    };
    if (net.peer.open) tryLobby(1); else net.peer.once("open", () => tryLobby(1));
  };

  net.cancel = () => { net.waiting?.destroy(); net.waiting = null; say("online as " + code); };

  net.linkScreen = targetCode => {                            // PC side: become the screen of the player with this code
    const p = net.peer = new Peer(undefined, { config: ICE });
    let attempt = 0, conn = null;
    const dial = () => {
      attempt++; say(attempt === 1 ? "connecting to " + targetCode + "…" : `waiting for phone ${targetCode}… (${attempt}) open the page on the phone and keep it awake`);
      conn = p.connect("rpsh-" + targetCode, { reliable: true });
      conn.on("open", () => { conn.send({ t: "hello", role: "screen" }); say("linked to " + targetCode); keepAwake(); });
      conn.on("data", m => { net.stats.recv++; if (m?.t === "h") cb.hands?.(m, m.who || "me"); else if (m?.t === "g") cb.game?.(m, "player"); });
      conn.on("close", () => { say("phone disconnected, waiting…"); setTimeout(dial, 3000); });
      conn.on("error", e => say("link error: " + (e.type || e)));
    };
    p.on("open", dial);
    p.on("error", e => {   // peer-unavailable = no phone registered under that code right now: keep trying, the phone may still be loading or asleep
      if (e.type === "peer-unavailable") setTimeout(dial, 3000);
      else say("link failed: " + (e.type || e));
    });
  };

  net.sendHands = pkt => {                                    // pkt: { t:"h", who:"me", hands:[{n, a:[63], m}], ts }
    for (const c of [net.opp, net.screen]) if (c?.open) { c.send(pkt); net.stats.sent++; }
  };
  net.sendGame = (msg, screenOnly = false) => { for (const c of (screenOnly ? [net.screen] : [net.opp, net.screen])) if (c?.open) c.send({ t: "g", ...msg }); };
  net.start = () => ensurePeer();
  return net;
}
