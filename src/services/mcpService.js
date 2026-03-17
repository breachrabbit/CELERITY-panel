/**
 * MCP Service — Tools registry and request dispatcher.
 *
 * Implements the Model Context Protocol (MCP) over SSE:
 *   methods: tools/list, tools/call, prompts/list, prompts/get
 *
 * All tool results are streamed back as SSE events:
 *   event: progress  — intermediate step info
 *   event: log       — stdout/stderr lines (SSH, setup)
 *   event: result    — final result (JSON)
 *   event: error     — tool or protocol error
 */

const logger = require('../utils/logger');

const { listPrompts, getPrompt } = require('../mcp/prompts');
const usersTools = require('../mcp/tools/users');
const nodesTools = require('../mcp/tools/nodes');
const groupsTools = require('../mcp/tools/groups');
const cascadeTools = require('../mcp/tools/cascade');
const systemTools = require('../mcp/tools/system');
const statsTools = require('../mcp/tools/stats');
const logsTools = require('../mcp/tools/logs');

// ─── Tool Definitions ────────────────────────────────────────────────────────
// Each entry: { description, requiredScope, inputSchema (JSON Schema), handler }

const TOOLS = {
    query: {
        description: 'Query data from the panel. Supports: users, nodes, groups, stats, topology, logs. Use resource to specify what to fetch.',
        requiredScope: null, // scope checked per resource in handler
        inputSchema: {
            type: 'object',
            properties: {
                resource: {
                    type: 'string',
                    enum: ['users', 'nodes', 'groups', 'stats', 'logs'],
                    description: 'What to query',
                },
                id: { type: 'string', description: 'Specific item ID (userId for users, MongoDB _id for nodes/groups/cascade)' },
                filter: {
                    type: 'object',
                    description: 'Resource-specific filters. Users: {enabled, group}. Nodes: {active, group, status}. Stats: {type, period, limit}. Logs: {level, filter, limit}.',
                },
                limit: { type: 'number', description: 'Max items to return (default 50)', default: 50 },
                page: { type: 'number', description: 'Page number for pagination (default 1)', default: 1 },
                sortBy: { type: 'string', description: 'Sort field (users: createdAt|userId|username|traffic|enabled)' },
                sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
                includeUsers: { type: 'boolean', description: 'Include users list (for single node query)', default: false },
                includeConfig: { type: 'boolean', description: 'Include generated node config (for single node query)', default: false },
            },
            required: ['resource'],
        },
    },

    manage_user: {
        description: 'Manage VPN users: create, update, delete, enable, disable, or reset traffic.',
        requiredScope: 'users:write',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'update', 'delete', 'enable', 'disable', 'reset_traffic'],
                    description: 'Action to perform',
                },
                userId: { type: 'string', description: 'User ID (required for all actions except create where it defines the new ID)' },
                data: {
                    type: 'object',
                    description: 'User data for create/update',
                    properties: {
                        username: { type: 'string', description: 'Display name' },
                        groups: { type: 'array', items: { type: 'string' }, description: 'Array of group MongoDB _ids' },
                        trafficLimit: { type: 'number', description: 'Traffic limit in bytes, 0 = unlimited' },
                        expireAt: { type: 'string', description: 'ISO datetime or null' },
                        maxDevices: { type: 'number', description: 'Max simultaneous devices, 0 = unlimited' },
                        enabled: { type: 'boolean' },
                    },
                },
            },
            required: ['action'],
        },
    },

    manage_node: {
        description: 'Manage Hysteria/Xray nodes: create, update, delete, sync, auto-setup via SSH, reset status, update config.',
        requiredScope: 'nodes:write',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'update', 'delete', 'sync', 'setup', 'reset_status', 'update_config'],
                    description: 'Action to perform',
                },
                id: { type: 'string', description: 'Node MongoDB _id (required for all except create)' },
                data: {
                    type: 'object',
                    description: 'Node data for create/update',
                    properties: {
                        name: { type: 'string' },
                        ip: { type: 'string' },
                        domain: { type: 'string' },
                        port: { type: 'number' },
                        type: { type: 'string', enum: ['hysteria', 'xray'] },
                        groups: { type: 'array', items: { type: 'string' } },
                        active: { type: 'boolean' },
                        country: { type: 'string', description: 'Country code, e.g. US, DE, NL' },
                        cascadeRole: { type: 'string', enum: ['standalone', 'portal', 'bridge', 'relay'] },
                    },
                },
                setupOptions: {
                    type: 'object',
                    description: 'Options for setup action',
                    properties: {
                        installHysteria: { type: 'boolean', default: true },
                        setupPortHopping: { type: 'boolean', default: true },
                        restartService: { type: 'boolean', default: true },
                    },
                },
            },
            required: ['action'],
        },
    },

    manage_group: {
        description: 'Manage server groups: create, update, or delete.',
        requiredScope: 'nodes:write',
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['create', 'update', 'delete'] },
                id: { type: 'string', description: 'Group MongoDB _id (required for update/delete)' },
                data: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        color: { type: 'string', description: 'CSS color, e.g. #ff0000' },
                        maxDevices: { type: 'number', description: 'Default max devices for users in this group' },
                        subscriptionTitle: { type: 'string' },
                    },
                },
            },
            required: ['action'],
        },
    },

    manage_cascade: {
        description: 'Manage cascade links between portal and bridge nodes: create, update, delete, deploy, undeploy, reconnect.',
        requiredScope: 'nodes:write',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'update', 'delete', 'deploy', 'undeploy', 'reconnect'],
                },
                id: { type: 'string', description: 'Cascade link MongoDB _id' },
                data: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        portalNodeId: { type: 'string', description: 'Portal (entry) node _id' },
                        bridgeNodeId: { type: 'string', description: 'Bridge (exit) node _id' },
                        tunnelPort: { type: 'number', description: 'Port for the tunnel (1-65535)' },
                        tunnelProtocol: { type: 'string', enum: ['vless', 'vmess'] },
                        tunnelSecurity: { type: 'string', enum: ['none', 'tls', 'reality'] },
                        tunnelTransport: { type: 'string', enum: ['tcp', 'ws', 'grpc', 'splithttp'] },
                        mode: { type: 'string', enum: ['reverse', 'forward'] },
                        priority: { type: 'number' },
                    },
                },
            },
            required: ['action'],
        },
    },

    execute_ssh: {
        description: 'Execute a shell command on a node via SSH. Returns stdout/stderr output. For interactive sessions use ssh_session.',
        requiredScope: 'nodes:write',
        inputSchema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string', description: 'Node MongoDB _id' },
                command: { type: 'string', description: 'Shell command to execute, e.g. "systemctl status hysteria-server"' },
                timeout: { type: 'number', description: 'Timeout in ms (default 30000, max 120000)', default: 30000 },
            },
            required: ['nodeId', 'command'],
        },
    },

    ssh_session: {
        description: 'Manage an interactive SSH session on a node. Start a session, send input commands, or close it.',
        requiredScope: 'nodes:write',
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: ['start', 'input', 'close'], description: 'start=open new session, input=send text, close=terminate' },
                nodeId: { type: 'string', description: 'Node MongoDB _id (required for start)' },
                sessionId: { type: 'string', description: 'Session ID returned by start (required for input/close)' },
                data: { type: 'string', description: 'Input text to send (for action=input, include newline \\n to execute)' },
            },
            required: ['action'],
        },
    },

    system_action: {
        description: 'System operations: sync all nodes, clear cache, create backup, or kick a user from all active sessions.',
        requiredScope: 'sync:write',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['sync_all', 'clear_cache', 'backup', 'kick_user'],
                },
                userId: { type: 'string', description: 'Required for kick_user action' },
            },
            required: ['action'],
        },
    },

    get_topology: {
        description: 'Get the full network topology: all active nodes and cascade links between them.',
        requiredScope: 'nodes:read',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },

    health_check: {
        description: 'Check panel health: uptime, sync status, cache stats, memory usage.',
        requiredScope: null,
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
};

// ─── Scope helpers ───────────────────────────────────────────────────────────

function hasScope(apiKey, scope) {
    if (!scope) return true;
    if (!apiKey) return false;
    return apiKey.scopes && apiKey.scopes.includes(scope);
}

// Determine required scope for query tool based on resource
function queryScopeFor(resource) {
    const map = {
        users: 'users:read',
        nodes: 'nodes:read',
        groups: 'stats:read',
        stats: 'stats:read',
        logs: 'stats:read',
    };
    return map[resource] || 'stats:read';
}

// ─── List Tools ──────────────────────────────────────────────────────────────

/**
 * Filter tools list based on what the API key has access to.
 * Tools with requiredScope=null are always included.
 */
function listTools(apiKey) {
    return Object.entries(TOOLS)
        .filter(([, def]) => {
            if (!def.requiredScope) return true;
            return hasScope(apiKey, def.requiredScope);
        })
        .map(([name, def]) => ({
            name,
            description: def.description,
            inputSchema: def.inputSchema,
        }));
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Dispatch a tool call. Emitter fn receives (event, data).
 * Returns final result object.
 */
async function callTool(name, args, apiKey, emit) {
    const def = TOOLS[name];
    if (!def) {
        throw Object.assign(new Error(`Unknown tool: ${name}`), { code: 404 });
    }

    // Session auth: session has no apiKey but full access
    const isSession = !apiKey;

    if (!isSession && def.requiredScope && !hasScope(apiKey, def.requiredScope)) {
        throw Object.assign(
            new Error(`Missing scope: ${def.requiredScope}`),
            { code: 403 }
        );
    }

    logger.info(`[MCP] tool=${name} args=${JSON.stringify(args).slice(0, 200)}`);

    switch (name) {
        // ── query ──────────────────────────────────────────────────────────
        case 'query': {
            const resource = args?.resource;
            if (!resource) throw new Error('resource is required');

            // Scope check per resource (unless session)
            if (!isSession) {
                const neededScope = queryScopeFor(resource);
                if (!hasScope(apiKey, neededScope)) {
                    throw Object.assign(new Error(`Missing scope: ${neededScope}`), { code: 403 });
                }
            }

            switch (resource) {
                case 'users':
                    return await usersTools.queryUsers(args);
                case 'nodes':
                    return await nodesTools.queryNodes(args);
                case 'groups':
                    return await groupsTools.queryGroups(args);
                case 'stats':
                    return await statsTools.queryStats(args.filter || args);
                case 'logs':
                    return await logsTools.queryLogs(args.filter || args);
                default:
                    throw new Error(`Unknown resource: ${resource}`);
            }
        }

        case 'manage_user':
            return await usersTools.manageUser(args, emit);

        case 'manage_node':
            return await nodesTools.manageNode(args, emit);

        case 'manage_group':
            return await groupsTools.manageGroup(args);

        case 'manage_cascade':
            return await cascadeTools.manageCascade(args, emit);

        case 'execute_ssh':
            return await nodesTools.executeSsh(args, emit);

        case 'ssh_session':
            return await nodesTools.sshSession(args, emit);

        case 'system_action':
            return await systemTools.systemAction(args, emit);

        case 'get_topology':
            return await cascadeTools.getTopology();

        case 'health_check':
            return await systemTools.healthCheck();

        default:
            throw Object.assign(new Error(`Tool not implemented: ${name}`), { code: 501 });
    }
}

module.exports = { listTools, callTool, TOOLS, listPrompts, getPrompt };
