const COLORS = ['pink', 'blue', 'purple', 'yellow', 'green', 'cyan'];
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = (cls) => el('i', cls);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/*STORE*/
const req = async (url, method = 'GET', data) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erro');
  return r.status === 204 ? null : r.json();
};
const store = {
  notebooks: () => req('/api/notebooks'),
  saveNotebook: (d, id) => req(id ? `/api/notebooks/${id}` : '/api/notebooks', id ? 'PUT' : 'POST', d),
  deleteNotebook: (id) => req(`/api/notebooks/${id}`, 'DELETE'),
  notes: (q, nb) => req(`/api/notes?q=${encodeURIComponent(q)}${nb ? '&notebook_id=' + nb : ''}`),
  saveNote: (d, id) => req(id ? `/api/notes/${id}` : '/api/notes', id ? 'PUT' : 'POST', d),
  deleteNote: (id) => req(`/api/notes/${id}`, 'DELETE'),
};
/*END*/

const S = { view: 'notes', nbs: [], notes: [], filter: null, showHidden: false };
let imgs = [], auds = [], editing = null, editingNb = null, color = COLORS[0], nbColor = COLORS[0], pickNb = null;
const run = async (fn) => { try { await fn(); } catch (e) { alert(e.message || 'Erro'); } };

/* ---------- toque longo ---------- */
function attachPress(node, onTap, onHold) {
  let timer, sx, sy, fired = false;
  const cancel = () => { clearTimeout(timer); node.classList.remove('pressing'); };
  node.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    fired = false; sx = e.clientX; sy = e.clientY;
    node.classList.add('pressing');
    timer = setTimeout(() => {
      fired = true; node.classList.remove('pressing');
      if (navigator.vibrate) navigator.vibrate(15);
      onHold();
    }, 500);
  });
  node.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => node.addEventListener(ev, cancel));
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); onHold(); });
  node.addEventListener('click', () => { if (fired) { fired = false; return; } onTap(); });
}

/* ---------- renderização ---------- */
function renderChips() {
  const box = $('chips'); box.replaceChildren();
  const mk = (label, id, c) => {
    const b = el('button', 'chip'); b.type = 'button';
    b.setAttribute('aria-pressed', String(S.filter === id));
    if (c) { const d = el('span', 'dot-sm'); d.style.setProperty('--c', `var(--${c})`); b.append(d); }
    b.append(label);
    b.onclick = () => { S.filter = id; refresh(); };
    box.append(b);
  };
  mk('Todos', null);
  S.nbs.forEach((b) => mk(b.name, b.id, b.color));
  const nh = S.notes.filter((n) => hid.has(n.id)).length;
  if (nh || S.showHidden) {
    const b = el('button', 'chip'); b.type = 'button'; b.setAttribute('aria-pressed', String(S.showHidden));
    b.append(icon('fa-solid fa-eye-slash'), `Ocultas (${nh})`);
    b.onclick = () => { S.showHidden = !S.showHidden; refresh(); };
    box.append(b);
  }
}

function renderNotes() {
  const list = $('list'); list.replaceChildren();
  const shown = S.notes.filter((n) => hid.has(n.id) === S.showHidden);
  $('empty').hidden = shown.length > 0;
  if (S.showHidden) $('empty').textContent = 'Nenhuma nota oculta.';
  for (const n of shown.sort((a, b) => pins.has(b.id) - pins.has(a.id))) {
    const card = el('button', 'note'); card.type = 'button';
    const d = el('span', 'dot'); d.style.setProperty('--c', `var(--${n.color})`);
    if (n.images && n.images.length) { const im = el('img', 'cover'); im.src = n.images[0]; im.alt = ''; im.loading = 'lazy'; card.append(im); }
    card.append(el('h3', '', n.title), el('p', '', n.content), d);
    if (pins.has(n.id)) { card.classList.add('pinned'); const pm = el('span', 'pin-mark'); pm.append(icon('fa-solid fa-thumbtack')); card.append(pm); }
    if (n.audios && n.audios.length) {
      const bd = el('span', 'badge'); bd.append(icon('fa-solid fa-microphone'), String(n.audios.length));
      bd.setAttribute('aria-label', plural(n.audios.length, 'áudio', 'áudios')); card.append(bd);
    }
    attachPress(card, () => openSheet(n), () => openMenu('note', n));
    attachSwipe(card, n);
    list.append(card);
  }
}

function renderNotebooks() {
  const box = $('nb-list'); box.replaceChildren();
  $('nb-empty').hidden = S.nbs.length > 0;
  for (const b of S.nbs) {
    const card = el('button', 'nb-card'); card.type = 'button';
    const ico = el('span', 'nb-ico'); ico.style.setProperty('--c', `var(--${b.color})`); ico.append(icon('fa-solid fa-book'));
    const meta = el('div', 'nb-meta'); meta.append(el('h3', '', b.name), el('p', '', plural(b.count, 'nota', 'notas')));
    card.append(ico, meta, icon('fa-solid fa-chevron-right'));
    attachPress(card, () => { S.filter = b.id; setView('notes'); }, () => openMenu('notebook', b));
    box.append(card);
  }
}

function setView(v) {
  S.view = v;
  $('view-notes').hidden = v !== 'notes';
  $('view-notebooks').hidden = v !== 'notebooks';
  $('screen-title').textContent = v === 'notes' ? 'Quicknote' : 'Cadernos';
  $('add').setAttribute('aria-label', v === 'notes' ? 'Nova nota' : 'Novo caderno');
  document.querySelectorAll('[data-nav]').forEach((b) => {
    if (b.dataset.nav === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  scrollTo(0, 0);
  refresh();
}
document.querySelectorAll('[data-nav]').forEach((b) => { b.onclick = () => setView(b.dataset.nav); });

async function refresh() {
  try {
    S.nbs = await store.notebooks();
    if (S.filter && !S.nbs.some((b) => b.id === S.filter)) S.filter = null;
    S.notes = await store.notes($('q').value, S.filter);
    $('empty').textContent = 'Nenhuma nota aqui ainda.';
  } catch (e) {
    S.notes = []; $('empty').textContent = 'Não foi possível carregar as notas.';
  }
  renderChips(); renderNotes(); renderNotebooks();
}

/* ---------- seletores de cor e caderno ---------- */
function drawSwatches(box, current, onPick) {
  box.replaceChildren();
  for (const c of COLORS) {
    const b = el('button', 'swatch'); b.type = 'button';
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c); b.setAttribute('aria-checked', String(c === current));
    b.style.setProperty('--c', `var(--${c})`); b.append(icon('fa-solid fa-check'));
    b.onclick = () => { onPick(c); drawSwatches(box, c, onPick); };
    box.append(b);
  }
}
function drawPick() {
  const box = $('nb-pick'); box.replaceChildren();
  for (const b of S.nbs) {
    const c = el('button', 'chip'); c.type = 'button';
    c.setAttribute('role', 'radio'); c.setAttribute('aria-checked', String(b.id === pickNb));
    const d = el('span', 'dot-sm'); d.style.setProperty('--c', `var(--${b.color})`);
    c.append(d, b.name);
    c.onclick = () => { pickNb = b.id; drawPick(); };
    box.append(c);
  }
}

/* ---------- editor de nota ---------- */
const sheet = $('sheet');
function openSheet(n, edit) {
  editing = n || null;
  color = n ? n.color : COLORS[0];
  pickNb = n ? n.notebook_id : (S.filter || (S.nbs[0] && S.nbs[0].id));
  $('sheet-title').textContent = n ? 'Editar nota' : 'Nova nota';
  $('title').value = n ? n.title : '';
  $('content').value = n ? n.content : '';
  
  imgs = n && n.images ? [...n.images] : []; drawThumbs();
  auds = n && n.audios ? [...n.audios] : []; drawAudios();
  drawPick(); drawSwatches($('colors'), color, (c) => { color = c; });
  sheet.hidden = false; updateCount();
  const rd = !!n && !edit; setReading(rd);
  if (!rd) $('title').focus();
}
const closeSheet = () => { cancelRec(); hideKb(); sheet.hidden = true; };
$('form').onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await stopRec();
    await store.saveNote({ title: $('title').value, content: $('content').value, color, notebook_id: pickNb, images: imgs, audios: auds }, editing && editing.id);
    closeSheet(); await refresh();
  });
};
$('close').onclick = closeSheet;
sheet.onclick = (e) => { if (e.target === sheet) closeSheet(); };


/* ---------- modo leitura, fixar, copiar, compartilhar ---------- */
const form = $('form'), SIZES = [16, 18, 21, 25], SIZE_NAMES = ['pequeno', 'médio', 'grande', 'extra grande'];
let sizeIdx = 1;
try { const v = localStorage.getItem('rsize'); if (v !== null) sizeIdx = Math.min(3, Math.max(0, parseInt(v, 10) || 0)); } catch (e) {}
const applySize = () => document.documentElement.style.setProperty('--read-size', SIZES[sizeIdx] + 'px');
applySize();
const pins = new Set();
try { JSON.parse(localStorage.getItem('pins') || '[]').forEach((i) => pins.add(i)); } catch (e) {}
const savePins = () => { try { localStorage.setItem('pins', JSON.stringify([...pins])); } catch (e) {} };
let toastT;
let undoFn = null;
function toast(msg, undo) {
  const t = $('toast'); t.textContent = msg; undoFn = undo || null;
  if (undo) { const b = el('button', 'toast-undo', 'Desfazer'); b.type = 'button'; t.append(b); }
  t.classList.toggle('act', !!undo); t.classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove('on'); undoFn = null; }, undo ? 4500 : 1600);
}
$('toast').onclick = (e) => {
  if (!e.target.closest('.toast-undo') || !undoFn) return;
  const f = undoFn; undoFn = null; $('toast').classList.remove('on'); f();
};
const words = (s) => (s.trim().match(/\S+/g) || []).length;
function updateCount() {
  const v = $('content').value;
  $('count').textContent = `${plural(words(v), 'palavra', 'palavras')}, ${plural(v.length, 'caractere', 'caracteres')}`;
}
$('content').addEventListener('input', updateCount);

function linkify(box, text) {
  box.replaceChildren();
  const re = /https?:\/\/[^\s<]+/g; let last = 0, m;
  while ((m = re.exec(text))) {
    const url = m[0].replace(/[.,;:!?)]+$/, '');
    if (m.index > last) box.append(text.slice(last, m.index));
    const a = el('a', '', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.append(a);
    last = m.index + url.length; re.lastIndex = last;
  }
  if (last < text.length) box.append(text.slice(last));
}
function updatePin() {
  const on = !!editing && pins.has(editing.id);
  $('pin').setAttribute('aria-pressed', String(on));
  $('pin').setAttribute('aria-label', on ? 'Desafixar nota' : 'Fixar nota');
  $('pin').hidden = !editing;
}
function setReading(on) {
  form.classList.toggle('reading', on);
  $('sheet-title').textContent = on ? 'Nota' : editing ? 'Editar nota' : 'Nova nota';
  if (!on) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  hideKb();
  const body = $('content').value, nb = S.nbs.find((b) => b.id === editing.notebook_id);
  $('read-title').textContent = $('title').value;
  $('read-meta').textContent = [nb && nb.name, plural(words(body), 'palavra', 'palavras')].filter(Boolean).join(', ');
  $('read-body').classList.toggle('none', !body.trim());
  if (body.trim()) linkify($('read-body'), body); else $('read-body').textContent = 'Nota sem texto. Toque para escrever.';
  updatePin(); $('share').hidden = !navigator.share;
}
$('edit-btn').onclick = () => {
  setReading(false);
  const c = $('content'); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
};
$('read-body').onclick = (e) => { if (e.target.closest('a') || String(getSelection()).length) return; $('edit-btn').click(); };
$('pin').onclick = () => {
  if (!editing) return;
  const on = !pins.has(editing.id);
  if (on) pins.add(editing.id); else pins.delete(editing.id);
  savePins(); updatePin(); renderNotes(); toast(on ? 'Nota fixada' : 'Nota desafixada');
};
$('fsize').onclick = () => {
  sizeIdx = (sizeIdx + 1) % SIZES.length; applySize();
  try { localStorage.setItem('rsize', sizeIdx); } catch (e) {}
  toast('Texto ' + SIZE_NAMES[sizeIdx]);
};
$('copy').onclick = async () => {
  const t = $('title').value + '\n\n' + $('content').value; let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (x) {} ta.remove();
  }
  toast(ok ? 'Nota copiada' : 'Não foi possível copiar');
};
$('share').onclick = () => { navigator.share({ title: $('title').value, text: $('content').value }).catch(() => {}); };

/* ---------- ocultar notas e gestos de arrastar ---------- */
const hid = new Set();
try { JSON.parse(localStorage.getItem('hidden') || '[]').forEach((i) => hid.add(i)); } catch (e) {}
const saveHid = () => { try { localStorage.setItem('hidden', JSON.stringify([...hid])); } catch (e) {} };
function toggleHide(n) {
  const was = hid.has(n.id);
  if (was) hid.delete(n.id); else hid.add(n.id);
  saveHid(); renderChips(); renderNotes();
  toast(was ? 'Nota reexibida' : 'Nota oculta', () => {
    if (was) hid.add(n.id); else hid.delete(n.id);
    saveHid(); renderChips(); renderNotes();
  });
}
function attachSwipe(card, n) {
  const SW = 90;
  let sx = 0, sy = 0, dx = 0, on = false, swiped = false, id = null;
  if (S.showHidden) card.classList.add('unhide');
  const reset = () => {
    card.style.transition = 'transform .2s'; card.style.transform = '';
    card.classList.remove('sw-del', 'sw-hide');
    setTimeout(() => { card.style.transition = ''; }, 220);
  };
  card.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    sx = e.clientX; sy = e.clientY; dx = 0; on = false; id = e.pointerId;
  });
  card.addEventListener('pointermove', (e) => {
    if (id !== e.pointerId) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!on) {
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) { on = true; card.style.transition = 'none'; try { card.setPointerCapture(e.pointerId); } catch (x) {} }
      else return;
    }
    dx = mx; card.style.transform = `translateX(${dx}px)`;
    card.classList.toggle('sw-del', dx < -SW); card.classList.toggle('sw-hide', dx > SW);
  });
  const end = (e, cancel) => {
    if (id !== e.pointerId) return; id = null;
    if (!on) return;
    on = false; swiped = true; setTimeout(() => { swiped = false; }, 350);
    const d = dx; reset();
    if (cancel) return;
    if (d < -SW) openMenu('note', n, 'confirm'); else if (d > SW) toggleHide(n);
  };
  card.addEventListener('pointerup', (e) => end(e, false));
  card.addEventListener('pointercancel', (e) => end(e, true));
  card.addEventListener('click', (e) => { if (swiped) { e.stopImmediatePropagation(); e.preventDefault(); swiped = false; } }, true);
}

/* ---------- fotos e desenho ---------- */
const MAX_IMGS = 4;
const viewer = $('viewer'), draw = $('draw'), cv = $('cv'), ctx = cv.getContext('2d');

function drawThumbs() {
  const box = $('thumbs'); box.replaceChildren(); box.hidden = imgs.length === 0;
  imgs.forEach((src, i) => {
    const t = el('div', 'thumb'), im = el('img');
    im.src = src; im.alt = `Anexo ${i + 1}`; im.onclick = () => openViewer(src);
    const x = el('button', 'thumb-x'); x.type = 'button'; x.setAttribute('aria-label', 'Remover imagem'); x.append(icon('fa-solid fa-xmark'));
    x.onclick = () => { imgs.splice(i, 1); drawThumbs(); };
    t.append(im, x); box.append(t);
  });
}
function addImage(src) {
  if (imgs.length >= MAX_IMGS) { alert(`Máximo de ${MAX_IMGS} imagens por nota`); return false; }
  imgs.push(src); drawThumbs(); return true;
}
const openViewer = (src) => { $('viewer-img').src = src; viewer.hidden = false; };
const closeViewer = () => { viewer.hidden = true; };
viewer.onclick = closeViewer;

function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1024 / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem')); };
    im.src = url;
  });
}
$('photo').onclick = () => $('file').click();
$('file').onchange = (e) => {
  const files = [...e.target.files]; e.target.value = '';
  run(async () => { for (const f of files) if (!addImage(await shrink(f))) break; });
};

let strokes = [], cur = null, dpr = 1;
const pen = { color: '#141A3C', size: 4, erase: false };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function paint() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.c; ctx.lineWidth = s.w;
    ctx.beginPath(); ctx.moveTo(s.p[0][0], s.p[0][1]);
    if (s.p.length === 1) ctx.lineTo(s.p[0][0] + 0.01, s.p[0][1]);
    for (let i = 1; i < s.p.length; i++) ctx.lineTo(s.p[i][0], s.p[i][1]);
    ctx.stroke();
  }
}
function drawTools() {
  const box = $('draw-tools'); box.replaceChildren();
  const swatch = (hex, label) => {
    const b = el('button', 'swatch'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label);
    b.setAttribute('aria-checked', String(!pen.erase && pen.color === hex));
    b.style.setProperty('--c', hex); b.append(icon('fa-solid fa-check'));
    b.onclick = () => { pen.color = hex; pen.erase = false; drawTools(); };
    box.append(b);
  };
  swatch(css('--ink'), 'preto');
  COLORS.forEach((c) => swatch(css('--' + c), c));
  box.append(el('span', 'sep'));
  [3, 6, 12].forEach((sz) => {
    const b = el('button', 'tool'); b.type = 'button'; b.setAttribute('aria-label', `Espessura ${sz}`);
    b.setAttribute('aria-pressed', String(pen.size === sz));
    const d = el('span', 'bead'); d.style.width = d.style.height = Math.max(4, sz) + 'px'; b.append(d);
    b.onclick = () => { pen.size = sz; drawTools(); };
    box.append(b);
  });
  box.append(el('span', 'sep'));
  const tool = (ic, label, pressed, fn) => {
    const b = el('button', 'tool'); b.type = 'button'; b.setAttribute('aria-label', label); b.append(icon(ic));
    if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
    b.onclick = fn; box.append(b);
  };
  tool('fa-solid fa-eraser', 'Borracha', pen.erase, () => { pen.erase = !pen.erase; drawTools(); });
  tool('fa-solid fa-rotate-left', 'Desfazer', null, () => { strokes.pop(); paint(); });
  tool('fa-solid fa-trash-can', 'Limpar', null, () => { strokes = []; paint(); });
}
function openDraw() {
  if (imgs.length >= MAX_IMGS) return alert(`Máximo de ${MAX_IMGS} imagens por nota`);
  draw.hidden = false;
  const st = $('stage'); dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(st.clientWidth * dpr); cv.height = Math.round(st.clientHeight * dpr);
  strokes = []; cur = null; pen.erase = false; paint(); drawTools();
}
const closeDraw = () => { draw.hidden = true; };
const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  const [x, y] = pt(e);
  cur = { c: pen.erase ? '#fff' : pen.color, w: pen.erase ? pen.size * 3 : pen.size, p: [[x, y]] };
  strokes.push(cur);
  ctx.strokeStyle = cur.c; ctx.lineWidth = cur.w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke();
});
cv.addEventListener('pointermove', (e) => {
  if (!cur) return;
  const [x, y] = pt(e), l = cur.p[cur.p.length - 1];
  cur.p.push([x, y]);
  ctx.strokeStyle = cur.c; ctx.lineWidth = cur.w; ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(x, y); ctx.stroke();
});
['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, () => { cur = null; }));
$('sketch').onclick = openDraw;
$('draw-close').onclick = closeDraw;
$('draw-save').onclick = () => {
  if (!strokes.length) return closeDraw();
  if (addImage(cv.toDataURL('image/jpeg', 0.8))) closeDraw();
};
$('viewer-close').onclick = closeViewer;

/* ---------- áudio ---------- */
const MAX_AUDIOS = 3, MAX_SECS = 120;
let recorder = null, recStream = null, recChunks = [], recTick = null, recStart = 0, recDiscard = false, recDone = Promise.resolve();
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pickMime = () => window.MediaRecorder && ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Falha ao processar o áudio')); r.readAsDataURL(blob);
});

function drawAudios() {
  const box = $('audios'); box.replaceChildren(); box.hidden = auds.length === 0;
  auds.forEach((src, i) => {
    const row = el('div', 'aud'), a = el('audio');
    a.controls = true; a.preload = 'metadata'; a.src = src; a.setAttribute('aria-label', `Áudio ${i + 1}`);
    const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Remover áudio'); x.append(icon('fa-solid fa-xmark'));
    x.onclick = () => { auds.splice(i, 1); drawAudios(); };
    row.append(a, x); box.append(row);
  });
}

async function startRec() {
  if (recorder) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder)
    throw new Error('Este navegador não suporta gravação de áudio (é necessário HTTPS).');
  if (auds.length >= MAX_AUDIOS) throw new Error(`Máximo de ${MAX_AUDIOS} áudios por nota`);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) {
    throw new Error(e.name === 'NotAllowedError' || e.name === 'SecurityError'
      ? 'Permita o acesso ao microfone nas configurações do navegador para gravar.'
      : 'Não foi possível acessar o microfone.');
  }
  if (sheet.hidden) { stream.getTracks().forEach((t) => t.stop()); return; }
  const mime = pickMime(), rc = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
  recorder = rc; recStream = stream; recChunks = []; recDiscard = false;
  rc.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  recDone = new Promise((resolve) => {
    rc.onstop = async () => {
      clearInterval(recTick);
      stream.getTracks().forEach((t) => t.stop());
      const chunks = recChunks, discard = recDiscard, type = (rc.mimeType || mime || 'audio/webm').split(';')[0];
      recorder = recStream = null; recChunks = [];
      $('rec').hidden = true; $('mic').disabled = false;
      try { if (!discard && chunks.length) { auds.push(await blobToDataURL(new Blob(chunks, { type }))); drawAudios(); } }
      catch (e) { alert(e.message); }
      resolve();
    };
  });
  rc.start(1000);
  recStart = Date.now(); $('rec-time').textContent = '0:00';
  recTick = setInterval(() => {
    const s = (Date.now() - recStart) / 1000;
    $('rec-time').textContent = fmtTime(s);
    if (s >= MAX_SECS) stopRec();
  }, 250);
  $('rec').hidden = false; $('mic').disabled = true;
  if (navigator.vibrate) navigator.vibrate(10);
}
function stopRec() { if (recorder && recorder.state !== 'inactive') recorder.stop(); return recDone; }
function cancelRec() { recDiscard = true; return stopRec(); }

$('mic').onclick = () => run(startRec);
$('rec-stop').onclick = stopRec;
$('rec-cancel').onclick = cancelRec;

/* ---------- editor de caderno ---------- */
const nbSheet = $('nb-sheet');
function openNbSheet(b) {
  editingNb = b || null;
  nbColor = b ? b.color : COLORS[0];
  $('nb-title').textContent = b ? 'Editar caderno' : 'Novo caderno';
  $('nb-name').value = b ? b.name : '';
  $('nb-del').hidden = !b;
  drawSwatches($('nb-colors'), nbColor, (c) => { nbColor = c; });
  nbSheet.hidden = false; $('nb-name').focus();
}
const closeNbSheet = () => { nbSheet.hidden = true; };
$('nb-form').onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await store.saveNotebook({ name: $('nb-name').value, color: nbColor }, editingNb && editingNb.id);
    closeNbSheet(); await refresh();
  });
};
$('nb-close').onclick = closeNbSheet;
nbSheet.onclick = (e) => { if (e.target === nbSheet) closeNbSheet(); };
$('nb-del').onclick = () => { if (editingNb) openMenu('notebook', editingNb, 'confirm'); };

/* ---------- pop-up de ações ---------- */
const menu = $('menu');
let target = null, mode = 'menu', openedAt = 0;
function setMode(m) {
  mode = m;
  const c = m === 'confirm', { kind, item } = target;
  $('pop-title').textContent = c ? (kind === 'note' ? 'Excluir esta nota?' : 'Excluir este caderno?') : (item.title || item.name);
  $('pop-text').textContent = kind === 'notebook' && item.count > 0
    ? `${plural(item.count, 'nota', 'notas')} deste caderno também ${item.count === 1 ? 'será excluída' : 'serão excluídas'}.`
    : 'Esta ação não pode ser desfeita.';
  $('pop-text').hidden = !c;
  $('pop-edit').hidden = c;
  $('pop-del-label').textContent = c ? 'Sim, excluir' : 'Excluir';
}
function openMenu(kind, item, m = 'menu') {
  target = { kind, item }; setMode(m); openedAt = Date.now();
  menu.hidden = false; (m === 'menu' ? $('pop-edit') : $('pop-cancel')).focus();
}
const closeMenu = () => { menu.hidden = true; target = null; };
$('pop-edit').onclick = () => { const t = target; closeMenu(); t.kind === 'note' ? openSheet(t.item, true) : openNbSheet(t.item); };
$('pop-del').onclick = () => {
  if (mode === 'menu') return setMode('confirm');
  const t = target;
  run(async () => {
    await (t.kind === 'note' ? store.deleteNote(t.item.id) : store.deleteNotebook(t.item.id));
    closeMenu(); closeSheet(); closeNbSheet(); await refresh();
  });
};
$('pop-cancel').onclick = closeMenu;
menu.onclick = (e) => { if (e.target === menu && Date.now() - openedAt > 350) closeMenu(); };
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return;
  if (!draw.hidden) closeDraw(); else if (!viewer.hidden) closeViewer(); else { closeMenu(); closeSheet(); closeNbSheet(); } });

/* ---------- demais controles ---------- */
$('add').onclick = () => (S.view === 'notes' ? openSheet() : openNbSheet());
let timer;
$('q').oninput = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
$('layout').onclick = () => {
  const single = $('list').classList.toggle('single');
  $('layout').firstChild.className = single ? 'fa-solid fa-grip' : 'fa-solid fa-table-list';
};
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('manifest').href = t === 'dark' ? '/manifest-escuro.webmanifest' : '/manifest-claro.webmanifest';
  const sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let bar = document.getElementById('bar');
  if (t === sys) { if (bar) bar.remove(); }
  else {
    if (!bar) { bar = document.createElement('meta'); bar.id = 'bar'; bar.name = 'theme-color'; document.head.prepend(bar); }
    bar.content = t === 'dark' ? '#141414' : '#FFFFFF';
  }
  $('theme').firstChild.className = t === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  try { localStorage.setItem('theme', t); } catch (e) {}
}
$('theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
applyTheme(document.documentElement.dataset.theme || 'light');

/* ---------- teclado próprio ---------- */
const kbWrap = $('kb-wrap'), kbEl = $('kb'), kbIn = $('kb-in'), FIELDS = '#title,#content';
const KB = { layer: 'abc', shift: 1, field: null, last: 0, custom: true };
try { KB.custom = localStorage.getItem('kb') !== 'native'; } catch (e) {}
const VARS = { a: 'áàâã', e: 'éêè', i: 'íîì', o: 'óôõò', u: 'úüù' };
const LAYERS = {
  abc: ['qwertyuiop', 'asdfghjklç', ['shift', ...'zxcvbnm', 'back']],
  sym1: ['1234567890', ['-', '/', ':', ';', '(', ')', 'R$', '&', '@', '"'], ['sym2', '.', ',', '?', '!', "'", 'back']],
  sym2: [['[', ']', '{', '}', '#', '%', '^', '*', '+', '='], ['_', '\\', '|', '~', '<', '>', '€', '£', '•', '…'], ['sym1', '.', ',', '?', '!', "'", 'back']],
};
const ENTER_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5v6a3 3 0 0 1-3 3H5m0 0 4-4m-4 4 4 4"/></svg>';

function mkKey(c) {
  const b = el('button', 'k'); b.type = 'button'; b.tabIndex = -1; b.dataset.k = c;
  const fn = (label, ic, aria) => { b.classList.add('fn'); if (ic) b.append(icon(ic)); else b.textContent = label; if (aria) b.setAttribute('aria-label', aria); };
  if (c === 'shift') { fn('', 'fa-solid fa-arrow-up', 'Maiúsculas'); b.classList.add('shift'); }
  else if (c === 'back') fn('', 'fa-solid fa-delete-left', 'Apagar');
  else if (c === 'hide') { fn('', 'fa-solid fa-chevron-down', 'Fechar teclado'); b.classList.add('n'); }
  else if (c === 'abc' || c === 'sym1' || c === 'sym2') fn(c === 'abc' ? 'ABC' : c === 'sym2' ? '#+=' : KB.layer === 'abc' ? '?123' : '123');
  else if (c === 'enter') { fn('', null, 'Enter'); b.classList.add('enter'); b.innerHTML = ENTER_SVG; }
  else {
    b.dataset.ch = c === 'space' ? ' ' : c;
    if (c === 'space') { b.classList.add('sp'); b.setAttribute('aria-label', 'Espaço'); } else b.textContent = c;
    if (/^[a-zç]$/.test(c)) b.classList.add('l');
  }
  return b;
}
function renderKb() {
  kbIn.replaceChildren();
  const rows = [...LAYERS[KB.layer], [KB.layer === 'abc' ? 'sym1' : 'abc', ',', 'space', '.', 'hide', 'enter']];
  for (const r of rows) {
    const row = el('div', 'kb-row');
    for (const c of typeof r === 'string' ? [...r] : r) row.append(mkKey(c));
    kbIn.append(row);
  }
  kbEl.dataset.shift = KB.shift;
}

/* edição do campo */
function put(t) {
  const f = KB.field; if (!f) return;
  if (document.activeElement !== f) f.focus({ preventScroll: true });
  const s = f.selectionStart, e = f.selectionEnd;
  if (f.maxLength > 0 && f.value.length - (e - s) + t.length > f.maxLength) return;
  let ok = false; try { ok = document.execCommand('insertText', false, t); } catch (x) {}
  if (!ok) { f.setRangeText(t, s, e, 'end'); f.dispatchEvent(new Event('input', { bubbles: true })); }
}
function back() {
  const f = KB.field; if (!f) return;
  let ok = false; try { ok = document.execCommand('delete'); } catch (x) {}
  if (!ok) {
    let s = f.selectionStart; const e = f.selectionEnd;
    if (s === e) { if (!s) return; s -= /[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(f.value.slice(0, s)) ? 2 : 1; }
    f.setRangeText('', s, e, 'end'); f.dispatchEvent(new Event('input', { bubbles: true }));
  }
  autoShift();
}
function autoShift() {
  const f = KB.field; if (!f || KB.shift === 2) return;
  KB.shift = /(^|[.!?]\s+|\n)$/.test(f.value.slice(0, f.selectionStart)) ? 1 : 0;
  kbEl.dataset.shift = KB.shift;
}
function typeChar(ch) { put(KB.layer === 'abc' && KB.shift ? ch.toUpperCase() : ch); autoShift(); }

function act(c) {
  if (c === 'shift') {
    const n = Date.now();
    KB.shift = n - KB.last < 350 && KB.shift !== 2 ? 2 : KB.shift === 2 ? 0 : KB.shift ? 0 : 1;
    KB.last = n; kbEl.dataset.shift = KB.shift;
  } else if (c === 'abc' || c === 'sym1' || c === 'sym2') { KB.layer = c; renderKb(); }
  else if (c === 'hide') { if (document.activeElement) document.activeElement.blur(); hideKb(); }
  else if (c === 'enter') { if (KB.field === $('title')) $('content').focus(); else { put('\n'); autoShift(); } }
}

/* toques (apagar repete; vogais abrem acentos no toque longo) */
const presses = new Map();
kbEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const k = e.target.closest('.k'); if (!k) return;
  k.setPointerCapture(e.pointerId); k.classList.add('down');
  const st = { k, x: e.clientX }, c = k.dataset.k, ch = k.dataset.ch;
  presses.set(e.pointerId, st);
  if (c === 'back') { back(); st.t = setTimeout(() => { st.r = setInterval(back, 55); }, 380); }
  else if (ch != null && VARS[ch]) { st.ch = ch; st.t = setTimeout(() => openVars(st, ch), 320); }
  else if (ch != null) typeChar(ch);
  else act(c);
});
function openVars(st, ch) {
  st.t = null;
  const up = KB.shift ? (s) => s.toUpperCase() : (s) => s;
  st.opts = [ch, ...VARS[ch]].map(up); st.i = 0;
  const r = st.k.getBoundingClientRect(), b = kbEl.getBoundingClientRect(), cx = r.left + r.width / 2;
  st.flip = cx > b.left + b.width / 2;
  const w = st.opts.length * 38 + 8, p = el('div', 'vpop' + (st.flip ? ' flip' : ''));
  st.opts.forEach((o, i) => p.append(el('div', 'vo' + (i ? '' : ' on'), o)));
  const left = st.flip ? cx + 23 - w : cx - 23;
  p.style.left = Math.max(b.left + 4, Math.min(left, b.right - w - 4)) + 'px';
  p.style.top = (r.top - 58) + 'px';
  sheet.append(p); st.pop = p;
  if (navigator.vibrate) navigator.vibrate(8);
}
kbEl.addEventListener('pointermove', (e) => {
  const st = presses.get(e.pointerId); if (!st || !st.pop) return;
  const d = (st.flip ? -1 : 1) * (e.clientX - st.x);
  st.i = Math.max(0, Math.min(st.opts.length - 1, Math.round(d / 38)));
  [...st.pop.children].forEach((o, i) => o.classList.toggle('on', i === st.i));
});
const endPress = (e) => {
  const st = presses.get(e.pointerId); if (!st) return;
  presses.delete(e.pointerId); clearTimeout(st.t); clearInterval(st.r); st.k.classList.remove('down');
  if (st.pop) { st.pop.remove(); if (e.type === 'pointerup') { put(st.opts[st.i]); autoShift(); } }
  else if (st.ch != null && e.type === 'pointerup') typeChar(st.ch);
};
['pointerup', 'pointercancel'].forEach((ev) => kbEl.addEventListener(ev, endPress));
['mousedown', 'contextmenu'].forEach((ev) => kbEl.addEventListener(ev, (e) => e.preventDefault()));

/* abrir / fechar junto com o editor */
function showKb() {
  if (!KB.custom) return;
  if (!kbIn.firstChild) renderKb();
  void kbWrap.offsetHeight;
  sheet.classList.add('kb-open'); kbWrap.setAttribute('aria-hidden', 'false'); autoShift();
}
function hideKb() {
  sheet.classList.remove('kb-open'); kbWrap.setAttribute('aria-hidden', 'true');
  presses.forEach((st) => { clearTimeout(st.t); clearInterval(st.r); if (st.pop) st.pop.remove(); });
  presses.clear();
}
const kbForm = $('form');
kbForm.addEventListener('focusin', (e) => { if (e.target.matches(FIELDS)) { KB.field = e.target; showKb(); } });
kbForm.addEventListener('focusout', () => setTimeout(() => {
  if (!document.activeElement || !document.activeElement.matches(FIELDS)) hideKb();
}, 0));
['input', 'keyup', 'pointerup'].forEach((ev) => kbForm.addEventListener(ev, (e) => { if (e.target === KB.field) setTimeout(autoShift, 0); }));

/* alternar entre teclado Quicknote e teclado do sistema */
function applyKbMode() {
  document.querySelectorAll(FIELDS).forEach((f) => f.setAttribute('inputmode', KB.custom ? 'none' : 'text'));
  $('kb-mode').setAttribute('aria-pressed', String(KB.custom));
}
$('kb-mode').addEventListener('pointerdown', (e) => e.preventDefault());
$('kb-mode').onclick = () => {
  KB.custom = !KB.custom;
  try { localStorage.setItem('kb', KB.custom ? 'custom' : 'native'); } catch (e) {}
  applyKbMode();
  const f = KB.field || $('title');
  hideKb(); f.blur(); f.focus();
};
applyKbMode();

/* atalhos do PWA (manifest > shortcuts) */
refresh().then(() => {
  const q = new URLSearchParams(location.search), v = q.get('view'), a = q.get('action');
  if (v === 'notebooks') setView('notebooks');
  if (a === 'new-note') openSheet();
  if (v || a) history.replaceState(null, '', '/');
});
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
