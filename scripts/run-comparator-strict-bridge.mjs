#!/usr/bin/env node
// Interactive adapter for the authenticated Management tool on this task.
// It emits COMPLETE reviewed SQL transactions and consumes bounded receipts.
// Does not read .env, MCP OAuth tokens, DB passwords or service-role secrets.
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {runAtomicPlan} from './lib/comparator-strict-atomic.mjs';
import {CE1_REF} from './lib/comparator-strict-guard.mjs';
const plan=JSON.parse(await readFile(process.argv[2],'utf8'));
// macOS canonical TTY input truncates long JSON receipts. Raw input avoids that
// kernel line limit; readline still frames newline-delimited, bounded replies.
const previousRaw=process.stdin.isRaw;
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const lines=createInterface({input:process.stdin,terminal:false});
const iterator=lines[Symbol.asyncIterator]();let seq=0;
async function exchange(request){
  const id=++seq;process.stdout.write(JSON.stringify({...request,seq:id,projectRef:CE1_REF})+'\n');
  const line=await iterator.next();if(line.done)throw new Error('ce1_transport_closed_outcome_unknown');
  if(Buffer.byteLength(line.value)>32768)throw new Error('ce1_transport_reply_too_large');
  const reply=JSON.parse(line.value);if(reply.seq!==id)throw new Error('ce1_transport_sequence_mismatch');
  if(reply.ok!==true)throw new Error('ce1_transport_failed_outcome_unknown');return reply.value;
}
try{
  const result=await runAtomicPlan(plan,{
    inspectTarget:()=>exchange({kind:'inspect_target'}),
    query:sql=>exchange({kind:'sql',sha256:createHash('sha256').update(sql).digest('hex'),sql}),
  });
  process.stdout.write(JSON.stringify({kind:'completed',result})+'\n');
}catch(error){process.stdout.write(JSON.stringify({kind:'halted',error:error.code??error.message,automaticRetry:false})+'\n');process.exitCode=1;}
finally{lines.close();if(process.stdin.isTTY)process.stdin.setRawMode(Boolean(previousRaw));process.stdin.pause();}
