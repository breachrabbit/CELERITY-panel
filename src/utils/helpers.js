/**
 * Common helpers
 */

const Settings = require('../models/settingsModel');
const ServerGroup = require('../models/serverGroupModel');
const cache = require('../services/cacheService');

// ==================== DURATION / INTERVAL UTILS ====================

/**
 * Parse a duration string into seconds.
 * Returns 0 for empty input, NaN for invalid format.
 * Supported units: ms, s (default), m, h.
 * @param {string} raw
 * @returns {number}
 */
function parseDurationSeconds(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (!v) return 0;
    const m = v.match(/^(\d+(\.\d+)?)(ms|s|m|h)?$/);
    if (!m) return NaN;
    const n = Number(m[1]);
    const unit = m[3] || 's';
    if (unit === 'ms') return n / 1000;
    if (unit === 's') return n;
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    return NaN;
}

/**
 * Normalize a hop interval string to 'Ns' format with a minimum of 5s.
 * Returns empty string if the value is missing, invalid, or zero.
 * @param {string} hopInterval
 * @returns {string}
 */
function normalizeHopInterval(hopInterval) {
    const sec = parseDurationSeconds(hopInterval);
    if (!Number.isFinite(sec) || sec <= 0) return '';
    const normalized = Math.max(Math.ceil(sec), 5);
    return `${normalized}s`;
}

async function getSettings() {
    const cached = await cache.getSettings();
    if (cached) return cached;
    
    const settings = await Settings.get();
    await cache.setSettings(settings.toObject ? settings.toObject() : settings);
    
    return settings;
}

async function invalidateSettingsCache() {
    await cache.invalidateSettings();
}

async function getNodesByGroups(userGroups) {
    const HyNode = require('../models/hyNodeModel');
    
    if (!userGroups || userGroups.length === 0) {
        return HyNode.find({ 
            active: true,
            $or: [
                { groups: { $size: 0 } },
                { groups: { $exists: false } }
            ]
        });
    }
    
    return HyNode.find({
        active: true,
        $or: [
            { groups: { $in: userGroups } },
            { groups: { $size: 0 } },
            { groups: { $exists: false } }
        ]
    });
}

async function getActiveGroups() {
    const cached = await cache.getGroups();
    if (cached) return cached;
    
    const groups = await ServerGroup.find({ active: true }).sort({ name: 1 }).lean();
    await cache.setGroups(groups);
    
    return groups;
}

async function invalidateGroupsCache() {
    await cache.invalidateGroups();
}

module.exports = {
    getSettings,
    invalidateSettingsCache,
    getNodesByGroups,
    getActiveGroups,
    invalidateGroupsCache,
    parseDurationSeconds,
    normalizeHopInterval,
};
