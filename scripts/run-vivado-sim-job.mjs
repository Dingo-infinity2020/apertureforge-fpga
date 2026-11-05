// Background execution of Vivado-generated simulation BATs. No hard timeout,
// no process termination and no alteration of generated simulator/model code.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const [mode,arg]=process.argv.slice(2),job=path.resolve(arg??'');
const allowed=path.resolve('D:/work/build/apertureforge-fpga'),relative=path.relative(allowed,job);
if(!arg||relative.startsWith('..')||path.isAbsolute(relative)||!relative.split(path.sep)[0].startsWith('cx-'))throw Error('Owned external cx- job required');
const spec=JSON.parse(fs.readFileSync(path.join(job,'job_spec.json'),'utf8'));
for(const p of [spec.script_dir,spec.marker]){const rel=path.relative(allowed,path.resolve(p));if(rel.startsWith('..')||path.isAbsolute(rel)||rel.split(path.sep)[0]!==relative.split(path.sep)[0])throw Error('Job path escapes owned build');}
const statusFile=path.join(job,'job_status.json');
if(mode==='--start'){
 if(fs.existsSync(statusFile)||fs.existsSync(spec.marker))throw Error('Job already started or marker exists');
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',job],{detached:true,stdio:'ignore',windowsHide:true});
 child.unref();console.log(JSON.stringify({worker_pid:child.pid,job_dir:job}));
}else if(mode==='--worker'){
 if(fs.existsSync(statusFile)||fs.existsSync(spec.marker))throw Error('Fresh worker required');
 const started=new Date().toISOString();let current={};
 function record(extra){current={...current,...extra,worker_pid:process.pid,started_utc:started,observed_utc:new Date().toISOString()};
  const temp=statusFile+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(current,null,2)+'\n');fs.renameSync(temp,statusFile);}
 try{
  record({status:'RUNNING',phase:'startup',verification_scope:spec.scope??'FUNCTIONAL_TEST'});
  for(const phase of ['compile','elaborate','simulate']){
   const bat=phase+'.bat';if(!fs.existsSync(path.join(spec.script_dir,bat)))throw Error('Missing '+bat);
   const out=fs.openSync(path.join(job,phase+'.stdout.txt'),'wx'),err=fs.openSync(path.join(job,phase+'.stderr.txt'),'wx');
   const child=spawn('cmd.exe',['/d','/c',bat],{cwd:spec.script_dir,windowsHide:true,
    env:{...process.env,...(spec.license_file?{XILINXD_LICENSE_FILE:spec.license_file}:{}),PATH:spec.vivado_bin+path.delimiter+process.env.PATH},stdio:['ignore',out,err]});
   record({phase,phase_pid:child.pid,phase_started_utc:new Date().toISOString()});
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
   fs.closeSync(out);fs.closeSync(err);if(code!==0)throw Error(phase+' exited '+code);
   // XSim may return zero even when it refused to start for lack of a tier.
   const transcript=fs.readFileSync(path.join(job,phase+'.stdout.txt'),'utf8')+'\n'+fs.readFileSync(path.join(job,phase+'.stderr.txt'),'utf8');
   const limit=transcript.match(/Number of instances in this design, (\d+), exceed maximum allowed (\d+)/);
   if(limit){record({failure_kind:'SIMULATOR_TIER_LIMIT',instances:Number(limit[1]),instance_limit:Number(limit[2])});throw Error('Simulator tier refused the design before simulation started');}
   const diagnostic=transcript.split(/\r?\n/).find(line=>/^(ERROR[: ]|Fatal:)/.test(line));
   if(diagnostic)throw Error(phase+' diagnostic: '+diagnostic);
  }
  const prefix=spec.scope==='INSTANCE_PROFILE_ONLY'?'PROFILE ':'PASS ';
  const marker=fs.readFileSync(spec.marker,'utf8').trim();if(!marker.startsWith(prefix))throw Error('Missing fresh '+prefix.trim()+' marker');
  const metrics=Object.fromEntries([...marker.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])]));
  for(const [key,value]of Object.entries(spec.expected))if(metrics[key]!==value)throw Error('Acceptance shape mismatch '+key);
  record({status:'COMPLETE',phase:'done',phase_pid:null,acceptance:marker,metrics});
 }catch(error){record({status:'FAILED',phase_pid:null,error:String(error)});process.exitCode=1;}
}else throw Error('Usage: --start|--worker owned-job-directory');
