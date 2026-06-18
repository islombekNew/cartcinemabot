require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const db = require('./src/db');
const state = require('./src/state');
const { t } = require('./src/i18n');
const { subscriptionMiddleware, registerSubscription } = require('./src/subscription');
const movies = require('./src/movies');
const premium = require('./src/premium');
const profile = require('./src/profile');
const admin = require('./src/admin');

if (!process.env.BOT_TOKEN || !process.env.ADMIN_ID) {
    console.error('\u274c .env faylida BOT_TOKEN va ADMIN_ID bo\u2018lishi shart!');
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const BOT_NAME = process.env.BOT_NAME || 'KINO BOT';

async function getLang(ctx) {
    const u = await db.getUser(ctx.from.id);
    return (u && u.lang) || 'uz';
}

/* ===== Asosiy menyu ===== */
function mainMenuKeyboard(lang) {
    const k = (key) => t(lang, key);
    return Markup.keyboard([
        [k('menu_search'), k('menu_random')],
        [k('menu_top'), k('menu_new')],
        [k('menu_genres'), k('menu_premium')],
        [k('menu_profile'), k('menu_lang')],
        [k('menu_help')],
    ]).resize();
}

async function sendMainMenu(ctx, lang) {
    await ctx.reply(t(lang, 'main_menu'), mainMenuKeyboard(lang));
}

/* ===== Xush kelibsiz (welcome mockup forward yoki default) ===== */
async function sendWelcome(ctx, lang) {
    const s = await db.getSettings();
    if (s.welcomeMsg && s.welcomeMsg.chatId && s.welcomeMsg.messageId) {
        try {
            await ctx.telegram.copyMessage(ctx.chat.id, s.welcomeMsg.chatId, s.welcomeMsg.messageId);
            return sendMainMenu(ctx, lang);
        } catch (err) {
            console.error('welcome copy:', err.message);
        }
    }
    await ctx.reply(
        t(lang, 'welcome', { name: ctx.from.first_name || '', botname: BOT_NAME }), { parse_mode: 'HTML', ...mainMenuKeyboard(lang) }
    );
}

/* ===== Middleware: user ro'yxati ===== */
bot.use(async(ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
        await db.upsertUser(ctx.from).catch((e) => console.error('upsertUser:', e.message));
    }
    return next();
});

/* ===== Middleware: majburiy obuna ===== */
bot.use(subscriptionMiddleware(getLang));

/* ===== Obuna OK bo'lgach ===== */
registerSubscription(bot, getLang, async(ctx) => {
    const u = await db.getUser(ctx.from.id);
    if (!u || !u.lang) return ctx.reply(t('uz', 'choose_lang'), profile.langKeyboard());
    await sendWelcome(ctx, u.lang);
});

/* ===== Modullar ===== */
admin.registerAdmin(bot, sendMainMenu);
admin.registerGenreCallback(bot);
movies.registerMovies(bot, getLang);
premium.registerPremium(bot, getLang);
profile.registerProfile(bot, getLang, sendMainMenu);

/* ===== /check (diagnostika) ===== */
bot.command('check', async(ctx) => {
    const userId = ctx.from.id;
    const adminId = Number(process.env.ADMIN_ID);
    const s = await db.getSettings();
    const channels = s.channels || [];

    let report = '\ud83d\udd0d <b>DIAGNOSTIKA</b>\n\n';
    report += '\ud83c\udd94 Sizning ID: <code>' + userId + '</code>\n';
    report += '\ud83d\udc51 Admin ID: <code>' + adminId + '</code>\n';
    report += (userId === adminId ?
        '\u2705 Siz ADMINSIZ \u2014 majburiy obuna sizga TEKSHIRILMAYDI!\n' :
        '\ud83d\udc64 Siz oddiy foydalanuvchisiz\n');
    report += '\n\ud83d\udce2 <b>Majburiy kanallar:</b> ' + channels.length + ' ta\n';

    if (!channels.length) {
        report += '\u26a0\ufe0f Hech qanday kanal qo\u2018shilmagan!\n';
    }

    // Har bir kanal uchun: bot admin'mi va siz a'zomisiz
    for (const c of channels) {
        report += '\n\ud83d\udd38 <b>' + (c.title || c.chat) + '</b> (<code>' + c.chat + '</code>)\n';
        // Bot kanalda admin'mi?
        try {
            const botMember = await ctx.telegram.getChatMember(c.chat, ctx.botInfo.id);
            const botOk = ['administrator', 'creator'].includes(botMember.status);
            report += '   Bot holati: ' + botMember.status + (botOk ? ' \u2705' : ' \u274c admin emas!') + '\n';
        } catch (err) {
            report += '   \u274c Bot kanalni ko\u2018rolmayapti: ' + err.message + '\n';
            report += '   (Bot kanalda admin emas yoki @username xato)\n';
            continue;
        }
        // Siz a'zomisiz?
        try {
            const userMember = await ctx.telegram.getChatMember(c.chat, userId);
            const userOk = ['member', 'administrator', 'creator'].includes(userMember.status);
            report += '   Siz: ' + userMember.status + (userOk ? ' \u2705 a\u2018zo' : ' \u274c a\u2018zo emas') + '\n';
        } catch (err) {
            report += '   Sizni tekshirib bo\u2018lmadi: ' + err.message + '\n';
        }
    }

    report += '\n\ud83d\udcc1 Baza kanal: <code>' + (s.baseChannelId || 'o\u2018rnatilmagan') + '</code>';

    await ctx.reply(report, { parse_mode: 'HTML' });
});

/* ===== /start ===== */
bot.start(async(ctx) => {
    state.clear(ctx.from.id);
    const { user } = await db.upsertUser(ctx.from);
    if (!user.lang) return ctx.reply(t('uz', 'choose_lang'), profile.langKeyboard());
    await sendWelcome(ctx, user.lang);
});

/* ===== Markaziy matn router ===== */
bot.on('text', async(ctx) => {
    const s = state.get(ctx.from.id);
    const lang = await getLang(ctx);

    if (s) {
        if (s.action.startsWith('addmovie') || ['set', 'set_basech', 'addchannel', 'set_welcome', 'broadcast'].includes(s.action)) {
            if (admin.isAdmin(ctx)) return admin.handleText(ctx, s);
        }
        if (s.action === 'pay_photo') return; // skrinshot kutilyapti, matn emas
        if (s.action === 'search') return movies.handleSearch(ctx, lang);
    }

    // Holatsiz matn = qidiruv (qulay UX)
    const text = ctx.message.text;
    if (text && !text.startsWith('/')) return movies.handleSearch(ctx, lang);
});

/* ===== Media routerlar ===== */
const mediaHandler = async(ctx) => {
    const s = state.get(ctx.from.id);
    if (!s) return;
    const lang = await getLang(ctx);
    if (s.action === 'pay_photo' && ctx.message.photo) return premium.handlePhoto(ctx, lang);
    if (admin.isAdmin(ctx)) return admin.handleMedia(ctx, s);
};
bot.on('photo', mediaHandler);
bot.on('video', mediaHandler);
bot.on('document', mediaHandler);
bot.on('animation', mediaHandler);

/* ===== Xatolik ===== */
bot.catch((err, ctx) => {
    console.error('\u274c Bot xatosi:', err.message, '| update:', ctx.updateType);
});

/* ===== Ishga tushirish ===== */
bot.launch({ dropPendingUpdates: true }, () =>
    console.log('\u2705 ' + BOT_NAME + ' ishga tushdi!')
);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));