const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const ignored = new Set(["node_modules", "coverage"]);

const collectJavaScript = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
        if (ignored.has(entry.name)) return [];
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectJavaScript(fullPath);
        return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
    });

const files = collectJavaScript(root);
for (const file of files) {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
}

console.log(`Syntax OK: ${files.length} server JavaScript file(s).`);
