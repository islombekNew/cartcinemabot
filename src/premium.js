const { Markup } = require('telegraf');
const db = require('./db');
const state = require('./state');
const { t, allLangs } = require('./i18n');

function registerPremium(bot, getLang) {
  const showPremium = async (ctx) => {
    const lang = await getLang(ctx);
    const user = await db.getUser(ctx.from.id);
    if (db.isPremiumActive(user)) {
      const until = user.premiumUntil ? new Date(user.premiumUntil).toLocaleDateString('uz-UZ') : '\u221e';
      return ctx.reply(t(lang, 'premium_active', { until }));
    }
    const s = await db.getSettings();
    await ctx.reply(
      t(lang, 'premium_info', { price: s.premiumPrice, days: s.premiumDays, card: s.cardNumber }),
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn_paid'), 'pay_paid')]]) }
    );
  };

  bot.hears(allLangs('menu_premium'), showPremium);
  bot.action('buy_premium', async (ctx) => {
    await ctx.answerCbQuery();
    await showPremium(ctx);
  });

  // "To'lov qildim" -> skrinshot so'rash
  bot.action('pay_paid', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = await getLang(ctx);
    state.set(ctx.from.id, { action: 'pay_photo' });
    await ctx.reply(t(lang, 'pay_screenshot'));
  });

  // Admin tasdiqlash / rad etish
  bot.action(/^pay:(ok|no):(.+)$/, async (ctx) => {
    if (ctx.from.id !== Number(process.env.ADMIN_ID)) {
      return ctx.answerCbQuery('\u26d4', { show_alert: true });
    }
    const [, verdict, id] = ctx.match;
    const status = verdict === 'ok' ? 'approved' : 'rejected';
    const payment = await db.setPaymentStatus(id, status);
    if (!payment) return ctx.answerCbQuery('\u274c');
    await ctx.answerCbQuery(status === 'approved' ? '\u2705' : '\u274c');
    await ctx.editMessageCaption(
      (ctx.callbackQuery.message.caption || '') + '\n\n' +
      (status === 'approved' ? '\u2705 TASDIQLANDI' : '\u274c RAD ETILDI')
    ).catch(() => {});

    const user = await db.getUser(payment.userId);
    const lang = (user && user.lang) || 'uz';
    const s = await db.getSettings();
    if (status === 'approved') {
      await db.setPremium(payment.userId, true, s.premiumDays);
      await ctx.telegram.sendMessage(payment.userId, t(lang, 'pay_approved', { days: s.premiumDays })).catch(() => {});
    } else {
      await ctx.telegram.sendMessage(payment.userId, t(lang, 'pay_rejected')).catch(() => {});
    }
  });
}

// Skrinshot qabul qilish
async function handlePhoto(ctx, lang) {
  const s = await db.getSettings();
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;
  const payment = await db.addPayment({
    userId: ctx.from.id,
    username: ctx.from.username || '',
    amount: s.premiumPrice,
    photo: fileId,
  });
  state.clear(ctx.from.id);
  await ctx.reply(t(lang, 'pay_received'));

  const adminId = Number(process.env.ADMIN_ID);
  await ctx.telegram.sendPhoto(adminId, fileId, {
    caption:
      '\ud83d\udc8e <b>PREMIUM SO\u2018ROVI</b>\n\n' +
      '\ud83d\udc64 ' + (ctx.from.username ? '@' + ctx.from.username : ctx.from.first_name) +
      ' (<code>' + ctx.from.id + '</code>)\n' +
      '\ud83d\udcb0 ' + s.premiumPrice,
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[
      Markup.button.callback('\u2705 Tasdiqlash', 'pay:ok:' + payment.id),
      Markup.button.callback('\u274c Rad etish', 'pay:no:' + payment.id),
    ]]),
  }).catch((e) => console.error('Adminga payment:', e.message));
}

module.exports = { registerPremium, handlePhoto };
