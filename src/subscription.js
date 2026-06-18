const { Markup } = require('telegraf');
const db = require('./db');
const { t } = require('./i18n');

const OK = ['creator', 'administrator', 'member'];

async function isMember(telegram, chat, userId) {
  if (!chat) return true;
  try {
    const m = await telegram.getChatMember(chat, userId);
    return OK.includes(m.status);
  } catch (err) {
    // Bot kanalda admin emas yoki chat noto'g'ri \u2014 bloklamaymiz
    console.error('getChatMember:', chat, err.message);
    return true;
  }
}

async function checkAll(telegram, userId) {
  const s = await db.getSettings();
  const channels = s.channels || [];
  if (!channels.length) return { ok: true, notJoined: [] };
  const res = await Promise.all(channels.map((c) => isMember(telegram, c.chat, userId)));
  return { ok: res.every(Boolean), notJoined: channels.filter((_, i) => !res[i]) };
}

function joinKeyboard(notJoined, lang) {
  const rows = [];
  for (const c of notJoined) {
    if (String(c.chat).startsWith('@')) {
      rows.push([Markup.button.url('\ud83d\udce2 ' + (c.title || c.chat), 'https://t.me/' + String(c.chat).replace('@', ''))]);
    } else if (c.invite) {
      rows.push([Markup.button.url('\ud83d\udce2 ' + (c.title || 'Kanal'), c.invite)]);
    }
  }
  rows.push([Markup.button.callback(t(lang, 'sub_check'), 'check_sub')]);
  return Markup.inlineKeyboard(rows);
}

function subscriptionMiddleware(getLang) {
  return async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return next();
    if (ctx.from.id === Number(process.env.ADMIN_ID)) return next();
    if (ctx.callbackQuery) {
      const d = ctx.callbackQuery.data || '';
      if (d === 'check_sub' || d.startsWith('lang:')) return next();
    }
    const res = await checkAll(ctx.telegram, ctx.from.id);
    if (res.ok) return next();
    const lang = await getLang(ctx);
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(t(lang, 'sub_required'), { parse_mode: 'HTML', ...joinKeyboard(res.notJoined, lang) });
  };
}

function registerSubscription(bot, getLang, afterOk) {
  bot.action('check_sub', async (ctx) => {
    const res = await checkAll(ctx.telegram, ctx.from.id);
    const lang = await getLang(ctx);
    if (!res.ok) return ctx.answerCbQuery(t(lang, 'sub_no'), { show_alert: true });
    await ctx.answerCbQuery(t(lang, 'sub_ok'));
    await ctx.deleteMessage().catch(() => {});
    await afterOk(ctx);
  });
}

module.exports = { subscriptionMiddleware, registerSubscription, checkAll };
