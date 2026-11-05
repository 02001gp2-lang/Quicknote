const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const COLORS = ['pink', 'blue', 'purple', 'yellow', 'green', 'cyan'];
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16mb' }));
app.get('/healthz', (req, res) => res.type('text').send('ok')); // health check do Render
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, file) {
    if (file.endsWith('.webmanifest')) res.type('application/manifest+json');
    // shell sempre revalidado; ícones podem ficar em cache por 1 dia
    if (/(sw\.js|app\.js|index\.html|\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

const pickColor = (c) => (COLORS.includes(c) ? c : 'blue');
const cleanImages = (a) => (Array.isArray(a) ? a : [])
  .filter((x) => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 1500000)
  .slice(0, 4);
const cleanAudios = (a) => (Array.isArray(a) ? a : [])
  .filter((x) => typeof x === 'string' && /^data:audio\/(webm|mp4|ogg|mpeg|aac|x-m4a);base64,/.test(x) && x.length < 2000000)
  .slice(0, 3);
const cleanNote = (b) => ({
  images: cleanImages(b.images),
  audios: cleanAudios(b.audios),
  title: String(b.title || '').trim().slice(0, 120),
  content: String(b.content || '').slice(0, 5000),
  color: pickColor(b.color),
  notebook_id: Number(b.notebook_id),
});
const cleanNotebook = (b) => ({ name: String(b.name || '').trim().slice(0, 60), color: pickColor(b.color) });

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e.code === '23503' || e.code === '22P02') return res.status(400).json({ error: 'Dados inválidos' });
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  });

// Cadernos
app.get('/api/notebooks', wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*, COUNT(n.id)::int AS count
    FROM notebooks b LEFT JOIN notes n ON n.notebook_id = b.id
    GROUP BY b.id ORDER BY b.created_at, b.id`);
  res.json(rows);
}));

app.post('/api/notebooks', wrap(async (req, res) => {
  const b = cleanNotebook(req.body);
  if (!b.name) return res.status(400).json({ error: 'Nome obrigatório' });
  const { rows } = await pool.query('INSERT INTO notebooks (name, color) VALUES ($1,$2) RETURNING *', [b.name, b.color]);
  res.status(201).json(rows[0]);
}));

app.put('/api/notebooks/:id', wrap(async (req, res) => {
  const b = cleanNotebook(req.body);
  if (!b.name) return res.status(400).json({ error: 'Nome obrigatório' });
  const { rows } = await pool.query('UPDATE notebooks SET name=$1, color=$2 WHERE id=$3 RETURNING *', [b.name, b.color, req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Não encontrado' });
}));

app.delete('/api/notebooks/:id', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM notebooks');
  if (rows[0].n <= 1) return res.status(400).json({ error: 'Mantenha ao menos um caderno' });
  await pool.query('DELETE FROM notebooks WHERE id=$1', [req.params.id]); // notas saem por ON DELETE CASCADE
  res.status(204).end();
}));

// Notas
app.get('/api/notes', wrap(async (req, res) => {
  const params = [`%${String(req.query.q || '').trim()}%`];
  let sql = 'SELECT * FROM notes WHERE (title ILIKE $1 OR content ILIKE $1)';
  if (req.query.notebook_id) { params.push(Number(req.query.notebook_id)); sql += ' AND notebook_id = $2'; }
  const { rows } = await pool.query(sql + ' ORDER BY updated_at DESC', params);
  res.json(rows);
}));

app.post('/api/notes', wrap(async (req, res) => {
  const n = cleanNote(req.body);
  if (!n.title) return res.status(400).json({ error: 'Título obrigatório' });
  const { rows } = await pool.query(
    'INSERT INTO notes (title, content, color, notebook_id, images, audios) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING *',
    [n.title, n.content, n.color, n.notebook_id, JSON.stringify(n.images), JSON.stringify(n.audios)]);
  res.status(201).json(rows[0]);
}));

app.put('/api/notes/:id', wrap(async (req, res) => {
  const n = cleanNote(req.body);
  if (!n.title) return res.status(400).json({ error: 'Título obrigatório' });
  const { rows } = await pool.query(
    'UPDATE notes SET title=$1, content=$2, color=$3, notebook_id=$4, images=$5::jsonb, audios=$6::jsonb, updated_at=NOW() WHERE id=$7 RETURNING *',
    [n.title, n.content, n.color, n.notebook_id, JSON.stringify(n.images), JSON.stringify(n.audios), req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Não encontrada' });
}));

app.delete('/api/notes/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM notes WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS notebooks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'pink',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // migração: notas antigas vão para o caderno padrão
  await pool.query('ALTER TABLE notes ADD COLUMN IF NOT EXISTS notebook_id INTEGER REFERENCES notebooks(id) ON DELETE CASCADE');
  await pool.query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS audios JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("INSERT INTO notebooks (name, color) SELECT 'Geral', 'blue' WHERE NOT EXISTS (SELECT 1 FROM notebooks)");
  await pool.query('UPDATE notes SET notebook_id = (SELECT MIN(id) FROM notebooks) WHERE notebook_id IS NULL');
  app.listen(process.env.PORT || 3000, () => console.log('Quicknote no ar'));
})().catch((e) => { console.error('Falha ao iniciar:', e); process.exit(1); });
