import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const sha='e2b9842edef525b2e72f040c9f64fa99dbe0f2c2';
const root=path.resolve('artifacts/legacy-e2b9842');
const names=execFileSync('git',['ls-tree','-r','--name-only',sha,'--','server/src','server/migrations','package.json'],{encoding:'utf8'}).trim().split('\n');
if(!names.includes('server/src/app.ts'))throw new Error('Legacy commit unavailable. Clone Git history (CI fetch-depth: 0).');
for(const name of names){const target=path.join(root,name);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,execFileSync('git',['show',`${sha}:${name}`]));}
writeFileSync(path.join(root,'baseline.json'),JSON.stringify({sha,files:names},null,2));
