import * as THREE from 'three';
// Original procedural geometry and textures, built locally without external assets.
export function detailVehicle(car,kind,color,box,cylinder,mat){
 const {body,wheels,L}=car,van=kind==='van',W=van?2.05:1.8;
 const metal=mat('#bbc8cf',.85,.24),rubber=mat('#172025',.05,.88);
 const glass=new THREE.MeshPhysicalMaterial({color:'#528099',metalness:.2,roughness:.14,clearcoat:1,clearcoatRoughness:.08});
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.45,roughness:.28,clearcoat:1,clearcoatRoughness:.12});
 // Upgrade the existing body material without changing its footprint or proportions.
 for(const child of body.children)if(child.material?.color?.getHexString()===new THREE.Color(color).getHexString())child.material=paint;
 function line(points,c='#38515e',r=.009){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const m=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*4),r,5,false),mat(c,.25,.6));body.add(m);return m}
 for(const side of [-1,1]){
 const z=side*(W/2+.012);
 // Door outlines, handles, sill and side moulding.
 line([[-.95,.55,z],[-.95,.98,z],[-.83,van?1.94:1.45,z],[.08,van?2.1:1.48,z],[.25,1,z],[.25,.55,z]]);
 line([[.3,.55,z],[.3,1,z],[1.3,1,z],[1.48,.55,z]]);
 box(body,.0,.94,z+side*.018,.2,.04,.04,'#c4cdd0',.8,.25);
 box(body,.05,.48,z,L*.67,.055,.04,'#263c48');
 box(body,-1.15,1.08,side*(W/2+.13),.31,.16,.2,color,.5,.25);
 box(body,-1.15,1.09,side*(W/2+.235),.23,.11,.015,'#92b5c6',.8,.12);
 if(van){line([[.3,1.1,z],[.3,2.14,z],[2.25,2.14,z],[2.25,.65,z]],'#67808a');box(body,.7,1.18,z,.26,.04,.035,'#3a5361');box(body,1.1,1.37,z,.98,.65,.024,'#708e9c',.4,.22);}
 else {const win=box(body,-.28,1.29,side*.785,.55,.34,.025,'#528099');win.material=glass;const win2=box(body,.53,1.29,side*.785,.65,.34,.025,'#528099');win2.material=glass;}
 }
 // Wheel arches and richer tire/rim geometry. Wheels retain independent spin.
 car.steers=[];
 for(const wheel of wheels){const side=Math.sign(wheel.position.z);
 const tire=new THREE.Mesh(new THREE.TorusGeometry(.285,.085,10,32),rubber);tire.position.z=side*.125;wheel.add(tire);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.208,.018,6,24),metal);rim.position.z=side*.16;wheel.add(rim);
 for(let k=0;k<5;k++){const a=k*Math.PI*2/5;const bolt=new THREE.Mesh(new THREE.SphereGeometry(.017,6,4),metal);bolt.position.set(Math.sin(a)*.085,Math.cos(a)*.085,side*.18);wheel.add(bolt)}
 for(let k=0;k<20;k++){const a=k*Math.PI/10;const tread=new THREE.Mesh(new THREE.BoxGeometry(.023,.012,.15),mat('#344047',.05,.8));tread.position.set(Math.sin(a)*.361,Math.cos(a)*.361,0);tread.rotation.z=-a;wheel.add(tread)}
 const wx=wheel.position.x,wz=wheel.position.z;
 const arch=new THREE.Mesh(new THREE.TorusGeometry(.4,.035,6,24,Math.PI),mat(color,.4,.35));arch.position.set(wx,.38,wz+side*.09);body.add(arch);
 if(wx<0){const pivot=new THREE.Group();pivot.position.copy(wheel.position);body.remove(wheel);body.add(pivot);wheel.position.set(0,0,0);pivot.add(wheel);car.steers.push(pivot)}
 }
 box(body,-L/2-.065,.62,0,.025,.22,W*.52,'#172b36');
 for(let k=0;k<5;k++)box(body,-L/2-.085,.54+k*.045,0,.015,.014,W*.5,'#80949f',.7,.3);
 car.brakeMaterials=[];
 for(const side of [-1,1]){
 const lamp=box(body,-L/2-.065,.84,side*W*.32,.04,.13,.34,'#eff6fb');lamp.material=new THREE.MeshStandardMaterial({color:'#edf7ff',emissive:'#c5e9ff',emissiveIntensity:.6,roughness:.18});
 box(body,-L/2-.09,.77,side*W*.32,.02,.025,.32,'#f5fdff');
 const tail=box(body,L/2+.06,.83,side*W*.34,.035,.16,.25,'#a51227');tail.material=new THREE.MeshStandardMaterial({color:'#ad1d2e',emissive:'#e82535',emissiveIntensity:.3,roughness:.22});car.brakeMaterials.push(tail.material);
 }
 // Small wipers, aerial, fuel flap and rear window.
 line([[-.94,1.07,-.5],[-.91,1.38,-.3]],'#142b36',.012);line([[-.94,1.07,.2],[-.91,1.38,.4]],'#142b36',.012);
 if(!van){box(body,1.23,1.28,0,.065,.38,1.2,'#527a8b',.5,.15).rotation.z=.75;line([[.7,1.63,0],[.8,1.93,0]],'#263b45',.012);}else{line([[L/2+.06,1.03,0],[L/2+.06,2.22,0]],'#6e8693');box(body,L/2+.07,1.35,.15,.025,.035,.23,'#3c5260');}
 const plateCanvas=document.createElement('canvas');plateCanvas.width=512;plateCanvas.height=112;const ctx=plateCanvas.getContext('2d');
 const texture=new THREE.CanvasTexture(plateCanvas);texture.colorSpace=THREE.SRGBColorSpace;
 car.setPlate=text=>{ctx.fillStyle='#f2f3e9';ctx.fillRect(0,0,512,112);ctx.fillStyle='#17508b';ctx.fillRect(0,0,36,112);ctx.fillRect(476,0,36,112);ctx.fillStyle='#e8dc6a';ctx.font='22px sans-serif';ctx.fillText('★',8,29);ctx.fillStyle='white';ctx.font='bold 23px sans-serif';ctx.fillText('I',15,90);ctx.fillStyle='#152b38';ctx.font='bold 66px monospace';ctx.textAlign='center';ctx.fillText(String(text).slice(0,9),256,80);ctx.textAlign='left';texture.needsUpdate=true};car.setPlate('DEMO');
 for(const side of [-1,1]){const plate=new THREE.Mesh(new THREE.PlaneGeometry(.52,.115),new THREE.MeshStandardMaterial({map:texture,roughness:.5}));plate.rotation.y=side*Math.PI/2;plate.position.set(side*(L/2+.115),.64,0);body.add(plate)}
 return car;
}
export function workshopSurface(renderer,scene,materials){
 // Low-resolution procedural concrete and reflection environment, reused across meshes.
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');let seed=17;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 const pixels=ctx.createImageData(256,256);for(let i=0;i<pixels.data.length;i+=4){const v=220+rand()*22;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255}ctx.putImageData(pixels,0,0);const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(4,4);tex.colorSpace=THREE.SRGBColorSpace;
 for(const material of materials.values()){if(material.roughness>.6){material.map=tex;material.needsUpdate=true}}
 const sky=document.createElement('canvas');sky.width=512;sky.height=256;const g=sky.getContext('2d'),gradient=g.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#bdcfe0');gradient.addColorStop(.48,'#eef2f2');gradient.addColorStop(.52,'#9daaa9');gradient.addColorStop(1,'#5d6c70');g.fillStyle=gradient;g.fillRect(0,0,512,256);g.fillStyle='#ffffff';g.fillRect(40,65,90,16);g.fillRect(285,75,110,12);const env=new THREE.CanvasTexture(sky);env.mapping=THREE.EquirectangularReflectionMapping;env.colorSpace=THREE.SRGBColorSpace;const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(env);scene.environment=target.texture;scene.environmentIntensity=.4;env.dispose();pmrem.dispose();
}
