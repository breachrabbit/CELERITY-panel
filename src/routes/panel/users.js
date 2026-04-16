const express = require('express');
const router = express.Router();
const HyUser = require('../../models/hyUserModel');
const HyNode = require('../../models/hyNodeModel');
const ServerGroup = require('../../models/serverGroupModel');
const cryptoService = require('../../services/cryptoService');
const syncService = require('../../services/syncService');
const cache = require('../../services/cacheService');
const webhookService = require('../../services/webhookService');
const { render } = require('./helpers');
const { getActiveGroups, getSettings, invalidateGroupsCache } = require('../../utils/helpers');
const logger = require('../../utils/logger');

function normalizeIdArray(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(v => v?._id?.toString?.() || v?.toString?.() || '')
        .filter(Boolean)
        .sort();
}

function sameIdSet(left, right) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) return false;
    }
    return true;
}

function toPlainUser(user) {
    return typeof user?.toObject === 'function' ? user.toObject() : user;
}

function parseGroupsField(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function resolveExpireAt(expireAtRaw, expireDays) {
    const hasExpireAt = typeof expireAtRaw === 'string' && expireAtRaw.trim() !== '';

    if (hasExpireAt) {
        const parsedExpireAt = new Date(expireAtRaw);

        if (Number.isNaN(parsedExpireAt.getTime())) {
            return { error: 'Некорректный формат даты/времени окончания' };
        }

        if (parsedExpireAt.getTime() < Date.now()) {
            return { error: 'Дата/время окончания не может быть в прошлом' };
        }

        return { value: parsedExpireAt };
    }

    const days = parseInt(expireDays, 10);
    if (Number.isFinite(days) && days > 0) {
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + days);
        return { value: expireAt };
    }

    return { value: null };
}

function resolveOptionalDate(rawValue, { allowPast = true, label = 'даты' } = {}) {
    const hasValue = typeof rawValue === 'string' && rawValue.trim() !== '';
    if (!hasValue) {
        return { value: null };
    }

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
        return { error: `Некорректный формат ${label}` };
    }

    if (!allowPast && parsed.getTime() < Date.now()) {
        return { error: `${label.charAt(0).toUpperCase()}${label.slice(1)} не может быть в прошлом` };
    }

    return { value: parsed };
}

function scheduleXrayReconcile(user, logContext) {
    const plainUser = toPlainUser(user);
    if (!plainUser) return;

    syncService.reconcileUserOnAllXrayNodes(plainUser).catch(err => {
        logger.error(`[Panel] Xray reconcile error for ${logContext}: ${err.message}`);
    });
}

function calculateEffectiveUserDeviceLimit(user) {
    const directLimit = parseInt(user?.maxDevices, 10) || 0;
    if (directLimit === -1) {
        return { limit: 0, label: '∞', source: 'unlimited' };
    }
    if (directLimit > 0) {
        return { limit: directLimit, label: String(directLimit), source: 'user' };
    }

    const groupLimits = (user?.groups || [])
        .map((group) => parseInt(group?.maxDevices, 10) || 0)
        .filter((limit) => limit > 0);

    if (groupLimits.length > 0) {
        const limit = Math.min(...groupLimits);
        return { limit, label: String(limit), source: 'group' };
    }

    return { limit: 0, label: '∞', source: 'none' };
}

function formatTrafficValue(bytes) {
    const value = Number(bytes) || 0;
    if (value <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let current = value;
    let unitIndex = 0;

    while (current >= 1024 && unitIndex < units.length - 1) {
        current /= 1024;
        unitIndex += 1;
    }

    const precision = current >= 100 || unitIndex === 0 ? 0 : current >= 10 ? 1 : 2;
    return `${current.toFixed(precision)} ${units[unitIndex]}`;
}

// ==================== USERS ====================

// GET /users - User list (with search and sorting)
router.get('/users', async (req, res) => {
    try {
        const { enabled, group, page = 1, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const limit = 50;
        
        const filter = {};
        if (enabled !== undefined) filter.enabled = enabled === 'true';
        if (group) filter.groups = group;
        
        if (search && search.trim()) {
            const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchRegex = new RegExp(escaped, 'i');
            filter.$or = [
                { userId: searchRegex },
                { username: searchRegex }
            ];
        }
        
        let users;
        const order = sortOrder === 'asc' ? 1 : -1;
        
        if (sortBy === 'traffic') {
            const pipeline = [
                { $match: filter },
                {
                    $addFields: {
                        totalTraffic: { $add: [{ $ifNull: ['$traffic.tx', 0] }, { $ifNull: ['$traffic.rx', 0] }] }
                    }
                },
                { $sort: { totalTraffic: order } },
                { $skip: (page - 1) * limit },
                { $limit: limit }
            ];
            
            const usersAggregated = await HyUser.aggregate(pipeline);
            users = await HyUser.populate(usersAggregated, [
                { path: 'groups', select: 'name color' }
            ]);
        } else {
            let sortField = {};
            switch (sortBy) {
                case 'userId':
                    sortField = { userId: order };
                    break;
                case 'username':
                    sortField = { username: order };
                    break;
                case 'enabled':
                    sortField = { enabled: order };
                    break;
                case 'createdAt':
                default:
                    sortField = { createdAt: order };
                    break;
            }
            
            users = await HyUser.find(filter)
                .sort(sortField)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('groups', 'name color')
                .lean();
        }
        
        const [total, groups] = await Promise.all([
            HyUser.countDocuments(filter),
            getActiveGroups(),
        ]);
        
        render(res, 'users', {
            title: res.locals.locales.users.title,
            page: 'users',
            users,
            groups,
            pagination: {
                page: parseInt(page),
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
            query: req.query,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /users/add - Create user form
router.get('/users/add', async (req, res) => {
    try {
        const groups = await getActiveGroups();
        render(res, 'user-form', {
            title: res.locals.locales.users.newUser,
            page: 'users',
            groups,
            isEdit: false,
            user: null,
            error: null,
        });
    } catch (error) {
        logger.error('[Panel] GET /users/add error:', error.message);
        res.status(500).send('Error: ' + error.message);
    }
});

// GET /users/:userId/edit - Edit user form
router.get('/users/:userId/edit', async (req, res) => {
    try {
        const [user, groups] = await Promise.all([
            HyUser.findOne({ userId: req.params.userId }).populate('groups', 'name color maxDevices'),
            getActiveGroups(),
        ]);

        if (!user) {
            return res.redirect('/panel/users');
        }

        render(res, 'user-form', {
            title: `Редактирование ${user.userId}`,
            page: 'users',
            groups,
            user,
            isEdit: true,
            error: null,
        });
    } catch (error) {
        res.status(500).send(`${res.locals.t?.('common.error') || 'Error'}: ${error.message}`);
    }
});

// POST /users - Create user
router.post('/users', async (req, res) => {
    try {
        const {
            userId,
            username,
            trafficLimitGB,
            expireDays,
            expireAt: expireAtRaw,
            enabled,
            maxDevices,
            supportDueAt: supportDueAtRaw,
            supportLastPaymentAt: supportLastPaymentAtRaw,
        } = req.body;
        
        if (!userId) {
            return res.status(400).send('userId обязателен');
        }
        
        const existing = await HyUser.findOne({ userId });
        if (existing) {
            return res.status(409).send('Пользователь уже существует');
        }
        
        const password = cryptoService.generatePassword(userId);
        
        const groups = parseGroupsField(req.body.groups);
        const { value: expireAt, error: expireAtError } = resolveExpireAt(expireAtRaw, expireDays);
        if (expireAtError) {
            return res.status(400).send(expireAtError);
        }
        const { value: supportDueAt, error: supportDueAtError } = resolveOptionalDate(supportDueAtRaw, {
            allowPast: true,
            label: 'даты окончания периода поддержки',
        });
        if (supportDueAtError) {
            return res.status(400).send(supportDueAtError);
        }
        const { value: supportLastPaymentAt, error: supportLastPaymentAtError } = resolveOptionalDate(supportLastPaymentAtRaw, {
            allowPast: true,
            label: 'даты последней поддержки',
        });
        if (supportLastPaymentAtError) {
            return res.status(400).send(supportLastPaymentAtError);
        }
        
        const trafficLimit = (parseInt(trafficLimitGB, 10) || 0) * 1024 * 1024 * 1024;
        
        const userMaxDevices = parseInt(maxDevices) || 0;
        
        const newUser = await HyUser.create({
            userId,
            username: username || '',
            password,
            groups,
            enabled: enabled === 'on',
            trafficLimit,
            maxDevices: userMaxDevices,
            expireAt,
            support: {
                dueAt: supportDueAt,
                lastPaymentAt: supportLastPaymentAt,
            },
            nodes: [],
        });

        if (newUser.enabled) {
            scheduleXrayReconcile(newUser, userId);
        }
        
        res.redirect(`/panel/users/${userId}`);
    } catch (error) {
        res.status(500).send(`${res.locals.t?.('common.error') || 'Error'}: ${error.message}`);
    }
});

// POST /users/:userId - Update user
router.post('/users/:userId', async (req, res) => {
    try {
        const {
            username,
            trafficLimitGB,
            expireDays,
            expireAt: expireAtRaw,
            enabled,
            maxDevices,
            supportDueAt: supportDueAtRaw,
            supportLastPaymentAt: supportLastPaymentAtRaw,
        } = req.body;
        const [user, availableGroups] = await Promise.all([
            HyUser.findOne({ userId: req.params.userId }),
            getActiveGroups(),
        ]);

        if (!user) {
            return res.redirect('/panel/users');
        }

        const groups = parseGroupsField(req.body.groups);

        const trafficLimit = (parseInt(trafficLimitGB, 10) || 0) * 1024 * 1024 * 1024;
        const userMaxDevices = parseInt(maxDevices, 10) || 0;
        const draftUser = {
            ...toPlainUser(user),
            username: username || '',
            groups,
            enabled: enabled === 'on',
            trafficLimit,
            maxDevices: userMaxDevices,
            expireAt: expireAtRaw,
            support: {
                dueAt: supportDueAtRaw,
                lastPaymentAt: supportLastPaymentAtRaw,
            },
        };

        const { value: expireAt, error: expireAtError } = resolveExpireAt(expireAtRaw, expireDays);
        if (expireAtError) {
            draftUser.expireAt = null;
            return render(res, 'user-form', {
                title: res.locals.t('users.editUser') + ' ' + req.params.userId,
                page: 'users',
                groups: availableGroups,
                user: draftUser,
                isEdit: true,
                error: res.locals.t('users.expireAtInvalidError'),
            });
        }
        draftUser.expireAt = expireAt;
        const { value: supportDueAt, error: supportDueAtError } = resolveOptionalDate(supportDueAtRaw, {
            allowPast: true,
            label: 'даты окончания периода поддержки',
        });
        if (supportDueAtError) {
            return render(res, 'user-form', {
                title: res.locals.t('users.editUser') + ' ' + req.params.userId,
                page: 'users',
                groups: availableGroups,
                user: draftUser,
                isEdit: true,
                error: supportDueAtError,
            });
        }
        const { value: supportLastPaymentAt, error: supportLastPaymentAtError } = resolveOptionalDate(supportLastPaymentAtRaw, {
            allowPast: true,
            label: 'даты последней поддержки',
        });
        if (supportLastPaymentAtError) {
            return render(res, 'user-form', {
                title: res.locals.t('users.editUser') + ' ' + req.params.userId,
                page: 'users',
                groups: availableGroups,
                user: draftUser,
                isEdit: true,
                error: supportLastPaymentAtError,
            });
        }
        draftUser.support = {
            dueAt: supportDueAt,
            lastPaymentAt: supportLastPaymentAt,
        };

        const updates = {
            enabled: enabled === 'on',
            username: username || '',
            groups,
            trafficLimit,
            expireAt,
            maxDevices: userMaxDevices,
            support: {
                dueAt: supportDueAt,
                lastPaymentAt: supportLastPaymentAt,
            },
        };

        const wasEnabled = user.enabled;
        const nowEnabled = updates.enabled;
        const groupsChanged = !sameIdSet(
            normalizeIdArray(user.groups),
            normalizeIdArray(groups),
        );

        const updatedUser = await HyUser.findOneAndUpdate(
            { userId: req.params.userId },
            { $set: updates },
            { new: true },
        ).lean();
        const plainUpdatedUser = toPlainUser(updatedUser);

        await cache.invalidateUser(req.params.userId);
        if (user.subscriptionToken) {
            await cache.invalidateSubscription(user.subscriptionToken);
        }
        await cache.clearDeviceIPs(req.params.userId);
        await cache.invalidateDashboardCounts();

        if (wasEnabled !== nowEnabled || groupsChanged) {
            scheduleXrayReconcile(plainUpdatedUser || { ...toPlainUser(user), ...updates }, req.params.userId);
        }

        webhookService.emit(webhookService.EVENTS.USER_UPDATED, { userId: req.params.userId, updates });

        res.redirect(`/panel/users/${req.params.userId}`);
    } catch (error) {
        res.status(500).send(`${res.locals.t?.('common.error') || 'Error'}: ${error.message}`);
    }
});

// GET /users/:userId - User details
router.get('/users/:userId', async (req, res) => {
    try {
        const [user, allGroups] = await Promise.all([
            HyUser.findOne({ userId: req.params.userId })
                .populate('nodes', 'name ip domain active groups type status flag country')
                .populate('groups', 'name color maxDevices'),
            getActiveGroups(),
        ]);
        
        if (!user) {
            return res.redirect('/panel/users');
        }
        
        let effectiveNodes = [];
        const directNodes = (user.nodes || []).filter(n => n && n.active);
        const directNodeIdSet = new Set(directNodes.map((node) => String(node._id)));
        if (directNodes.length > 0) {
            effectiveNodes = directNodes;
        } else if (user.groups && user.groups.length > 0) {
            effectiveNodes = await HyNode.find({ active: true, groups: { $in: user.groups } })
                .select('name ip domain groups type status flag country').lean();
        }

        const settings = await getSettings();
        const gracePeriodMinutes = settings?.deviceGracePeriod ?? 15;
        const now = Date.now();
        const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
        const deviceActivity = await cache.getDeviceActivity(user.userId);
        const activeDeviceEntries = deviceActivity
            .filter((entry) => Number.isFinite(entry.ts) && (now - entry.ts) < gracePeriodMs)
            .map((entry) => ({
                ...entry,
                lastSeenAt: new Date(entry.ts),
                lastSeenAgoMinutes: Math.max(0, Math.round((now - entry.ts) / 60000)),
            }));
        const activeDevices = activeDeviceEntries.length;

        const deviceLimitInfo = calculateEffectiveUserDeviceLimit(user);
        const totalTraffic = (user.traffic?.tx || 0) + (user.traffic?.rx || 0);
        const trafficLimit = Number(user.trafficLimit || 0);
        const trafficProgress = trafficLimit > 0
            ? Math.min(100, Math.round((totalTraffic / trafficLimit) * 100))
            : null;

        const effectiveNodeCards = effectiveNodes.map((node) => {
            const plain = typeof node?.toObject === 'function' ? node.toObject() : { ...node };
            return {
                ...plain,
                assignmentType: directNodeIdSet.has(String(plain._id)) ? 'direct' : 'group',
            };
        });

        const activeNodeHints = Array.from(new Map(
            activeDeviceEntries
                .filter((entry) => entry.nodeName)
                .map((entry) => [entry.nodeId || entry.nodeName, {
                    nodeId: entry.nodeId || '',
                    nodeName: entry.nodeName,
                    nodeType: entry.nodeType || '',
                    source: entry.source || '',
                }]),
        ).values());
        
        render(res, 'user-detail', {
            title: `Пользователь ${user.userId}`,
            page: 'users',
            user,
            allGroups,
            effectiveNodes: effectiveNodeCards,
            activeDevices,
            activeDeviceEntries,
            activeNodeHints,
            deviceLimitInfo,
            totalTraffic,
            trafficLimit,
            trafficProgress,
            formatTrafficValue,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// ==================== GROUPS ====================

// GET /groups - Group list
router.get('/groups', async (req, res) => {
    try {
        const groups = await ServerGroup.find().sort({ name: 1 });

        const groupIds = groups.map((group) => group._id);
        let nodeCountMap = new Map();
        let userCountMap = new Map();

        if (groupIds.length > 0) {
            const [nodeCounts, userCounts] = await Promise.all([
                HyNode.aggregate([
                    { $match: { groups: { $in: groupIds } } },
                    { $unwind: '$groups' },
                    { $match: { groups: { $in: groupIds } } },
                    { $group: { _id: '$groups', count: { $sum: 1 } } },
                ]),
                HyUser.aggregate([
                    { $match: { groups: { $in: groupIds } } },
                    { $unwind: '$groups' },
                    { $match: { groups: { $in: groupIds } } },
                    { $group: { _id: '$groups', count: { $sum: 1 } } },
                ]),
            ]);

            nodeCountMap = new Map(nodeCounts.map((item) => [String(item._id), item.count]));
            userCountMap = new Map(userCounts.map((item) => [String(item._id), item.count]));
        }

        const groupsWithCounts = groups.map((group) => ({
            ...group.toObject(),
            nodesCount: nodeCountMap.get(String(group._id)) || 0,
            usersCount: userCountMap.get(String(group._id)) || 0,
        }));
        
        render(res, 'groups', {
            title: res.locals.locales.groups.title,
            page: 'groups',
            groups: groupsWithCounts,
        });
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /groups - Create group
router.post('/groups', async (req, res) => {
    try {
        const { name, description, color, maxDevices, subscriptionTitle } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).send('Название обязательно');
        }
        
        await ServerGroup.create({
            name: name.trim(),
            description: description || '',
            color: color || '#6366f1',
            maxDevices: parseInt(maxDevices) || 0,
            subscriptionTitle: subscriptionTitle?.trim() || '',
        });
        
        await invalidateGroupsCache();
        
        res.redirect('/panel/groups');
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).send('Группа с таким названием уже существует');
        }
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /groups/:id - Update group
router.post('/groups/:id', async (req, res) => {
    try {
        const { name, description, color, active, maxDevices, subscriptionTitle } = req.body;
        
        await ServerGroup.findByIdAndUpdate(req.params.id, {
            $set: {
                name: name?.trim() || '',
                description: description || '',
                color: color || '#6366f1',
                active: active === 'on',
                maxDevices: parseInt(maxDevices) || 0,
                subscriptionTitle: subscriptionTitle?.trim() || '',
            }
        });
        
        await invalidateGroupsCache();
        
        res.redirect('/panel/groups');
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

// POST /groups/:id/delete - Delete group
router.post('/groups/:id/delete', async (req, res) => {
    try {
        await Promise.all([
            HyNode.updateMany({ groups: req.params.id }, { $pull: { groups: req.params.id } }),
            HyUser.updateMany({ groups: req.params.id }, { $pull: { groups: req.params.id } }),
            ServerGroup.findByIdAndDelete(req.params.id),
        ]);
        
        await invalidateGroupsCache();
        
        res.redirect('/panel/groups');
    } catch (error) {
        res.status(500).send('Error: ' + error.message);
    }
});

module.exports = router;
