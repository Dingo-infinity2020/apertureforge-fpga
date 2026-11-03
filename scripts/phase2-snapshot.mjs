// Freeze an experiment's source hashes; never replace an existing snapshot.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));const [out,...sources]=process.argv.slice(2);
if(!out||!sources.length)throw Error('Usage: node scripts/phase2-snapshot.mjs <existing-external-build> <repo-relative-source> ...');
const target=path.resolve(out),rootPath=path.resolve(root).toLowerCase();
if(target.toLowerCase()===rootPath || target.toLowerCase().startsWith(rootPath+path.sep))throw Error('External build required');
if(!fs.statSync(target).isDirectory())throw Error('Prepare build first');
const sha256={};for(const f of sources){
 const absolute=path.resolve(root,f);if(!absolute.toLowerCase().startsWith(rootPath+path.sep))throw Error('Source outside repo');
 sha256[f]=createHash('sha256').update(fs.readFileSync(absolute,'utf8').replaceAll('\r\n','\n')).digest('hex');
}
fs.writeFileSync(path.join(target,'source_snapshot.json'),JSON.stringify({schema:1,
 baseline_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 normalization:'UTF-8 text, CRLF converted to LF',source_sha256:sha256},null,2)+'\n',{flag:'wx'});
console.log('Frozen source snapshot at '+target);
