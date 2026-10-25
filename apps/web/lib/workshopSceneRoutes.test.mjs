import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../public/workshop-3d/',import.meta.url);
const source=(await readFile(new URL('navigation.js',base),'utf8')).replace("from 'three'",`from '${new URL('vendor/three.module.js',base).href}'`);
const {route,collisionAt}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const walls=JSON.parse(await readFile(new URL('model.json',base),'utf8')).walls;
const bays=[[10,14.76,0],[16.95,12.1,Math.PI/2],[23.63,12.2,Math.PI/2],[10,18.6,0]];
for(const slot of [0,1,2,3])for(const kind of slot===1?['car','van']:['car'])test(`bay ${slot} ${kind}: parking and return avoid walls`,()=>{
 const [x,z,initial]=bays[slot],L=kind==='van'?5.5:4.5;
 for(let index=0;index<(kind==='van'?8:9);index++){
  const j={x,z,slot,kind,car:{L},parkingX:8+index*2.65},curve=route(j,'parking');
  for(const reversed of [false,true]){let angle=reversed?Math.PI/2:initial;
   for(let n=0;n<=800;n++){const t=reversed?1-n/800:n/800,p=curve.getPointAt(t),tangent=curve.getTangentAt(t);const target=Math.atan2(tangent.z,tangent.x)+(reversed?Math.PI:0),delta=Math.atan2(Math.sin(target-angle),Math.cos(target-angle));angle+=delta*.14;
    assert.equal(collisionAt(walls,j,p.x,p.z,angle),null,`${kind} bay ${slot} parking ${index} reversed ${reversed} sample ${n}`);
   }
  }
 }
});
