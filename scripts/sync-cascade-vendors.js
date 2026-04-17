#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const vendorRoot = path.join(projectRoot, 'public', 'vendor', 'cascade');

const assets = [
    {
        from: path.join(projectRoot, 'node_modules', 'cytoscape', 'dist', 'cytoscape.min.js'),
        to: path.join(vendorRoot, 'cytoscape.min.js'),
    },
    {
        from: path.join(projectRoot, 'node_modules', 'dagre', 'dist', 'dagre.min.js'),
        to: path.join(vendorRoot, 'dagre.min.js'),
    },
    {
        from: path.join(projectRoot, 'node_modules', 'cytoscape-dagre', 'cytoscape-dagre.js'),
        to: path.join(vendorRoot, 'cytoscape-dagre.js'),
    },
    {
        from: path.join(projectRoot, 'node_modules', 'cytoscape-edgehandles', 'cytoscape-edgehandles.js'),
        to: path.join(vendorRoot, 'cytoscape-edgehandles.js'),
    },
];

fs.mkdirSync(vendorRoot, { recursive: true });

const copied = [];
for (const asset of assets) {
    if (!fs.existsSync(asset.from)) {
        console.error(`[cascade-vendor] Missing source: ${asset.from}`);
        process.exitCode = 1;
        continue;
    }
    fs.copyFileSync(asset.from, asset.to);
    copied.push(path.relative(projectRoot, asset.to));
}

if (process.exitCode) {
    process.exit(process.exitCode);
}

console.log(`[cascade-vendor] Synced ${copied.length} assets.`);
for (const filePath of copied) {
    console.log(`[cascade-vendor] - ${filePath}`);
}
