// Spawned exclusively by the isolated native PG17 integration suite.
import { pathToFileURL } from 'node:url';
process.once('message',async({config,modulePath,sql})=>{
  if(!/^ce1_test_[a-f0-9]{12}$/.test(config.database)
    || !(config.host==='localhost'||config.host==='127.0.0.1'||/^\/private\/tmp\/quefalta-ce105\.[a-zA-Z0-9]+$/.test(config.host))) process.exit(2);
  const pgModule=await import(pathToFileURL(modulePath).href);
  const {Client}=pgModule.default??pgModule;
  const c=new Client({...config,application_name:'ce1-crash-worker'});c.on('error',()=>{});
  try{await c.connect();process.send({state:'query-starting'});await c.query(sql);}
  catch { await c.query('ROLLBACK').catch(()=>{}); }
  finally {await c.end().catch(()=>{});process.exit(0);}
});
