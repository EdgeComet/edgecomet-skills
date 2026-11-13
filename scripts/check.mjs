#!/usr/bin/env node
/**
 * Repository checks for the EdgeComet skills plugin. Node built-ins only: the plugin
 * folder is the repository root, and a package.json beside a lockfile there holds every
 * version of the plugin for a reviewer.
 *
 *   node scripts/check.mjs               run every check, exit 1 on any problem
 *   node scripts/check.mjs --references  print references.json (report keys and issue ids)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SKILLS_DIR = join(ROOT, 'skills');
export const GROUND_RULES_FILE = join(ROOT, 'shared', 'ground-rules.md');
export const START = '<!-- ground-rules:start -->';
export const END = '<!-- ground-rules:end -->';

const SPEC_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const METADATA_KEYS = new Set(['tools']);
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_COMPATIBILITY = 500;
const MAX_BODY_LINES = 500;

const LOCKFILES = new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb']);
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf']);

/** A report key is `<report>.<provider>` in snake case; these suffixes are file names instead. */
const REPORT_KEY = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const FILE_SUFFIXES = new Set(['json', 'md', 'txt', 'mjs', 'js', 'yml', 'yaml', 'html', 'xml', 'csv']);
const ISSUE_ID = /^(?:crawl|idx|canon|link|dict|content|tag|sd)-[a-z0-9*]+(?:-[a-z0-9*]+)*$/;

/**
 * Skills and docs name no customer site: every hostname must be one of these (or a
 * subdomain of one). The TLD list keeps file names such as SKILL.md out of the match.
 */
const TLDS = ['com', 'org', 'net', 'io', 'ai', 'dev', 'app', 'co', 'bet', 'pl', 'de', 'uk', 'fr', 'es', 'it', 'nl', 'ru', 'ua', 'info', 'biz', 'us', 'ca', 'au', 'eu', 'xyz', 'site', 'online', 'shop', 'store', 'tech', 'me', 'tv', 'cloud', 'page'];
const HOSTNAME = new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS.join('|')})\\b`, 'gi');
const ALLOWED_HOSTS = ['example.com', 'example.org', 'example.net', 'edgecomet.com', 'github.com', 'claude.ai', 'claude.com', 'anthropic.com', 'agentskills.io', 'schema.org', 'dataforseo.com', 'cal.com'];
/** Internal names that are not hostnames with a public TLD. */
const DENIED = [/(?<![\w-])localhost(?![\w-])/, /\b127\.0\.0\.1\b/, /\b0\.0\.0\.0\b/, /\bcloud2\b/, /\bwip2\b/, /trycloudflare/, /\.internal\b/];
const EMOJI = /\p{Extended_Pictographic}/u;

function read(path) {
    return readFileSync(path, 'utf8');
}

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, out);
        else out.push(path);
    }
    return out;
}

export function skillDirs() {
    return readdirSync(SKILLS_DIR).filter((name) => statSync(join(SKILLS_DIR, name)).isDirectory()).sort();
}

/** The block stamped between the two markers of every SKILL.md. */
export function groundRulesBlock() {
    return `${START}\n${read(GROUND_RULES_FILE).trimEnd()}\n${END}`;
}

/** Text with fenced code blocks, inline code and HTML comments removed. */
function prose(text) {
    return text
        .replace(/^```[\s\S]*?^```/gm, '')
        .replace(/`[^`\n]*`/g, '')
        .replace(/<!--|-->/g, '');
}

/** Every inline code span, fenced blocks excluded. */
function inlineCode(text) {
    const withoutFences = text.replace(/^```[\s\S]*?^```/gm, '');
    return [...withoutFences.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

function unquote(value) {
    const v = value.trim();
    if (v.startsWith('"') && v.endsWith('"')) return JSON.parse(v);
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    return v;
}

/**
 * The frontmatter is flat apart from the `metadata` map, so a line parser is enough.
 *
 * @returns {{ frontmatter: Record<string, any>, body: string, problems: string[] }}
 */
function parseSkill(text) {
    const problems = [];
    if (!text.startsWith('---\n')) return { frontmatter: {}, body: text, problems: ['does not start with a frontmatter block'] };
    const end = text.indexOf('\n---\n', 4);
    if (end === -1) return { frontmatter: {}, body: text, problems: ['the frontmatter block is not closed'] };

    const frontmatter = {};
    let map = null;
    for (const line of text.slice(4, end).split('\n')) {
        if (line.trim() === '') continue;
        const nested = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(.*)$/);
        if (nested && map) {
            frontmatter[map][nested[1]] = unquote(nested[2]);
            continue;
        }
        const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!top) {
            problems.push(`unparsable frontmatter line: ${line}`);
            continue;
        }
        if (top[2].trim() === '') {
            frontmatter[top[1]] = {};
            map = top[1];
        } else {
            frontmatter[top[1]] = unquote(top[2]);
            map = null;
        }
    }

    return { frontmatter, body: text.slice(end + 5), problems };
}

/** @returns {{ reportKeys: string[], issueIds: string[] }} */
export function references() {
    const reportKeys = new Set();
    const issueIds = new Set();
    for (const path of walk(SKILLS_DIR).filter((p) => p.endsWith('.md'))) {
        for (const code of inlineCode(read(path))) {
            if (REPORT_KEY.test(code) && !FILE_SUFFIXES.has(code.split('.')[1]) && !code.match(HOSTNAME)) reportKeys.add(code);
            if (ISSUE_ID.test(code)) issueIds.add(code);
        }
    }
    return { reportKeys: [...reportKeys].sort(), issueIds: [...issueIds].sort() };
}

export function referencesJson() {
    return `${JSON.stringify(references(), null, 2)}\n`;
}

function checkSkills(problems, tools) {
    const block = groundRulesBlock();

    for (const name of skillDirs()) {
        const file = join(SKILLS_DIR, name, 'SKILL.md');
        const where = relative(ROOT, file);
        if (!existsSync(file)) {
            problems.push(`${relative(ROOT, join(SKILLS_DIR, name))}: no SKILL.md`);
            continue;
        }

        const { frontmatter: fm, body, problems: parse } = parseSkill(read(file));
        parse.forEach((p) => problems.push(`${where}: ${p}`));

        for (const key of Object.keys(fm)) {
            if (!SPEC_KEYS.has(key)) problems.push(`${where}: frontmatter key "${key}" is not one of the Agent Skills spec keys`);
        }
        if (fm.name !== name) problems.push(`${where}: name "${fm.name}" differs from its folder "${name}"`);
        if (typeof fm.name === 'string' && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.name) || fm.name.length > MAX_NAME)) {
            problems.push(`${where}: name must be lowercase words joined by single hyphens, at most ${MAX_NAME} characters`);
        }
        if (typeof fm.description !== 'string' || fm.description.trim() === '') problems.push(`${where}: description is missing`);
        else if (fm.description.length > MAX_DESCRIPTION) problems.push(`${where}: description is ${fm.description.length} characters, over ${MAX_DESCRIPTION}`);
        if (typeof fm.compatibility === 'string' && fm.compatibility.length > MAX_COMPATIBILITY) {
            problems.push(`${where}: compatibility is over ${MAX_COMPATIBILITY} characters`);
        }
        if (fm.license !== 'MIT') problems.push(`${where}: license must be MIT`);

        const bodyLines = body.split('\n').length;
        if (bodyLines > MAX_BODY_LINES) problems.push(`${where}: body is ${bodyLines} lines, over ${MAX_BODY_LINES}; move detail to references/`);

        const start = body.indexOf(START);
        const end = body.indexOf(END);
        if (start === -1 || end === -1 || end < start) {
            problems.push(`${where}: ground-rules markers missing`);
        } else if (body.slice(start, end + END.length) !== block) {
            problems.push(`${where}: ground-rules block differs from shared/ground-rules.md (run node scripts/stamp-ground-rules.mjs)`);
        }
        const ownText = start === -1 || end === -1 ? body : body.slice(0, start) + body.slice(end + END.length);

        const metadata = typeof fm.metadata === 'object' && fm.metadata !== null ? fm.metadata : {};
        for (const key of Object.keys(metadata)) {
            if (!METADATA_KEYS.has(key)) problems.push(`${where}: metadata key "${key}" is not allowed; metadata carries only tools`);
        }
        const declared = typeof metadata.tools === 'string' ? metadata.tools.split(',').map((t) => t.trim()).filter(Boolean) : [];
        if (declared.length === 0) problems.push(`${where}: metadata.tools is empty`);

        const mentioned = new Set(inlineCode(ownText).filter((code) => tools.has(code)));
        for (const tool of declared) {
            if (!tools.has(tool)) problems.push(`${where}: metadata.tools names "${tool}", which is not in tools.json`);
            else if (!mentioned.has(tool)) problems.push(`${where}: metadata.tools names "${tool}", but the body never mentions it`);
        }
        for (const tool of mentioned) {
            if (!declared.includes(tool)) problems.push(`${where}: the body uses "${tool}", which metadata.tools does not declare`);
        }
    }
}

function checkFiles(problems) {
    const self = fileURLToPath(import.meta.url);

    for (const path of walk(ROOT)) {
        const where = relative(ROOT, path);
        const file = where.split('/').pop();
        if (LOCKFILES.has(file)) problems.push(`${where}: no package.json or lockfile may exist in the plugin`);
        if (BINARY_EXTENSIONS.has(extname(path).toLowerCase())) continue;

        const text = read(path);
        text.split('\n').forEach((line, i) => {
            if (EMOJI.test(line)) problems.push(`${where}:${i + 1}: emoji`);
        });

        if (path !== self) {
            for (const host of text.match(HOSTNAME) ?? []) {
                const h = host.toLowerCase();
                if (!ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`))) problems.push(`${where}: hostname "${host}" is not on the allowlist`);
            }
            for (const denied of DENIED) {
                const hit = text.match(denied);
                if (hit) problems.push(`${where}: contains the internal name "${hit[0]}"`);
            }
        }

        if (where.endsWith('.md')) {
            prose(text).split('\n').forEach((line, i) => {
                if (/^\s*[-|:\s]+$/.test(line)) return; // frontmatter fences, rules, table separators
                if (line.includes('--')) problems.push(`${where}:${i + 1}: double dash in prose; use a single dash`);
            });
        }
        if (where.endsWith('.json')) {
            const strings = [];
            JSON.parse(text, (_key, value) => {
                if (typeof value === 'string') strings.push(value);
                return value;
            });
            if (strings.some((s) => s.includes('--'))) problems.push(`${where}: double dash in a JSON string`);
        }
    }
}

function checkRelease(problems) {
    const { version } = JSON.parse(read(join(ROOT, '.claude-plugin', 'plugin.json')));
    if (!read(join(ROOT, 'CHANGELOG.md')).includes(`## ${version}`)) problems.push(`CHANGELOG.md: no "## ${version}" entry for the plugin.json version`);
}

function checkReferences(problems) {
    const file = join(ROOT, 'references.json');
    if (!existsSync(file) || read(file) !== referencesJson()) {
        problems.push('references.json differs from the skills (run node scripts/check.mjs --references > references.json, then copy it to cloud2 tests/Fixtures/skills/references.json)');
    }
}

function main() {
    if (process.argv.includes('--references')) {
        process.stdout.write(referencesJson());
        return;
    }

    const tools = new Set(JSON.parse(read(join(ROOT, 'tools.json'))).tools);
    const problems = [];
    checkSkills(problems, tools);
    checkFiles(problems);
    checkRelease(problems);
    checkReferences(problems);

    if (problems.length > 0) {
        console.error(problems.join('\n'));
        console.error(`\n${problems.length} problem(s)`);
        process.exit(1);
    }
    console.log(`OK: ${skillDirs().length} skills`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
