/* Rouba Bichos: servidor de salas online (sem dependências, só Node 18+).
   Ele serve o jogo (index.html) e um WebSocket em /ws.
   Faz o papel de "retransmissor": guarda o estado de cada jogador da sala (presence)
   e manda para os outros só o que mudou. Quem cria a sala roda a partida no navegador. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8, MAX_CONNS = 600, MAX_MSG = 32 * 1024, MAX_VAL = 8 * 1024, MAX_PRES = 12 * 1024;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map();            // nome -> { clients:Set, dirty:{} }
let conns = 0;

function wsFrame(str) {
  const p = Buffer.from(str), n = p.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, p]);
}
function send(c, obj) { if (!c.dead) try { c.sock.write(wsFrame(JSON.stringify(obj))); } catch (e) { drop(c); } }

function drop(c) {
  if (c.dead) return; c.dead = true; conns--;
  try { c.sock.destroy(); } catch (e) {}
  const r = c.room && rooms.get(c.room);
  if (!r) return;
  r.clients.delete(c);
  delete r.dirty[c.id];
  r.clients.forEach(o => send(o, { t: 'l', id: c.id }));
  if (!r.clients.size) rooms.delete(c.room);
}

function onMsg(c, txt) {
  const now = Date.now();
  if (now - c.win > 1000) { c.win = now; c.cnt = 0; }
  if (++c.cnt > 150) return;                       // limite de mensagens por segundo
  let m; try { m = JSON.parse(txt); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join' && !c.room) {
    const name = String(m.room || '');
    if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return send(c, { t: 'err', code: 'bad_name' });
    let r = rooms.get(name);
    if (!r) { r = { clients: new Set(), dirty: {} }; rooms.set(name, r); }
    if (r.clients.size >= MAX_PLAYERS) return send(c, { t: 'err', code: 'full' });
    c.room = name; c.id = 'p' + crypto.randomBytes(5).toString('hex');
    c.pres = {}; c.pstr = {};
    const snap = {};
    r.clients.forEach(o => { snap[o.id] = o.pres; });
    snap[c.id] = c.pres;
    r.clients.add(c);
    r.dirty[c.id] = r.dirty[c.id] || {};          // avisa os outros que alguém entrou
    send(c, { t: 's', id: c.id, peers: snap });
  } else if (m.t === 'pr' && c.room && m.p && typeof m.p === 'object') {
    const r = rooms.get(c.room); if (!r) return;
    for (const k of Object.keys(m.p).slice(0, 20)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(k)) continue;
      const v = m.p[k];
      let js; try { js = JSON.stringify(v === undefined ? null : v); } catch (e) { continue; }
      if (js.length > MAX_VAL || c.pstr[k] === js) continue;
      c.pstr[k] = js;
      if (v === null) delete c.pres[k]; else c.pres[k] = v;
      (r.dirty[c.id] = r.dirty[c.id] || {})[k] = v === undefined ? null : v;
    }
    let total = 0; for (const k in c.pstr) total += c.pstr[k].length;
    if (total > MAX_PRES) drop(c);
  }
}

function parse(c, chunk) {
  c.buf = Buffer.concat([c.buf, chunk]); c.last = Date.now();
  while (c.buf.length >= 2 && !c.dead) {
    const b0 = c.buf[0], b1 = c.buf[1]; let len = b1 & 127, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
    if (!(b1 & 128) || len > MAX_MSG) return drop(c);          // cliente tem que mascarar
    if (c.buf.length < off + 4 + len) return;
    const mask = c.buf.subarray(off, off + 4), data = Buffer.from(c.buf.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(off + 4 + len);
    const op = b0 & 15, fin = !!(b0 & 128);
    if (op === 8) { try { c.sock.end(Buffer.from([0x88, 0])); } catch (e) {} return drop(c); }
    if (op === 9) { if (len < 126) c.sock.write(Buffer.concat([Buffer.from([0x8a, len]), data])); continue; }
    if (op === 10) continue;
    if (op === 1 || op === 0) {
      if (op === 1) c.frag = [];
      if (!c.frag) continue;
      c.frag.push(data);
      if (c.frag.reduce((s, b) => s + b.length, 0) > MAX_MSG) return drop(c);
      if (fin) { const txt = Buffer.concat(c.frag).toString('utf8'); c.frag = null; onMsg(c, txt); }
    }
  }
}

/* a cada 50 ms manda para cada jogador só o que mudou nos outros */
setInterval(() => {
  rooms.forEach(r => {
    const ids = Object.keys(r.dirty); if (!ids.length) return;
    const d = r.dirty; r.dirty = {};
    r.clients.forEach(c => {
      let out = null;
      for (const id of ids) if (id !== c.id) { (out = out || {})[id] = d[id]; }
      if (out) send(c, { t: 'd', d: out });
    });
  });
}, 50);
/* ping e limpeza de conexões mortas */
setInterval(() => {
  const now = Date.now();
  rooms.forEach(r => r.clients.forEach(c => {
    if (now - c.last > 45000) return drop(c);
    try { c.sock.write(Buffer.from([0x89, 0])); } catch (e) { drop(c); }
  }));
}, 15000);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, buf) => {
      if (err) { res.writeHead(500); return res.end('index.html não encontrado'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  } else if (url === '/health') { res.writeHead(200); res.end('ok'); }
  else { res.writeHead(404); res.end('não encontrado'); }
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !key || conns >= MAX_CONNS) return sock.destroy();
  const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  sock.setNoDelay(true); conns++;
  const c = { sock, buf: Buffer.alloc(0), room: null, id: '', pres: {}, pstr: {}, dead: false, last: Date.now(), win: 0, cnt: 0, frag: null };
  sock.on('data', d => parse(c, d));
  sock.on('close', () => drop(c)); sock.on('error', () => drop(c));
});
server.listen(PORT, () => console.log('Rouba Bichos no ar: http://localhost:' + PORT));
