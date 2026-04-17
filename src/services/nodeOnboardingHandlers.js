const HyNode = require('../models/hyNodeModel');
const nodeSetup = require('./nodeSetup');

function parseMissingTools(output) {
    const lines = String(output || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    return lines
        .filter((line) => line.startsWith('__missing__:'))
        .map((line) => line.replace('__missing__:', '').trim())
        .filter(Boolean);
}

async function withNodeSsh(nodeId, executor) {
    const node = await HyNode.findById(nodeId).lean();
    if (!node) {
        throw new Error('Onboarding node not found');
    }

    if (!node.ssh?.password && !node.ssh?.privateKey) {
        throw new Error('SSH credentials are not configured for onboarding node');
    }

    let conn;
    try {
        conn = await nodeSetup.connectSSH(node);
        return await executor({ node, conn });
    } finally {
        if (conn?.end) {
            try { conn.end(); } catch (_) {}
        }
    }
}

async function runPreflight({ job }) {
    return withNodeSsh(job.nodeId, async ({ node, conn }) => {
        const probeCmd = [
            'set -e',
            'for t in bash systemctl curl openssl; do',
            '  command -v "$t" >/dev/null 2>&1 || echo "__missing__:$t"',
            'done',
            'echo "__kernel__=$(uname -srm 2>/dev/null || uname -a 2>/dev/null)"',
            'if [ -f /etc/os-release ]; then',
            '  . /etc/os-release',
            '  echo "__os__=${ID:-unknown}:${VERSION_ID:-unknown}"',
            'fi',
            'echo "__uptime__=$(uptime 2>/dev/null | sed -E \'s/ +/ /g\' || true)"',
        ].join('\n');

        const result = await nodeSetup.execSSH(conn, `sh -lc ${JSON.stringify(probeCmd)}`);
        const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        const missingTools = parseMissingTools(output);

        const kernel = (output.match(/__kernel__=(.+)/) || [])[1] || '';
        const os = (output.match(/__os__=(.+)/) || [])[1] || '';
        const uptime = (output.match(/__uptime__=(.+)/) || [])[1] || '';

        if (missingTools.length > 0) {
            throw new Error(`Preflight missing tools: ${missingTools.join(', ')}`);
        }

        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            os,
            kernel,
            uptime,
            missingTools: [],
            sshOk: true,
        };
    });
}

async function runPrepareHost({ job }) {
    return withNodeSsh(job.nodeId, async ({ node, conn }) => {
        const prepareCmd = [
            'set -e',
            'mkdir -p /var/log/xray',
            'mkdir -p /usr/local/etc/xray',
            'mkdir -p /etc/hysteria',
            'touch /var/log/xray/access.log /var/log/xray/error.log',
            'chmod 640 /var/log/xray/access.log /var/log/xray/error.log || true',
            'echo "__prepared__=1"',
        ].join('\n');

        const result = await nodeSetup.execSSH(conn, `sh -lc ${JSON.stringify(prepareCmd)}`);
        const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
        if (!output.includes('__prepared__=1')) {
            throw new Error('Prepare-host marker missing in SSH output');
        }

        return {
            nodeId: String(node._id),
            nodeName: node.name,
            nodeType: node.type || 'hysteria',
            preparedPaths: [
                '/var/log/xray',
                '/usr/local/etc/xray',
                '/etc/hysteria',
            ],
            logFiles: [
                '/var/log/xray/access.log',
                '/var/log/xray/error.log',
            ],
        };
    });
}

module.exports = {
    runPreflight,
    runPrepareHost,
};
