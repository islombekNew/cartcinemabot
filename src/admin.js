const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');

const isAdmin = (ctx) => ctx.from && ctx.from.id === Number(process.env.ADMIN_ID);
const fmt = (n) => Number(n).toLocaleString('uz-UZ');

/* ===== Panel ===== */
async function panelText() {
    const [users, movies, pays] = await Promise.all([db.getUsers(), db.getMovies(), db.getPayments()]);
    const today = new Date().toISOString().slice(0, 10);
    const todayUsers = users.filter((u) => (u.joinedAt || '').startsWith(today)).length;
    const premiumCount = users.filter((u) => db.isPremiumActive(u)).length;
    const pendingPays = pays.filter((p) => p.status === 'pending').length;
    return (
        '\u{1F451} <b>ADMIN PANEL</b>\n\n' +
        '\u{1F465} Foydalanuvchilar: ' + users.length + ' (+' + todayUsers + ' bugun)\n' +
        '\u{1F48E} Premium: ' + premiumCount + '\n' +
        '\u{1F3AC} Kinolar: ' + movies.length + '\n' +
        '\u{1F4B3} Kutilayotgan to\u2018lovlar: ' + pendingPays + '\n\n' +
        'Amalni tanlang:'
    );
}

function panelKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('\u{1F3AC} Kino qo\u2018shish', 'a:addmovie'),
            Markup.button.callback('\u{1F5D1} Kino o\u2018chirish', 'a:delmovie'),
        ],
        [
            Markup.button.callback('\u{1F4CA} Statistika', 'a:stats'),
            Markup.button.callback('\u{1F4B0} To\u2018lovlar', 'a:pays'),
        ],
        [
            Markup.button.callback('\u{1F4E2} Majburiy kanallar', 'a:channels'),
            Markup.button.callback('\u{1F5C2} Baza kanal', 'a:basech'),
        ],
        [
            Markup.button.callback('\u2699 Sozlamalar', 'a:settings'),
            Markup.button.callback('\u{1F4E3} Broadcast', 'a:broadcast'),
        ],
    ]);
}

function backBtn() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('\u2B05 Orqaga', 'a:back')]
    ]);
}

function registerAdmin(bot, sendMainMenu) {
    bot.command('admin', async(ctx) => {
        if (!isAdmin(ctx)) return;
        state.clear(ctx.from.id);
        await ctx.reply(await panelText(), { parse_mode: 'HTML', ...panelKeyboard() });
    });

    bot.action('a:back', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.clear(ctx.from.id);
        const txt = await panelText();
        await ctx.editMessageText(txt, { parse_mode: 'HTML', ...panelKeyboard() })
            .catch(async() => ctx.reply(txt, { parse_mode: 'HTML', ...panelKeyboard() }));
    });

    /* ===== KINO QO'SHISH (baza kanaldan forward orqali) ===== */
    bot.action('a:addmovie', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        if (!s.baseChannelId) {
            return ctx.reply(
                '\u26A0 Avval BAZA KANALNI sozlang!\n\n' +
                'Admin panel \u2192 \u{1F5C2} Baza kanal',
                backBtn()
            );
        }
        state.set(ctx.from.id, { action: 'addmovie', step: 'title', data: { qualities: {} } });
        await ctx.reply('\u{1F3AC} Kino nomini kiriting:');
    });

    /* ===== KINO O'CHIRISH ===== */
    bot.action('a:delmovie', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const movies = await db.getMovies();
        if (!movies.length) return ctx.reply('\u{1F4ED} Kinolar yo\u2018q.', backBtn());
        const rows = movies.slice(0, 30).map((m) => [
            Markup.button.callback('\u274C ' + m.title + ' (' + m.year + ')', 'a:del:' + m.id),
        ]);
        rows.push([Markup.button.callback('\u2B05 Orqaga', 'a:back')]);
        await ctx.reply('\u{1F5D1} O\u2018chirish uchun kinoni tanlang:', Markup.inlineKeyboard(rows));
    });

    bot.action(/^a:del:(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const ok = await db.deleteMovie(ctx.match[1]);
        await ctx.answerCbQuery(ok ? '\u2705 O\u2018chirildi' : '\u274C Topilmadi');
        if (ok) await ctx.deleteMessage().catch(() => {});
    });

    /* ===== STATISTIKA ===== */
    bot.action('a:stats', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const [users, movies, pays] = await Promise.all([db.getUsers(), db.getMovies(), db.getPayments()]);
        const premiumCount = users.filter((u) => db.isPremiumActive(u)).length;
        const totalViews = movies.reduce((s, m) => s + (m.views || 0), 0);
        const totalIncome = pays.filter((p) => p.status === 'approved').length;
        const topMovie = [...movies].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
        await ctx.reply(
            '\u{1F4CA} <b>STATISTIKA</b>\n\n' +
            '\u{1F465} Foydalanuvchilar: ' + users.length + '\n' +
            '\u{1F48E} Premium: ' + premiumCount + '\n' +
            '\u{1F193} Oddiy: ' + (users.length - premiumCount) + '\n\n' +
            '\u{1F3AC} Kinolar: ' + movies.length + '\n' +
            '\u{1F441} Jami ko\u2018rishlar: ' + totalViews + '\n' +
            (topMovie ? '\u{1F525} Top kino: ' + topMovie.title + ' (' + (topMovie.views || 0) + ' ko\u2018rish)\n' : '') +
            '\n\u{1F4B0} Tasdiqlangan to\u2018lovlar: ' + totalIncome, { parse_mode: 'HTML', ...backBtn() }
        );
    });

    /* ===== TO'LOVLAR ===== */
    bot.action('a:pays', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const pays = await db.getPayments();
        if (!pays.length) return ctx.reply('\u{1F4ED} To\u2018lovlar yo\u2018q.', backBtn());
        const icons = { pending: '\u23F3', approved: '\u2705', rejected: '\u274C' };
        const lines = pays.slice(-20).reverse().map((p) =>
            icons[p.status] + ' <code>' + p.userId + '</code> \u2014 ' + p.amount
        );
        await ctx.reply('\u{1F4B0} <b>To\u2018lovlar</b> (oxirgi 20):\n\n' + lines.join('\n'), {
            parse_mode: 'HTML',
            ...backBtn(),
        });
    });

    /* ===== MAJBURIY KANALLAR ===== */
    bot.action('a:channels', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        await showChannels(ctx);
    });

    bot.action(/^a:delch:(\d+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const i = Number(ctx.match[1]);
        const s = await db.getSettings();
        const channels = s.channels || [];
        const removed = channels.splice(i, 1);
        await db.updateSettings({ channels });
        await ctx.answerCbQuery('\u2705 O\u2018chirildi: ' + (removed[0] ? removed[0].chat : ''));
        await ctx.deleteMessage().catch(() => {});
        await showChannels(ctx);
    });

    bot.action('a:addch', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'addchannel' });
        await ctx.reply(
            '\u2795 Majburiy kanal/guruh qo\u2018shish.\n\n' +
            'Formatlar:\n' +
            '1) <code>@username | Nomi</code> \u2014 ochiq kanal\n' +
            '2) <code>-1001234567890 | Nomi</code> \u2014 yopiq (chat ID)\n\n' +
            'Faqat @username yozsangiz ham bo\u2018ladi.\n\n' +
            '\u26A0 Botni shu kanalga ADMIN qilib qo\u2018shing!', { parse_mode: 'HTML' }
        );
    });

    /* ===== BAZA KANAL ===== */
    bot.action('a:basech', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        state.set(ctx.from.id, { action: 'set_basech' });
        await ctx.reply(
            '\u{1F5C2} <b>BAZA KANAL</b>\n\n' +
            'Hozirgi: <code>' + (s.baseChannelId || 'o\u2018rnatilmagan') + '</code>\n\n' +
            'Kinolar shu kanaldan forward qilinadi. Kanal ID yuboring (masalan: <code>-1001234567890</code>).\n\n' +
            '\u{1F4A1} ID ni bilish: kanalga istalgan post yuboring, uni @username_to_id_bot ga forward qiling. ' +
            'Yoki kanaldan postni shu botga forward qiling \u2014 men ID ni avtomatik olaman.\n\n' +
            '\u26A0 Botni baza kanalga ADMIN qilib qo\u2018shing!', { parse_mode: 'HTML' }
        );
    });

    /* ===== SOZLAMALAR ===== */
    bot.action('a:settings', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const s = await db.getSettings();
        await ctx.reply(
            '\u2699 <b>SOZLAMALAR</b>\n\n' +
            '\u{1F4B3} Karta: ' + s.cardNumber + '\n' +
            '\u{1F4B0} Premium narxi: ' + s.premiumPrice + '\n' +
            '\u23F3 Premium kunlari: ' + s.premiumDays + '\n' +
            '\u{1F4AC} Admin kontakt: ' + s.adminContact, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('\u{1F4B3} Karta', 'a:set:cardNumber')],
                    [
                        Markup.button.callback('\u{1F4B0} Narx', 'a:set:premiumPrice'),
                        Markup.button.callback('\u23F3 Kunlar', 'a:set:premiumDays'),
                    ],
                    [Markup.button.callback('\u{1F4AC} Admin kontakt', 'a:set:adminContact')],
                    [Markup.button.callback('\u{1F44B} Xush kelibsiz xabari', 'a:set:welcome')],
                    [Markup.button.callback('\u2B05 Orqaga', 'a:back')],
                ]),
            }
        );
    });

    const SET_LABELS = {
        cardNumber: '\u{1F4B3} Karta raqami',
        premiumPrice: '\u{1F4B0} Premium narxi',
        premiumDays: '\u23F3 Premium kunlari (raqam)',
        adminContact: '\u{1F4AC} Admin kontakt (@username)',
    };
    bot.action(/^a:set:(cardNumber|premiumPrice|premiumDays|adminContact)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        state.set(ctx.from.id, { action: 'set', key });
        await ctx.reply('\u270F Yangi qiymatni kiriting (' + SET_LABELS[key] + '):');
    });

    // Xush kelibsiz xabari (forward mockup - premium emoji harakatli saqlanadi)
    bot.action('a:set:welcome', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'set_welcome' });
        await ctx.reply(
            '\u{1F44B} <b>Xush kelibsiz xabari</b>\n\n' +
            'Xabaringizni yuboring (matn/rasm/video). User /start bosganda shu ko\u2018rsatiladi.\n\n' +
            '\u{1F48E} Premium emoji ishlatmoqchi bo\u2018lsangiz: xabarni avval kanalingizga joylab, ' +
            'kanaldan shu yerga FORWARD qiling \u2014 emojilar harakatli saqlanadi.\n\n' +
            'Default holatga qaytarish: <code>default</code> deb yozing.', { parse_mode: 'HTML' }
        );
    });

    /* ===== BROADCAST ===== */
    bot.action('a:broadcast', async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        state.set(ctx.from.id, { action: 'broadcast' });
        await ctx.reply(
            '\u{1F4E3} Hammaga yuboriladigan xabarni yuboring (matn/rasm/video).\n\n' +
            '\u{1F48E} Premium emojili xabarni kanaldan forward qilsangiz, emojilar saqlanadi.'
        );
    });
}

async function showChannels(ctx) {
    const s = await db.getSettings();
    const channels = s.channels || [];
    const list = channels.length ?
        channels.map((c) => '\u2022 ' + (c.title || '') + ' (' + c.chat + ')').join('\n') :
        'Bo\u2018sh \u2014 hozircha hech kim tekshirilmaydi.';
    const rows = channels.map((c, i) => [
        Markup.button.callback('\u274C ' + (c.title || c.chat), 'a:delch:' + i),
    ]);
    rows.push([Markup.button.callback('\u2795 Kanal qo\u2018shish', 'a:addch')]);
    rows.push([Markup.button.callback('\u2B05 Orqaga', 'a:back')]);
    await ctx.reply(
        '\u{1F4E2} <b>Majburiy kanallar</b>\n\n' + list +
        '\n\n\u26A0 Bot har bir kanalda ADMIN bo\u2018lishi shart!', { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
    );
}

/* ===== Matnli flow'lar ===== */
async function handleText(ctx, s) {
    const text = ctx.message.text ? ctx.message.text.trim() : '';

    if (s.action === 'addmovie') return addMovieStep(ctx, s);

    if (s.action === 'set') {
        const value = s.key === 'premiumDays' ? (Number(text) || 30) : text;
        await db.updateSettings({
            [s.key]: value });
        state.clear(ctx.from.id);
        return ctx.reply('\u2705 Saqlandi: ' + value);
    }

    if (s.action === 'set_basech') {
        await db.updateSettings({ baseChannelId: text });
        state.clear(ctx.from.id);
        return ctx.reply('\u2705 Baza kanal o\u2018rnatildi: ' + text + '\n\n\u26A0 Bot shu kanalda admin ekanini tekshiring!');
    }

    if (s.action === 'addchannel') {
        const [rawChat, rawTitle] = text.split('|').map((x) => x.trim());
        let chat = (rawChat || '').trim();
        // Havoladan username'ni ajratib olamiz: https://t.me/MONTRAX_kanal -> @MONTRAX_kanal
        chat = chat.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^telegram\.me\//i, '');
        chat = chat.replace(/^@+/, ''); // boshidagi ortiqcha @ larni olib tashlash
        chat = chat.split(/[/?]/)[0].trim(); // havola oxiridagi / yoki ? dan keyingini kesib tashlash
        // Raqamli ID (-100...) bo'lmasa @ qo'shamiz
        if (!/^-?\d+$/.test(chat)) chat = '@' + chat;
        const type = chat.startsWith('-') ? 'group' : 'channel';
        const settings = await db.getSettings();
        const channels = settings.channels || [];
        channels.push({ chat, title: rawTitle || chat, type });
        await db.updateSettings({ channels });
        state.clear(ctx.from.id);
        return ctx.reply('\u2705 Qo\u2018shildi: ' + chat + '\n\n\u26A0 Botni shu kanalga ADMIN qiling!');
    }

    if (s.action === 'set_welcome') {
        if (text.toLowerCase() === 'default') {
            await db.updateSettings({ welcomeMsg: null });
            state.clear(ctx.from.id);
            return ctx.reply('\u2705 Default holatga qaytarildi.');
        }
        return captureWelcome(ctx);
    }

    if (s.action === 'broadcast') return doBroadcast(ctx);
}

/* Kino qo'shish bosqichlari */
async function addMovieStep(ctx, s) {
    const d = s.data;
    const text = ctx.message.text ? ctx.message.text.trim() : '';

    // Forward bosqichlarida: admin baza kanaldan postni forward qiladi -> messageId olamiz
    if (['q480', 'q720', 'q1080', 'q4K'].includes(s.step)) {
        const quality = s.step.slice(1);
        if (text === '-') {
            return advanceQuality(ctx, s);
        }
        // Forward qilingan post bormi?
        const fwd = ctx.message.forward_from_chat;
        const fwdMsgId = ctx.message.forward_from_message_id;
        if (fwd && fwdMsgId) {
            d.qualities[quality] = {
                channelId: String(fwd.id),
                messageId: fwdMsgId,
                premium: quality === '1080' || quality === '4K',
            };
            return advanceQuality(ctx, s, '\u2705 ' + quality + 'p qo\u2018shildi (' + fwd.title + ')');
        }
        // Raqam yuborilsa = baza kanaldagi message ID
        if (/^\d+$/.test(text)) {
            const settings = await db.getSettings();
            d.qualities[quality] = {
                channelId: settings.baseChannelId,
                messageId: Number(text),
                premium: quality === '1080' || quality === '4K',
            };
            return advanceQuality(ctx, s, '\u2705 ' + quality + 'p qo\u2018shildi (msg #' + text + ')');
        }
        return ctx.reply('\u26A0 Baza kanaldan kinoni FORWARD qiling, yoki message ID raqamini yozing, yoki "-" yozing.');
    }

    switch (s.step) {
        case 'title':
            d.title = text;
            s.step = 'year';
            return ctx.reply('\u{1F4C5} Yilini kiriting (masalan: 2024):');
        case 'year':
            d.year = Number(text) || new Date().getFullYear();
            s.step = 'genre';
            const settings = await db.getSettings();
            return ctx.reply(
                '\u{1F3AD} Janrni tanlang:',
                Markup.inlineKeyboard(
                    settings.genres.map((g) => [Markup.button.callback(g, 'amg:' + g)])
                )
            );
        case 'description':
            d.description = text;
            s.step = 'rating';
            return ctx.reply('\u2B50 Reytingni kiriting (masalan: 8.5) yoki "-":');
        case 'rating':
            d.rating = text === '-' ? '\u2014' : text;
            s.step = 'code';
            return ctx.reply('\u{1F516} Kino kodini kiriting (raqam, qidiruvda ishlatiladi, masalan: 101) yoki "-":');
        case 'code':
            d.code = text === '-' ? '' : text;
            s.step = 'q480';
            return ctx.reply(
                '\u{1F3AC} Endi kino fayllarini qo\u2018shamiz.\n\n' +
                '<b>480p</b> uchun: baza kanaldan kinoni FORWARD qiling ' +
                '(yoki message ID raqamini yozing). Bu sifat yo\u2018q bo\u2018lsa "-" yozing:', { parse_mode: 'HTML' }
            );
    }
}

async function advanceQuality(ctx, s, msg) {
    if (msg) await ctx.reply(msg);
    const flow = { q480: 'q720', q720: 'q1080', q1080: 'q4K', q4K: 'done' };
    s.step = flow[s.step];
    if (s.step === 'q720') return ctx.reply('\u{1F3AC} <b>720p</b>: forward qiling / ID / "-":', { parse_mode: 'HTML' });
    if (s.step === 'q1080') return ctx.reply('\u{1F48E} <b>1080p (Premium)</b>: forward qiling / ID / "-":', { parse_mode: 'HTML' });
    if (s.step === 'q4K') return ctx.reply('\u{1F48E} <b>4K (Premium)</b>: forward qiling / ID / "-":', { parse_mode: 'HTML' });
    // done
    const d = s.data;
    if (!Object.keys(d.qualities).length) {
        state.clear(ctx.from.id);
        return ctx.reply('\u274C Hech qanday sifat qo\u2018shilmadi. Kino saqlanmadi.');
    }
    const movie = await db.addMovie(d);
    state.clear(ctx.from.id);
    return ctx.reply(
        '\u2705 <b>Kino qo\u2018shildi!</b>\n\n' +
        '\u{1F3AC} ' + movie.title + ' (' + movie.year + ')\n' +
        '\u{1F3AD} ' + movie.genre + '\n' +
        (movie.code ? '\u{1F516} Kod: ' + movie.code + '\n' : '') +
        '\u{1F517} Sifatlar: ' + Object.keys(movie.qualities).map((q) => q + 'p').join(', '), { parse_mode: 'HTML' }
    );
}

async function captureWelcome(ctx) {
    const ref = { chatId: ctx.chat.id, messageId: ctx.message.message_id };
    await db.updateSettings({ welcomeMsg: ref });
    state.clear(ctx.from.id);
    await ctx.reply('\u2705 Saqlandi! Quyida userlar ko\u2018radigan ko\u2018rinish:');
    await ctx.telegram.copyMessage(ctx.chat.id, ref.chatId, ref.messageId).catch(() => {});
}

async function doBroadcast(ctx) {
    state.clear(ctx.from.id);
    const users = await db.getUsers();
    const useForward = Boolean(ctx.message.forward_origin || ctx.message.forward_from_chat);
    await ctx.reply('\u23F3 Yuborilmoqda... (' + users.length + ' user)');
    let ok = 0,
        fail = 0;
    for (const u of users) {
        try {
            if (useForward) await ctx.telegram.forwardMessage(u.id, ctx.chat.id, ctx.message.message_id);
            else await ctx.telegram.copyMessage(u.id, ctx.chat.id, ctx.message.message_id);
            ok++;
        } catch { fail++; }
        await new Promise((r) => setTimeout(r, 50));
    }
    await ctx.reply('\u{1F4E3} Tugadi!\n\u2705 Yuborildi: ' + ok + '\n\u274C Xato: ' + fail);
}

/* Janr tanlash (kino qo'shishda) */
function registerGenreCallback(bot) {
    bot.action(/^amg:(.+)$/, async(ctx) => {
        if (!isAdmin(ctx)) return ctx.answerCbQuery();
        const s = state.get(ctx.from.id);
        if (!s || s.action !== 'addmovie' || s.step !== 'genre') return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        s.data.genre = ctx.match[1];
        s.step = 'description';
        await ctx.editMessageText('\u2705 Janr: ' + ctx.match[1]).catch(() => {});
        await ctx.reply('\u{1F4DD} Kino tavsifini kiriting:');
    });
}

/* Media (forward/rasm/video) - kino qo'shish yoki broadcast yoki welcome */
async function handleMedia(ctx, s) {
    if (s.action === 'addmovie') return addMovieStep(ctx, s);
    if (s.action === 'set_welcome') return captureWelcome(ctx);
    if (s.action === 'broadcast') return doBroadcast(ctx);
    if (s.action === 'set_basech') {
        // Admin baza kanaldan post forward qildi -> ID avtomatik
        const fwd = ctx.message.forward_from_chat;
        if (fwd && fwd.id) {
            await db.updateSettings({ baseChannelId: String(fwd.id) });
            state.clear(ctx.from.id);
            return ctx.reply('\u2705 Baza kanal avtomatik aniqlandi: <code>' + fwd.id + '</code> (' + (fwd.title || '') + ')', { parse_mode: 'HTML' });
        }
    }
}

module.exports = { registerAdmin, registerGenreCallback, handleText, handleMedia, isAdmin };