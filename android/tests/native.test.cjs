const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const script=fs.readFileSync(require('node:path').join(__dirname,'../assets/native.js'),'utf8');
const origin='https://nakama-car-web-production.up.railway.app';
function page(options={}) {
 const state={fetches:0,alerts:[]};
 const location={origin:options.origin||origin,href:origin+'/preventivi'};
 class FileReader {readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0x';this.onload();}}
 const window={};
 vm.runInNewContext(script,{window,location,URL,FileReader,alert:x=>state.alerts.push(x),fetch:async()=>{state.fetches++;if(options.fail)throw Error('offline');return {blob:async()=>({size:options.size||6})};}});
 return {window,location,state};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('installs only on production origin',()=>{assert.equal(page({origin:'https://other.test'}).window.open,undefined);});
test('normal links remain in the current app view',()=>{const p=page();assert.equal(p.window.open('/clienti'),null);assert.equal(p.location.href,origin+'/clienti');});
test('unsupported popup schemes never navigate',()=>{for(const url of ['javascript:alert(1)','file:///a','content://a','intent://a','blob:https://evil.test/id']){const p=page();p.window.open(url);assert.equal(p.location.href,origin+'/preventivi');}});
test('own blob becomes a native PDF save request',async()=>{const p=page();p.window.open('blob:'+origin+'/uuid');await settle();assert.equal(p.location.href,'nakama-download://pdf');assert.equal(p.window.__nakamaPendingPdf.data,'JVBERi0x');});
test('duplicate blob click is bounded',async()=>{const p=page();p.window.open('blob:'+origin+'/uuid');p.window.open('blob:'+origin+'/uuid');await settle();assert.equal(p.state.fetches,1);});
test('large PDFs fail safely and allow retry',async()=>{const p=page({size:16777217});p.window.open('blob:'+origin+'/uuid');await settle();assert.equal(p.window.__nakamaPdfBusy,false);assert.equal(p.window.__nakamaPendingPdf,undefined);assert.equal(p.state.alerts.length,1);});
test('failed fetch allows another attempt',async()=>{const p=page({fail:true});p.window.open('blob:'+origin+'/uuid');await settle();assert.equal(p.window.__nakamaPdfBusy,false);assert.equal(p.state.alerts.length,1);});
