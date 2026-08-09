/**
 * Scope-aware "undefined variable" check for the React sources.
 *
 * Why this exists: merging three people's versions of the same page can leave a
 * handler referencing state that only existed in someone else's copy. Vite still
 * builds it (an unknown identifier is only an error when the line actually runs),
 * so the failure shows up as a dead button in the browser instead of a build
 * error. `editingDraftId` in Employee.jsx was exactly that.
 *
 * Uses the Babel parser/traverse that @vitejs/plugin-react already installs, so
 * no new dependency. Run with: npm run check:undefined
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverseModule = require('@babel/traverse');
const traverse = traverseModule.default || traverseModule;

const SRC = path.join(__dirname, '..', 'src');

// Globals a browser/React module may legitimately reference.
const KNOWN_GLOBALS = new Set([
    'window', 'document', 'console', 'navigator', 'location', 'history', 'screen',
    'fetch', 'Headers', 'Request', 'Response', 'AbortController', 'FormData',
    'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'Image', 'Audio',
    'localStorage', 'sessionStorage', 'globalThis', 'crypto', 'structuredClone',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
    'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'Intl',
    'Promise', 'Symbol', 'Proxy', 'Reflect', 'Map', 'Set', 'WeakMap', 'WeakSet',
    'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON',
    'RegExp', 'Error', 'TypeError', 'RangeError', 'Infinity', 'NaN', 'undefined',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
    'decodeURIComponent', 'encodeURI', 'decodeURI', 'atob', 'btoa',
    'process', 'module', 'require', 'exports', '__dirname', 'import',
    'HTMLElement', 'HTMLInputElement', 'Node', 'DOMParser', 'MutationObserver',
    'IntersectionObserver', 'ResizeObserver', 'BigInt', 'Uint8Array', 'ArrayBuffer'
]);

const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
};

let problems = 0;
for (const file of walk(SRC)) {
    const code = fs.readFileSync(file, 'utf8');
    let ast;
    try {
        ast = parser.parse(code, {
            sourceType: 'module',
            plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator']
        });
    } catch (err) {
        console.log(`PARSE ERROR  ${path.relative(SRC, file)}: ${err.message}`);
        problems++;
        continue;
    }

    traverse(ast, {
        Program(programPath) {
            // Babel records every reference it could not bind to a declaration.
            for (const name of Object.keys(programPath.scope.globals)) {
                if (KNOWN_GLOBALS.has(name)) continue;
                const node = programPath.scope.globals[name];
                const line = node.loc ? node.loc.start.line : '?';
                console.log(`UNDEFINED    ${path.relative(SRC, file)}:${line}  ${name}`);
                problems++;
            }
        }
    });
}

console.log(problems === 0
    ? '\nNo undefined identifiers found in client/src.'
    : `\n${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
