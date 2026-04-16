/**
 * i18n middleware (supports: ru, en)
 */

const fs = require('fs');
const path = require('path');

const locales = {};
const localesDir = path.join(__dirname, '../locales');

try {
    locales.en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
    locales.ru = JSON.parse(fs.readFileSync(path.join(localesDir, 'ru.json'), 'utf8'));
} catch (err) {
    console.error('Failed to load locales:', err.message);
}

const DEFAULT_LANG = 'ru';
const SUPPORTED_LANGS = ['en', 'ru'];

function interpolate(value, params = {}) {
    if (typeof value !== 'string') return value;
    return value.replace(/\{(\w+)\}/g, (_, key) => (
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`
    ));
}

function resolveKeyValue(key, lang = DEFAULT_LANG) {
    const locale = locales[lang] || locales[DEFAULT_LANG];
    const keys = key.split('.');
    let value = locale;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return null;
        }
    }

    return value;
}

function getPluralCategory(lang, count) {
    if (lang === 'ru') {
        const abs = Math.abs(Number(count)) || 0;
        const mod10 = abs % 10;
        const mod100 = abs % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    }
    return Number(count) === 1 ? 'one' : 'other';
}

function t(key, lang = DEFAULT_LANG, params = {}) {
    const value = resolveKeyValue(key, lang);
    return typeof value === 'string' ? interpolate(value, params) : key;
}

function tp(key, count, lang = DEFAULT_LANG, params = {}) {
    const value = resolveKeyValue(key, lang);
    if (!value || typeof value !== 'object') {
        return t(key, lang, { count, ...params });
    }

    const category = getPluralCategory(lang, count);
    const template = value[category] ?? value.other ?? value.many ?? value.few ?? value.one;
    if (typeof template !== 'string') return key;
    return interpolate(template, { count, ...params });
}

function detectLanguage(req) {
    if (req.query.lang && SUPPORTED_LANGS.includes(req.query.lang)) {
        return req.query.lang;
    }
    if (req.cookies?.lang && SUPPORTED_LANGS.includes(req.cookies.lang)) {
        return req.cookies.lang;
    }
    if (req.session?.lang && SUPPORTED_LANGS.includes(req.session.lang)) {
        return req.session.lang;
    }
    
    const acceptLang = req.headers['accept-language'];
    if (acceptLang) {
        for (const lang of SUPPORTED_LANGS) {
            if (acceptLang.toLowerCase().includes(lang)) {
                return lang;
            }
        }
    }
    
    return DEFAULT_LANG;
}

function i18nMiddleware(req, res, next) {
    const lang = detectLanguage(req);
    
    if (req.query.lang && SUPPORTED_LANGS.includes(req.query.lang)) {
        if (req.session) {
            req.session.lang = req.query.lang;
        }
        res.cookie('lang', req.query.lang, { 
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true 
        });
    }
    
    res.locals.lang = lang;
    res.locals.t = (key, params = {}) => t(key, lang, params);
    res.locals.tp = (key, count, params = {}) => tp(key, count, lang, params);
    res.locals.supportedLangs = SUPPORTED_LANGS;
    res.locals.locales = locales[lang] || locales[DEFAULT_LANG];
    
    next();
}

module.exports = { i18nMiddleware, t, tp, detectLanguage, SUPPORTED_LANGS, DEFAULT_LANG };


