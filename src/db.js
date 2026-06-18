const fs = require('fs/promises');
const path = require('path');

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

// Yozish navbati (race condition oldini olish)
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
    await fs.rename(tmp, fp); // atomik
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

/* ===== SETTINGS ===== */
const getSettings = () => readFile('settings.json');
const updateSettings = (patch) => updateFile('settings.json', (s) => Object.assign(s, patch));

/* ===== USERS ===== */
const getUsers = () => readFile('users.json');
async function getUser(id) {
    const users = await getUsers();
    return users.find((u) => u.id === Number(id)) || null;
}

function upsertUser(from) {
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

function setUserLang(id, lang) {
    return updateFile('users.json', (users) => {
        const u = users.find((x) => x.id === Number(id));
        if (u) u.lang = lang;
        return u;
    });
}

function setPremium(id, enabled, days = 30) {
    return updateFile('users.json', (users) => {
        const u = users.find((x) => x.id === Number(id));
        if (!u) return null;
        u.premium = enabled;
        u.premiumUntil = enabled ? new Date(Date.now() + days * 86400000).toISOString() : null;
        return u;
    });
}

function incViews(id) {
    return updateFile('users.json', (users) => {
        const u = users.find((x) => x.id === Number(id));
        if (u) u.views = (u.views || 0) + 1;
    });
}

function isPremiumActive(u) {
    if (!u || !u.premium) return false;
    if (!u.premiumUntil) return true;
    return new Date(u.premiumUntil) > new Date();
}

/* ===== MOVIES ===== */
const getMovies = () => readFile('movies.json');
async function getMovie(id) {
    const movies = await getMovies();
    return movies.find((m) => m.id === id) || null;
}
async function getMovieByCode(code) {
    const movies = await getMovies();
    return movies.find((m) => String(m.code) === String(code)) || null;
}
async function searchMovies(query) {
    const movies = await getMovies();
    const q = query.toLowerCase().trim();
    // Kod bo'yicha aniq moslik
    const byCode = movies.filter((m) => String(m.code) === q);
    if (byCode.length) return byCode;
    // Nom bo'yicha
    return movies.filter((m) => m.title.toLowerCase().includes(q));
}
async function getTopMovies(n = 10) {
    const movies = await getMovies();
    return [...movies].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, n);
}
async function getNewMovies(n = 10) {
    const movies = await getMovies();
    return [...movies].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0, n);
}
async function getMoviesByGenre(genre) {
    const movies = await getMovies();
    return movies.filter((m) => m.genre === genre);
}
async function getRandomMovie() {
    const movies = await getMovies();
    if (!movies.length) return null;
    return movies[Math.floor(Math.random() * movies.length)];
}

function addMovie(movie) {
    return updateFile('movies.json', (movies) => {
        movie.id = genId();
        movie.views = 0;
        movie.addedAt = new Date().toISOString();
        movies.push(movie);
        return movie;
    });
}

function deleteMovie(id) {
    return updateFile('movies.json', (movies) => {
        const i = movies.findIndex((m) => m.id === id);
        if (i === -1) return false;
        movies.splice(i, 1);
        return true;
    });
}

function incMovieViews(id) {
    return updateFile('movies.json', (movies) => {
        const m = movies.find((x) => x.id === id);
        if (m) m.views = (m.views || 0) + 1;
    });
}

/* ===== PAYMENTS ===== */
const getPayments = () => readFile('payments.json');

function addPayment(p) {
    return updateFile('payments.json', (arr) => {
        p.id = 'p' + Date.now().toString(36);
        p.status = 'pending';
        p.createdAt = new Date().toISOString();
        arr.push(p);
        return p;
    });
}

function setPaymentStatus(id, status) {
    return updateFile('payments.json', (arr) => {
        const p = arr.find((x) => x.id === id);
        if (p) p.status = status;
        return p || null;
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