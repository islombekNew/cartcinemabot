const { Markup } = require('telegraf');
const db = require('./db');
const { t, allLangs } = require('./i18n');

const LANG_NAMES = { uz: "O\u2018zbekcha", ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", en: 'English' };

function langKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('\ud83c\uddfa\ud83c\uddff O\u2018zbekcha', 'lang:uz')],
    [Markup.button.callback('\ud83c\uddf7\ud83c\uddfa \u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'lang:ru')],
    [Markup.button.callback('\ud83c\uddec\ud83c\udde7 English', 'lang:en')],
  ]);
}

function registerProfile(bot, getLang, sendMainMenu) {
  // Profil
  bot.hears(allLangs('menu_profile'), async (ctx) => {
    const lang = await getLang(ctx);
    const user = await db.getUser(ctx.from.id);
    const status = db.isPremiumActive(user)
      ? t(lang, 'status_premium', { until: new Date(user.premiumUntil).toLocaleDateString('uz-UZ') })
      : t(lang, 'status_free');
    await ctx.reply(
      t(lang, 'profile', {
        id: user.id,
        name: user.firstName || '\u2014',
        date: new Date(user.joinedAt).toLocaleDateString('uz-UZ'),
        status,
        views: user.views || 0,
      }),
      { parse_mode: 'HTML' }
    );
  });

  // Til
  bot.hears(allLangs('menu_lang'), async (ctx) => {
    await ctx.reply(t('uz', 'choose_lang'), langKeyboard());
  });
  bot.action(/^lang:(uz|ru|en)$/, async (ctx) => {
    const lang = ctx.match[1];
    await db.setUserLang(ctx.from.id, lang);
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(t(lang, 'lang_set'));
    await sendMainMenu(ctx, lang);
  });

  // Yordam
  bot.hears(allLangs('menu_help'), async (ctx) => {
    const lang = await getLang(ctx);
    const s = await db.getSettings();
    await ctx.reply(t(lang, 'help', { admin: s.adminContact }), { parse_mode: 'HTML' });
  });
}

module.exports = { registerProfile, langKeyboard, LANG_NAMES };
