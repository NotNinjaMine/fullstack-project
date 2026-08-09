'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const root = path.join(__dirname, '..', 'src');
const files = [];
const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
    }
};

walk(root);
let failed = 0;
for (const file of files) {
    try {
        parser.parse(fs.readFileSync(file, 'utf8'), {
            sourceType: 'module',
            plugins: ['jsx']
        });
    } catch (error) {
        failed += 1;
        console.error(`${path.relative(path.join(__dirname, '..'), file)}: ${error.message}`);
    }
}

if (failed) process.exit(1);
console.log(`Client syntax OK: ${files.length} JavaScript/JSX file(s).`);
