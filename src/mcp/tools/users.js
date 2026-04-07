/**
 * MCP Tools — User management
 * Tools: query (users), manage_user
 */

const { z } = require('zod');
const HyUser = require('../../models/hyUserModel');
const HyNode = require('../../models/hyNodeModel');
const cryptoService = require('../../services/cryptoService');
const cache = require('../../services/cacheService');
const logger = require('../../utils/logger');
const webhook = require('../../services/webhookService');

async function invalidateUserCache(userId, subscriptionToken) {
    await cache.invalidateUser(userId);
    if (subscriptionToken) await cache.invalidateSubscription(subscriptionToken);
    await cache.clearDeviceIPs(userId);
    await cache.invalidateDashboardCounts();
}

function getSyncService() {
    return require('../../services/syncService');
}

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

// ─── Schemas ────────────────────────────────────────────────────────────────

const queryUsersSchema = z.object({
    id: z.string().optional().describe('Specific userId to fetch'),
    filter: z.object({
        enabled: z.boolean().optional(),
        group: z.string().optional(),
    }).optional(),
    limit: z.number().int().min(1).max(500).default(50),
    page: z.number().int().min(1).default(1),
    sortBy: z.enum(['createdAt', 'userId', 'username', 'traffic', 'enabled']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const manageUserSchema = z.object({
    action: z.enum(['create', 'update', 'delete', 'enable', 'disable', 'reset_traffic']),
    userId: z.string().optional(),
    data: z.object({
        username: z.string().optional(),
        groups: z.array(z.string()).optional(),
        trafficLimit: z.number().min(0).optional().describe('Traffic limit in bytes, 0 = unlimited'),
        expireAt: z.string().datetime().nullable().optional(),
        maxDevices: z.number().int().min(0).optional().describe('0 = unlimited'),
        enabled: z.boolean().optional(),
    }).optional(),
});

// ─── Handlers ────────────────────────────────────────────────────────────────

async function queryUsers(args) {
    const parsed = queryUsersSchema.parse(args);

    if (parsed.id) {
        const user = await HyUser.findOne({ userId: parsed.id })
            .populate('nodes', 'name ip domain port portRange')
            .populate('groups', 'name color');
        if (!user) return { error: `User '${parsed.id}' not found`, code: 404 };
        return { user };
    }

    const filter = {};
    if (parsed.filter?.enabled !== undefined) filter.enabled = parsed.filter.enabled;
    if (parsed.filter?.group) filter.groups = parsed.filter.group;

    const order = parsed.sortOrder === 'asc' ? 1 : -1;
    const skip = (parsed.page - 1) * parsed.limit;

    if (parsed.sortBy === 'traffic') {
        const pipeline = [
            { $match: filter },
            { $addFields: { totalTraffic: { $add: ['$traffic.tx', '$traffic.rx'] } } },
            { $sort: { totalTraffic: order } },
            { $skip: skip },
            { $limit: parsed.limit },
        ];
        const usersAgg = await HyUser.aggregate(pipeline);
        const users = await HyUser.populate(usersAgg, [
            { path: 'nodes', select: 'name ip' },
            { path: 'groups', select: 'name color' },
        ]);
        const total = await HyUser.countDocuments(filter);
        return { users, pagination: { page: parsed.page, limit: parsed.limit, total, pages: Math.ceil(total / parsed.limit) } };
    }

    const sortField = {
        userId: { userId: order },
        username: { username: order },
        enabled: { enabled: order },
        createdAt: { createdAt: order },
    }[parsed.sortBy] || { createdAt: order };

    const users = await HyUser.find(filter)
        .sort(sortField)
        .skip(skip)
        .limit(parsed.limit)
        .populate('nodes', 'name ip')
        .populate('groups', 'name color');

    const total = await HyUser.countDocuments(filter);

    return {
        users,
        pagination: { page: parsed.page, limit: parsed.limit, total, pages: Math.ceil(total / parsed.limit) },
    };
}

async function manageUser(args, emit) {
    const parsed = manageUserSchema.parse(args);
    const { action, userId, data = {} } = parsed;

    switch (action) {
        case 'create': {
            if (!userId) throw new Error('userId is required for create');
            const existing = await HyUser.findOne({ userId });
            if (existing) return { error: 'User already exists', code: 409, user: existing };

            const password = cryptoService.generatePassword(userId);
            const user = new HyUser({
                userId,
                username: data.username || '',
                password,
                groups: data.groups || [],
                enabled: data.enabled !== undefined ? data.enabled : false,
                trafficLimit: data.trafficLimit || 0,
                expireAt: data.expireAt || null,
                maxDevices: data.maxDevices || 0,
                nodes: [],
            });
            await user.save();
            logger.info(`[MCP] Created user ${userId}`);
            webhook.emit(webhook.EVENTS.USER_CREATED, { userId, username: data.username || '', groups: data.groups || [] });
            if (user.enabled) getSyncService().addUserToAllXrayNodes(user.toObject()).catch(() => {});
            emit('progress', { message: `User '${userId}' created` });
            return { success: true, user };
        }

        case 'update': {
            if (!userId) throw new Error('userId is required for update');
            const user = await HyUser.findOne({ userId });
            if (!user) return { error: `User '${userId}' not found`, code: 404 };

            const prevEnabled = user.enabled;
            const prevGroups = normalizeIdArray(user.groups);
            const updates = {};
            if (data.enabled !== undefined) updates.enabled = data.enabled;
            if (data.username !== undefined) updates.username = data.username;
            if (data.trafficLimit !== undefined) updates.trafficLimit = data.trafficLimit;
            if (data.expireAt !== undefined) updates.expireAt = data.expireAt;
            if (data.groups !== undefined) updates.groups = data.groups;
            if (data.maxDevices !== undefined) updates.maxDevices = data.maxDevices;

            const updated = await HyUser.findOneAndUpdate({ userId }, { $set: updates }, { new: true })
                .populate('nodes', 'name ip')
                .populate('groups', 'name color');

            await invalidateUserCache(userId, user.subscriptionToken);
            const reconcileNeeded = (
                (data.enabled !== undefined && data.enabled !== prevEnabled) ||
                (data.groups !== undefined && !sameIdSet(prevGroups, normalizeIdArray(data.groups)))
            );
            if (reconcileNeeded) {
                getSyncService().reconcileUserOnAllXrayNodes(updated.toObject()).catch(() => {});
            }
            logger.info(`[MCP] Updated user ${userId}`);
            webhook.emit(webhook.EVENTS.USER_UPDATED, { userId, updates });
            return { success: true, user: updated };
        }

        case 'delete': {
            if (!userId) throw new Error('userId is required for delete');
            const user = await HyUser.findOneAndDelete({ userId });
            if (!user) return { error: `User '${userId}' not found`, code: 404 };
            getSyncService().removeUserFromAllXrayNodes(user.toObject()).catch(() => {});
            await invalidateUserCache(userId, user.subscriptionToken);
            logger.info(`[MCP] Deleted user ${userId}`);
            webhook.emit(webhook.EVENTS.USER_DELETED, { userId });
            return { success: true, message: `User '${userId}' deleted` };
        }

        case 'enable': {
            if (!userId) throw new Error('userId is required for enable');
            const user = await HyUser.findOneAndUpdate({ userId }, { $set: { enabled: true } }, { new: true });
            if (!user) return { error: `User '${userId}' not found`, code: 404 };
            getSyncService().addUserToAllXrayNodes(user.toObject()).catch(() => {});
            await invalidateUserCache(userId, user.subscriptionToken);
            logger.info(`[MCP] Enabled user ${userId}`);
            webhook.emit(webhook.EVENTS.USER_ENABLED, { userId });
            return { success: true, user };
        }

        case 'disable': {
            if (!userId) throw new Error('userId is required for disable');
            const user = await HyUser.findOneAndUpdate({ userId }, { $set: { enabled: false } }, { new: true });
            if (!user) return { error: `User '${userId}' not found`, code: 404 };
            getSyncService().removeUserFromAllXrayNodes(user.toObject()).catch(() => {});
            await invalidateUserCache(userId, user.subscriptionToken);
            logger.info(`[MCP] Disabled user ${userId}`);
            webhook.emit(webhook.EVENTS.USER_DISABLED, { userId });
            return { success: true, user };
        }

        case 'reset_traffic': {
            if (!userId) throw new Error('userId is required for reset_traffic');
            const user = await HyUser.findOneAndUpdate(
                { userId },
                { $set: { 'traffic.tx': 0, 'traffic.rx': 0 } },
                { new: true }
            );
            if (!user) return { error: `User '${userId}' not found`, code: 404 };
            await invalidateUserCache(userId, user.subscriptionToken);
            logger.info(`[MCP] Reset traffic for user ${userId}`);
            return { success: true, message: `Traffic reset for '${userId}'`, user };
        }

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

module.exports = {
    queryUsers,
    manageUser,
    schemas: {
        queryUsers: queryUsersSchema,
        manageUser: manageUserSchema,
    },
};
