const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');

// Kino kartasi tugmalari (sifatlar)
function qualityKeyboard(movie, lang) {
    const order = ['480', '720', '1080', '4K'];
    const buttons = [];
    for (const q of order) {
        const item = movie.qualities && movie.qualities[q];
        if (item && item.messageId) {
            const label = item.premium ?
                t(lang, 'quality_premium', { q: q + 'p' }) :
                t(lang, 'quality_free', { q: q + 'p' });
            buttons.push(Markup.button.callback(label, 'mq:' + movie.id + ':' + q));
        }
    }
    // 2 tadan qator
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    return Markup.inlineKeyboard(rows);
}

// Kino ro'yxatini tugma qilib chiqarish
function movieListKeyboard(movies) {
    return Markup.inlineKeyboard(
        movies.slice(0, 15).map((m) => [
            Markup.button.callback('\ud83c\udfac ' + m.title + ' (' + m.year + ')', 'mv:' + m.id),
        ])
    );
}

async function showMovieCard(ctx, movie, lang) {
    const text = t(lang, 'movie_card', {
        title: movie.title,
        year: movie.year,
        genre: movie.genre || '\u2014',
        rating: movie.rating || '\u2014',
        views: movie.views || 0,
        description: movie.description || '\u2014',
    });
    await ctx.reply(text, { parse_mode: 'HTML', ...qualityKeyboard(movie, lang) });
}

function registerMovies(bot, getLang) {
    /* ===== Qidirish tugmasi ===== */
    bot.hears(allLangs('menu_search'), async(ctx) => {
        const lang = await getLang(ctx);
        state.set(ctx.from.id, { action: 'search' });
        await ctx.reply(t(lang, 'search_prompt'));
    });

    /* ===== Top kinolar ===== */
    bot.hears(allLangs('menu_top'), async(ctx) => {
        const lang = await getLang(ctx);
        const movies = await db.getTopMovies(10);
        if (!movies.length) return ctx.reply(t(lang, 'no_movies'));
        await ctx.reply(t(lang, 'top_title'), { parse_mode: 'HTML', ...movieListKeyboard(movies) });
    });

    /* ===== Yangi kinolar ===== */
    bot.hears(allLangs('menu_new'), async(ctx) => {
        const lang = await getLang(ctx);
        const movies = await db.getNewMovies(10);
        if (!movies.length) return ctx.reply(t(lang, 'no_movies'));
        await ctx.reply(t(lang, 'new_title'), { parse_mode: 'HTML', ...movieListKeyboard(movies) });
    });

    /* ===== Tasodifiy kino ===== */
    bot.hears(allLangs('menu_random'), async(ctx) => {
        const lang = await getLang(ctx);
        const movie = await db.getRandomMovie();
        if (!movie) return ctx.reply(t(lang, 'random_none'));
        await showMovieCard(ctx, movie, lang);
    });

    /* ===== Janrlar ===== */
    bot.hears(allLangs('menu_genres'), async(ctx) => {
        const lang = await getLang(ctx);
        const s = await db.getSettings();
        const genres = s.genres || [];
        const rows = [];
        for (let i = 0; i < genres.length; i += 2) {
            rows.push(genres.slice(i, i + 2).map((g) => Markup.button.callback('\ud83c\udfad ' + g, 'genre:' + g)));
        }
        await ctx.reply(t(lang, 'genres_title'), { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
    });

    bot.action(/^genre:(.+)$/, async(ctx) => {
        await ctx.answerCbQuery();
        const lang = await getLang(ctx);
        const genre = ctx.match[1];
        const movies = await db.getMoviesByGenre(genre);
        if (!movies.length) return ctx.reply(t(lang, 'genre_empty'));
        await ctx.reply(t(lang, 'genre_movies', { genre }), { parse_mode: 'HTML', ...movieListKeyboard(movies) });
    });

    /* ===== Kino kartasini ochish ===== */
    bot.action(/^mv:(.+)$/, async(ctx) => {
        await ctx.answerCbQuery();
        const lang = await getLang(ctx);
        const movie = await db.getMovie(ctx.match[1]);
        if (!movie) return ctx.reply(t(lang, 'send_fail'));
        await showMovieCard(ctx, movie, lang);
    });

    /* ===== Sifat tanlash + kino yuborish (FORWARD baza kanaldan) ===== */
    bot.action(/^mq:(.+):(480|720|1080|4K)$/, async(ctx) => {
        const lang = await getLang(ctx);
        const [, id, quality] = ctx.match;
        const movie = await db.getMovie(id);
        if (!movie) return ctx.answerCbQuery(t(lang, 'send_fail'), { show_alert: true });

        const item = movie.qualities[quality];
        if (!item || !item.messageId) {
            return ctx.answerCbQuery(t(lang, 'send_fail'), { show_alert: true });
        }

        // Premium tekshiruvi
        if (item.premium) {
            const user = await db.getUser(ctx.from.id);
            const isAdmin = ctx.from.id === Number(process.env.ADMIN_ID);
            if (!isAdmin && !db.isPremiumActive(user)) {
                await ctx.answerCbQuery();
                const s = await db.getSettings();
                return ctx.reply(t(lang, 'premium_need'), {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback(t(lang, 'btn_buy_premium'), 'buy_premium')]
                    ]),
                });
            }
        }

        await ctx.answerCbQuery(t(lang, 'sending'));
        const s = await db.getSettings();
        const fromChat = item.channelId || s.baseChannelId;
        try {
            // Baza kanaldan userga forward (katta kinolar ham ishlaydi, sifat saqlanadi)
            await ctx.telegram.copyMessage(ctx.chat.id, fromChat, item.messageId);
            await db.incMovieViews(id);
            await db.incViews(ctx.from.id);
        } catch (err) {
            console.error('Kino yuborish xato:', err.message);
            await ctx.reply(t(lang, 'send_fail'));
        }
    });
}

// Matnli qidiruv
async function handleSearch(ctx, lang) {
    const q = ctx.message.text.trim();
    if (q.length === 0) return ctx.reply(t(lang, 'search_empty'));
    const results = await db.searchMovies(q);
    if (!results.length) return ctx.reply(t(lang, 'search_none', { q }), { parse_mode: 'HTML' });
    if (results.length === 1) {
        return showMovieCard(ctx, results[0], lang);
    }
    await ctx.reply(t(lang, 'search_found', { q, n: results.length }), {
        parse_mode: 'HTML',
        ...movieListKeyboard(results),
    });
}

module.exports = { registerMovies, handleSearch, showMovieCard };