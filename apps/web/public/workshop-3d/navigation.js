import * as THREE from 'three';
export const PARKING_WALL_Z=33;
export function removedParkingWall(w){return w.name==='Nuevo muro'&&Math.abs(w.y1-30)<.02&&Math.abs(w.y2-30)<.02&&Math.abs(w.x2-w.x1)>30}
export function parkedCenter(length){return PARKING_WALL_Z-.115-.55-(length/2+.15)}
export function route(j,destination){const V=(x,z)=>new THREE.Vector3(x,0,z);let p;
if(destination==='street')p=[V(j.x,j.z),V(j.x,25.1),V(7,25.1),V(3,28.4),V(-4,28.4),V(-4,39),V(-4,47)];
else if(destination==='bay')p=[V(j.x,j.z),V(20,25.1),V(16.05,24.5),V(16.05,19),V(11,19),V(10,18.6)];
else{p=[V(j.x,j.z)];if(j.slot===0)p.push(V(12.5,15.8),V(16.05,16.2));if(j.slot===1)p.push(V(j.x,j.z+2.3));if(j.slot===2)p.push(V(23.63,13.8),V(21.8,15.2),V(18.8,15.3),V(16.05,16));p.push(V(16.05,19),V(16.05,25),V((j.parkingX??(18+j.slot*2.65)),25.5),V((j.parkingX??(18+j.slot*2.65)),parkedCenter(j.car.L)));}
return new THREE.CatmullRomCurve3(p,false,'centripetal')}
function corners(cx,cz,a,l,w){const u=[Math.cos(a),Math.sin(a)],v=[-u[1],u[0]];return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[cx+u[0]*l*x/2+v[0]*w*z/2,cz+u[1]*l*x/2+v[1]*w*z/2])}
function overlap(a,b){for(const p of [a,b])for(let i=0;i<2;i++){const q=p[(i+1)%4],r=p[i],axis=[-(q[1]-r[1]),q[0]-r[0]],pa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),pb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false}return true}
export function collisionAt(walls,j,x,z,angle){const W=j.kind==='van'?2.05:1.8,H=j.kind==='van'?2.55:1.5,a=corners(x,z,angle,j.car.L+.3,W+.3);for(const w of walls){if(w.model||w.points||w.height<.5||w.base>=H+.1||removedParkingWall(w)||w.name==='Portón corredizo abierto')continue;const dx=w.x2-w.x1,dz=w.y2-w.y1,l=Math.hypot(dx,dz);const b=corners((w.x1+w.x2)/2,(w.y1+w.y2)/2,Math.atan2(dz,dx),l,w.thickness);if(overlap(a,b))return w.name}if(Math.max(...a.map(p=>p[0]))>=.15&&Math.min(...a.map(p=>p[0]))<=58.7&&Math.min(...a.map(p=>p[1]))<PARKING_WALL_Z+.115&&Math.max(...a.map(p=>p[1]))>PARKING_WALL_Z-.115)return 'Muro de división del parqueo';return null}
