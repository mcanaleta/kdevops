#!/usr/bin/env node

const path = require('path');
const { cwd } = require('process');
const parentDir = path.join(__dirname, '..');

const spawn = require('child_process').spawn;

console.log(`Running swc-node in ${parentDir}`);
const child = spawn('node',
    ['-r', '@swc-node/register', './src/index.ts', ...process.argv.slice(2)],
    {
        env: {
            ...process.env,
            SWCRC: true,
            PROJECT_DIR: process.env.PROJECT_DIR ?? cwd()
        },
        cwd: parentDir,
    });

child.stderr.on('data', (data) => {
    process.stderr.write(data);
});

child.stdout.on('data', (data) => {
    process.stdout.write(data);
});


child.on('exit', (code) => {
    process.exit(code);
});

child.on('close', (code) => {
    process.exit(code);
});