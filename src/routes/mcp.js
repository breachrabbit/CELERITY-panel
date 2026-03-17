/**
 * MCP Router — Model Context Protocol endpoint
 *
 * POST /api/mcp
 *   Body: { method: 'tools/list' | 'tools/call', params?: { name, arguments } }
 *   Auth: Bearer <api_key> with mcp:enabled scope, or admin session
 *   Response: text/event-stream (SSE)
 *
 * Supported methods:
 *   tools/list, tools/call
 *   prompts/list, prompts/get
 *
 * SSE Events:
 *   event: progress   data: { step?, total?, message }
 *   event: log        data: { type: stdout|stderr|info, text, sessionId? }
 *   event: result     data: { ...tool result }
 *   event: error      data: { error, code? }
 */

const express = require('express');
const router = express.Router();
const mcpService = require('../services/mcpService');
const logger = require('../utils/logger');
const { requireScope } = require('../middleware/auth');

// All MCP requests require mcp:enabled scope (or admin session bypasses it)
router.use(requireScope('mcp:enabled'));

/**
 * Send an SSE event. Handles JSON serialisation and keeps the stream alive.
 */
function sendEvent(res, event, data) {
    if (res.writableEnded) return;
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    res.write(`event: ${event}\ndata: ${payload}\n\n`);
}

/**
 * Setup SSE headers and heartbeat.
 * Returns a cleanup function.
 */
function initSSE(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    res.flushHeaders();

    // Keep connection alive every 20 s
    const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
            res.write(': heartbeat\n\n');
        } else {
            clearInterval(heartbeat);
        }
    }, 20000);

    req.on('close', () => clearInterval(heartbeat));

    return () => clearInterval(heartbeat);
}

/**
 * POST /api/mcp
 */
router.post('/', async (req, res) => {
    const cleanup = initSSE(req, res);

    const emit = (event, data) => sendEvent(res, event, data);

    try {
        const { method, params } = req.body || {};

        if (!method) {
            emit('error', { error: 'Missing method field', code: 400 });
            return res.end();
        }

        // ── tools/list ─────────────────────────────────────────────────────
        if (method === 'tools/list') {
            const apiKey = req.apiKey || null;
            const tools = mcpService.listTools(apiKey);
            emit('result', { tools });
            return res.end();
        }

        // ── tools/call ─────────────────────────────────────────────────────
        if (method === 'tools/call') {
            if (!params?.name) {
                emit('error', { error: 'Missing params.name', code: 400 });
                return res.end();
            }

            const toolName = params.name;
            const toolArgs = params.arguments || {};
            const apiKey = req.apiKey || null;

            let result;
            try {
                result = await mcpService.callTool(toolName, toolArgs, apiKey, emit);
            } catch (err) {
                const code = err.code || 500;
                logger.warn(`[MCP] Tool error ${toolName}: ${err.message}`);

                // Zod validation errors get a 400 with details
                if (err.name === 'ZodError') {
                    const issues = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
                    emit('error', { error: `Invalid arguments: ${issues}`, code: 400 });
                } else {
                    emit('error', { error: err.message, code });
                }
                return res.end();
            }

            // If result contains an error field (soft errors from handlers), emit as error event
            if (result && result.error) {
                emit('error', { error: result.error, code: result.code || 400 });
            } else {
                emit('result', result);
            }

            return res.end();
        }

        // ── prompts/list ───────────────────────────────────────────────────
        if (method === 'prompts/list') {
            const prompts = mcpService.listPrompts();
            emit('result', { prompts });
            return res.end();
        }

        // ── prompts/get ────────────────────────────────────────────────────
        if (method === 'prompts/get') {
            if (!params?.name) {
                emit('error', { error: 'Missing params.name', code: 400 });
                return res.end();
            }
            try {
                const result = mcpService.getPrompt(params.name, params.arguments || {});
                emit('result', result);
            } catch (err) {
                emit('error', { error: err.message, code: err.code || 400 });
            }
            return res.end();
        }

        // ── Unknown method ─────────────────────────────────────────────────
        emit('error', { error: `Unknown method: ${method}. Supported: tools/list, tools/call, prompts/list, prompts/get.`, code: 400 });
        return res.end();

    } catch (err) {
        logger.error(`[MCP] Unhandled error: ${err.message}`);
        if (!res.writableEnded) {
            emit('error', { error: 'Internal server error', code: 500 });
            res.end();
        }
    } finally {
        cleanup();
    }
});

/**
 * GET /api/mcp/tools — Lists available tools as JSON. Useful for quick inspection.
 */
router.get('/tools', (req, res) => {
    const tools = mcpService.listTools(req.apiKey || null);
    res.json({ tools });
});

/**
 * GET /api/mcp/prompts — Lists available prompts as JSON.
 */
router.get('/prompts', (req, res) => {
    res.json({ prompts: mcpService.listPrompts() });
});

module.exports = router;
