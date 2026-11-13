#!/usr/bin/env node
/**
 * Writes shared/ground-rules.md between the ground-rules markers of every SKILL.md.
 * Run it after editing the shared file; scripts/check.mjs fails while any copy differs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { END, groundRulesBlock, SKILLS_DIR, START, skillDirs } from './check.mjs';

const block = groundRulesBlock();
let changed = 0;

for (const name of skillDirs()) {
    const file = join(SKILLS_DIR, name, 'SKILL.md');
    const text = readFileSync(file, 'utf8');
    const start = text.indexOf(START);
    const end = text.indexOf(END);
    if (start === -1 || end === -1 || end < start) {
        console.error(`skills/${name}/SKILL.md: ground-rules markers missing`);
        process.exitCode = 1;
        continue;
    }

    const stamped = text.slice(0, start) + block + text.slice(end + END.length);
    if (stamped !== text) {
        writeFileSync(file, stamped);
        changed++;
    }
}

console.log(`Stamped ${changed} of ${skillDirs().length} skills`);
