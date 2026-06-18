const fs = require('fs');
const path = require('path');

const LANGS = ['uz', 'ru', 'en'];
const locales = {};
for (const l of LANGS) {
  locales[l] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', l + '.json'), 'utf8'));
}

function t(lang, key, vars = {}) {
  const dict = locales[lang] || locales.uz;
  let s = dict[key] || locales.uz[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

// Bitta menu tugmasining 3 tildagi variantlari (bot.hears uchun)
function allLangs(key) {
  return LANGS.map((l) => locales[l][key]).filter(Boolean);
}

module.exports = { t, allLangs, LANGS };
