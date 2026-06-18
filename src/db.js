const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, '..', 'data');

const DEFAULTS = {
    'users.json': [],
    'payments.json': [],
    'movies.json': [],
    'settings.json': {
        cardNumber: '6262 5700 3598 5797',
        adminContact: '@Montrax_offical',
        baseChannelId: '',
        premiumPrice: "20 000 so'm",
        premiumDays: 30,
        channels: [],
        welcomeMsg: null,
        genres: ['Jangari', 'Komediya', 'Drama', 'Fantastika', "Qo'rqinchli", 'Multfilm', 'Melodrama', 'Detektiv'],
    },
};

const usePostgres = Boolean(process.env.DATABASE_URL);
let pool = null;

if (usePostgres) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
}

async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result;
}

async function initDb() {
    if (!usePostgres) return;

    await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      lang TEXT,
      premium BOOLEAN DEFAULT FALSE,
      premium_until TIMESTAMPTZ,
      views INTEGER DEFAULT 0,
      joined_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

    await query(`
    CREATE TABLE IF NOT EXISTS movies (
      id TEXT PRIMARY KEY,
      code TEXT,
      title TEXT,
      year INTEGER,
      genre TEXT,
      description TEXT,
      rating TEXT,
      views INTEGER DEFAULT 0,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      qualities JSONB
    );
  `);

    await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      amount TEXT,
      photo TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

    await query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB
    );
  `);
}

function parseUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username || '',
        firstName: row.first_name || '',
        lang: row.lang || null,
        premium: row.premium,
        premiumUntil: row.premium_until ? row.premium_until.toISOString() : null,
        views: row.views || 0,
        joinedAt: row.joined_at ? row.joined_at.toISOString() : null,
    };
}

function parseMovie(row) {
    if (!row) return null;
    return {
        id: row.id,
        code: row.code || '',
        title: row.title || '',
        year: row.year || null,
        genre: row.genre || '',
        description: row.description || '',
        rating: row.rating || '',
        views: row.views || 0,
        addedAt: row.added_at ? row.added_at.toISOString() : null,
        qualities: row.qualities || {},
    };
}

function parsePayment(row) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        username: row.username || '',
        amount: row.amount || '',
        photo: row.photo || '',
        status: row.status || '',
        createdAt: row.created_at ? row.created_at.toISOString() : null,
    };
}

const queues = new Map();

function enqueue(file, task) {
    const prev = queues.get(file) || Promise.resolve();
    const next = prev.then(task, task);
    queues.set(file, next.catch(() => {}));
    return next;
}

async function readFile(file) {
    try {
        return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') {
            const def = JSON.parse(JSON.stringify(DEFAULTS[file]));
            await writeFile(file, def);
            return def;
        }
        throw err;
    }
}

async function writeFile(file, data) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const fp = path.join(DATA_DIR, file);
    const tmp = fp + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, fp);
}

function updateFile(file, mutator) {
    return enqueue(file, async() => {
        const data = await readFile(file);
        const result = await mutator(data);
        await writeFile(file, data);
        return result;
    });
}

const genId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function getSettings() {
    if (!usePostgres) return readFile('settings.json');

    const res = await query('SELECT value FROM settings WHERE key = $1', ['settings']);
    if (res.rowCount) return res.rows[0].value;
    const def = JSON.parse(JSON.stringify(DEFAULTS['settings.json']));
    await query('INSERT INTO settings(key, value) VALUES($1, $2)', ['settings', def]);
    return def;
}

async function updateSettings(patch) {
    if (!usePostgres) return updateFile('settings.json', (s) => Object.assign(s, patch));

    const current = await getSettings();
    const next = Object.assign(current, patch);
    await query(
        'INSERT INTO settings(key, value) VALUES($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', ['settings', next]
    );
    return next;
}

async function getUsers() {
    if (!usePostgres) return readFile('users.json');
    const res = await query('SELECT * FROM users ORDER BY joined_at ASC');
    return res.rows.map(parseUser);
}

async function getUser(id) {
    if (!usePostgres) {
        const users = await getUsers();
        return users.find((u) => u.id === Number(id)) || null;
    }
    const res = await query('SELECT * FROM users WHERE id = $1', [String(id)]);
    return parseUser(res.rows[0]);
}

async function upsertUser(from) {
    if (!usePostgres) {
        return updateFile('users.json', (users) => {
            let u = users.find((x) => x.id === from.id);
            if (!u) {
                u = {
                    id: from.id,
                    username: from.username || '',
                    firstName: from.first_name || '',
                    lang: null,
                    premium: false,
                    premiumUntil: null,
                    views: 0,
                    joinedAt: new Date().toISOString(),
                };
                users.push(u);
                return { user: u, isNew: true };
            }
            u.username = from.username || u.username;
            u.firstName = from.first_name || u.firstName;
            return { user: u, isNew: false };
        });
    }

    const res = await query(
        `INSERT INTO users(id, username, first_name, lang, premium, premium_until, views, joined_at)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
     RETURNING *`, [
            String(from.id),
            from.username || '',
            from.first_name || '',
            null,
            false,
            null,
            0,
            new Date().toISOString(),
        ]
    );

    return { user: parseUser(res.rows[0]), isNew: res.command === 'INSERT' };
}

async function setUserLang(id, lang) {
    if (!usePostgres) {
        return updateFile('users.json', (users) => {
            const u = users.find((x) => x.id === Number(id));
            if (u) u.lang = lang;
            return u;
        });
    }
    const res = await query('UPDATE users SET lang = $1 WHERE id = $2 RETURNING *', [lang, String(id)]);
    return parseUser(res.rows[0]);
}

async function setPremium(id, enabled, days = 30) {
    if (!usePostgres) {
        return updateFile('users.json', (users) => {
            const u = users.find((x) => x.id === Number(id));
            if (!u) return null;
            u.premium = enabled;
            u.premiumUntil = enabled ? new Date(Date.now() + days * 86400000).toISOString() : null;
            return u;
        });
    }
    const premiumUntil = enabled ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const res = await query('UPDATE users SET premium = $1, premium_until = $2 WHERE id = $3 RETURNING *', [enabled, premiumUntil, String(id)]);
    return parseUser(res.rows[0]);
}

async function incViews(id) {
    if (!usePostgres) {
        return updateFile('users.json', (users) => {
            const u = users.find((x) => x.id === Number(id));
            if (u) u.views = (u.views || 0) + 1;
        });
    }
    const res = await query('UPDATE users SET views = views + 1 WHERE id = $1 RETURNING *', [String(id)]);
    return parseUser(res.rows[0]);
}

function isPremiumActive(u) {
    if (!u || !u.premium) return false;
    if (!u.premiumUntil) return true;
    return new Date(u.premiumUntil) > new Date();
}

async function getMovies() {
    if (!usePostgres) return readFile('movies.json');
    const res = await query('SELECT * FROM movies ORDER BY added_at DESC');
    return res.rows.map(parseMovie);
}

async function getMovie(id) {
    if (!usePostgres) {
        const movies = await getMovies();
        return movies.find((m) => m.id === id) || null;
    }
    const res = await query('SELECT * FROM movies WHERE id = $1', [id]);
    return parseMovie(res.rows[0]);
}

async function getMovieByCode(code) {
    if (!usePostgres) {
        const movies = await getMovies();
        return movies.find((m) => String(m.code) === String(code)) || null;
    }
    const res = await query('SELECT * FROM movies WHERE code = $1 LIMIT 1', [String(code)]);
    return parseMovie(res.rows[0]);
}

async function searchMovies(queryText) {
    if (!usePostgres) {
        const movies = await getMovies();
        const q = queryText.toLowerCase().trim();
        const byCode = movies.filter((m) => String(m.code) === q);
        if (byCode.length) return byCode;
        return movies.filter((m) => m.title.toLowerCase().includes(q));
    }
    const raw = String(queryText).trim().toLowerCase();
    const codeRows = await query('SELECT * FROM movies WHERE code = $1', [raw]);
    if (codeRows.rowCount) return codeRows.rows.map(parseMovie);
    const res = await query('SELECT * FROM movies WHERE LOWER(title) LIKE $1 ORDER BY added_at DESC', ['%' + raw + '%']);
    return res.rows.map(parseMovie);
}

async function getTopMovies(n = 10) {
    if (!usePostgres) {
        const movies = await getMovies();
        return [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, n);
    }
    const res = await query('SELECT * FROM movies ORDER BY views DESC LIMIT $1', [n]);
    return res.rows.map(parseMovie);
}

async function getNewMovies(n = 10) {
    if (!usePostgres) {
        const movies = await getMovies();
        return [...movies].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0, n);
    }
    const res = await query('SELECT * FROM movies ORDER BY added_at DESC LIMIT $1', [n]);
    return res.rows.map(parseMovie);
}

async function getMoviesByGenre(genre) {
    if (!usePostgres) {
        const movies = await getMovies();
        return movies.filter((m) => m.genre === genre);
    }
    const res = await query('SELECT * FROM movies WHERE genre = $1 ORDER BY added_at DESC', [genre]);
    return res.rows.map(parseMovie);
}

async function getRandomMovie() {
    if (!usePostgres) {
        const movies = await getMovies();
        if (!movies.length) return null;
        return movies[Math.floor(Math.random() * movies.length)];
    }
    const res = await query('SELECT * FROM movies ORDER BY RANDOM() LIMIT 1');
    return parseMovie(res.rows[0]);
}

async function addMovie(movie) {
    if (!usePostgres) {
        return updateFile('movies.json', (movies) => {
            movie.id = genId();
            movie.views = 0;
            movie.addedAt = new Date().toISOString();
            movies.push(movie);
            return movie;
        });
    }
    const id = movie.id || genId();
    const res = await query(
        `INSERT INTO movies(id, code, title, year, genre, description, rating, views, added_at, qualities)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [
            id,
            movie.code || '',
            movie.title || '',
            movie.year || null,
            movie.genre || '',
            movie.description || '',
            movie.rating || '',
            0,
            new Date().toISOString(),
            movie.qualities || {},
        ]
    );
    return parseMovie(res.rows[0]);
}

async function deleteMovie(id) {
    if (!usePostgres) {
        return updateFile('movies.json', (movies) => {
            const i = movies.findIndex((m) => m.id === id);
            if (i === -1) return false;
            movies.splice(i, 1);
            return true;
        });
    }
    const res = await query('DELETE FROM movies WHERE id = $1', [id]);
    return res.rowCount > 0;
}

async function incMovieViews(id) {
    if (!usePostgres) {
        return updateFile('movies.json', (movies) => {
            const m = movies.find((x) => x.id === id);
            if (m) m.views = (m.views || 0) + 1;
        });
        return null;
    }
    const res = await query('UPDATE movies SET views = views + 1 WHERE id = $1 RETURNING *', [id]);
    return parseMovie(res.rows[0]);
}

async function getPayments() {
    if (!usePostgres) return readFile('payments.json');
    const res = await query('SELECT * FROM payments ORDER BY created_at DESC');
    return res.rows.map(parsePayment);
}

async function addPayment(p) {
    if (!usePostgres) {
        return updateFile('payments.json', (arr) => {
            p.id = 'p' + Date.now().toString(36);
            p.status = 'pending';
            p.createdAt = new Date().toISOString();
            arr.push(p);
            return p;
        });
    }
    const id = 'p' + Date.now().toString(36);
    const res = await query(
        `INSERT INTO payments(id, user_id, username, amount, photo, status, created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [
            id,
            String(p.userId),
            p.username || '',
            p.amount || '',
            p.photo || '',
            'pending',
            new Date().toISOString(),
        ]
    );
    return parsePayment(res.rows[0]);
}

async function setPaymentStatus(id, status) {
    if (!usePostgres) {
        return updateFile('payments.json', (arr) => {
            const p = arr.find((x) => x.id === id);
            if (p) p.status = status;
            return p || null;
        });
    }
    const res = await query('UPDATE payments SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    return parsePayment(res.rows[0]);
}

if (usePostgres) {
    initDb().catch((err) => {
        console.error('Postgres init failed:', err.message);
        process.exit(1);
    });
}

module.exports = {
    getSettings,
    updateSettings,
    getUsers,
    getUser,
    upsertUser,
    setUserLang,
    setPremium,
    incViews,
    isPremiumActive,
    getMovies,
    getMovie,
    getMovieByCode,
    searchMovies,
    getTopMovies,
    getNewMovies,
    getMoviesByGenre,
    getRandomMovie,
    addMovie,
    deleteMovie,
    incMovieViews,
    getPayments,
    addPayment,
    setPaymentStatus,
    genId,
};