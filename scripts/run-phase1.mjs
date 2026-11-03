import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const tests=fs.readdirSync(root+'tests').filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x).sort();
const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:root,encoding:'utf8',maxBuffer:4e6});
fs.writeFileSync(root+'reports/phase1-tests.tap',(result.stdout??'')+(result.stderr??''));
console.log(result.stdout);if(result.status!==0)throw Error('Phase one tests failed');
const sha=p=>createHash('sha256').update(fs.readFileSync(root+p)).digest('hex');
fs.writeFileSync(root+'reports/phase1-test-result.json',JSON.stringify({exit_code:result.status,
 tests:Number(result.stdout.match(/# tests (\d+)/)?.[1]),passed:Number(result.stdout.match(/# pass (\d+)/)?.[1]),
 failed:Number(result.stdout.match(/# fail (\d+)/)?.[1]),test_hashes:Object.fromEntries(tests.map(p=>[p,sha(p)]))},null,2)+'\n');
for(const script of ['capacity.mjs','transport-budget.mjs','generate-routes.mjs','simulate-corner-turn.mjs','phase1-extended.mjs','compare-phase1-buffers.mjs']){
 console.log('RUN '+script);const child=spawnSync(process.execPath,[path.join('scripts',script)],{cwd:root,stdio:'inherit'});
 if(child.status!==0)throw Error(script+' failed');
}
console.log('Offline phase-one evidence generated. Completion still requires requirement-by-requirement audit and decision report.');
