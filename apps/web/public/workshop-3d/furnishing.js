import * as THREE from 'three';
// Furnishing is a separate layer: no wall, doorway or original equipment is moved.
export function furnishSpace(space,parent,box,cylinder){
 const {id,use}=space;
 const bounds={1:[.2,6.8,.2,5.6],2:[7.2,12.8,.2,5.6],3:[.2,6.8,6,8.3],4:[.2,6.8,8.7,11.8],5:[.2,3.1,12.2,14.8],6:[3.5,6.8,12.15,12.95],7:[3.5,6.8,13.3,14.8],8:[27.2,29.3,9.2,12.3],9:[29.7,31.8,9.2,12.3],10:[19.2,23.1,17.7,20.8],11:[23.5,26.9,17.7,20.8],12:[27.4,31.8,14.2,20.7],15:[29.38,31.8,12.65,13.7]};
 if(!bounds[id])return;
 // Preserve the original billiard table, sofa and reception furniture in this lounge.
 if(id===12&&use==='Sala de espera')return;
 const [x0,x1,z0,z1]=bounds[id],W=x1-x0,D=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;
 const b=(x,y,z,l,h,d,c)=>box(parent,x,y,z,l,h,d,c);
 function chair(x,z,angle=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;parent.add(g);box(g,0,.46,0,.46,.1,.46,'#263e4d');box(g,0,.8,.2,.46,.6,.08,'#263e4d');for(const a of [-.17,.17])for(const c of [-.17,.17])box(g,a,.22,c,.035,.44,.035,'#6e7b80')}
 function table(x,z,l=1.6,d=.7){b(x,.76,z,l,.07,d,'#b58f62');for(const a of [-1,1])for(const c of [-1,1])b(x+a*(l/2-.09),.36,z+c*(d/2-.09),.055,.72,.055,'#3c5260')}
 function desk(x,z,l=1.6){table(x,z,l);b(x,.99,z,.5,.33,.05,'#273d4c');b(x,.82,z+.2,.5,.025,.16,'#50626a');chair(x,z+.85);b(x+l/2-.22,.82,z+.1,.22,.035,.28,'#ede9d9')}
 function rack(x,z,l=1.5,d=.42,files=false){for(const a of [-1,1])b(x+a*(l/2-.035),1,z,.065,2,.065,'#344e5f');for(let h=.12;h<2;h+=.45){b(x,h,z,l,.045,d,'#7c8d91');for(let k=0;k<4;k++)b(x-l*.36+k*l*.24,h+.17,z,l*.18,.3,d*.8,files?['#304f68','#8c5048','#527d71','#bdb49e'][k]:'#b59a70')}}
 function cabinet(x,z,l=1){b(x,1,z,l,2,.4,'#b1bec1');b(x,1,z+.21,.025,1.9,.015,'#657e88');for(const a of [-.07,.07])b(x+a,1,z+.23,.025,.16,.025,'#263d4b')}
 function sofa(x,z,l=2){b(x,.32,z,l,.55,.75,'#695a50');b(x,.75,z-.32,l,.65,.16,'#746155');for(const a of [-1,1])b(x+a*(l/2-.09),.56,z,.18,.5,.8,'#746155');for(const a of [-.25,.25])b(x+a*l,.61,z,l*.43,.12,.58,'#897366')}
 if(id===1&&use==='Descanso del personal'){
 // Main entrance at x=0,z=2.5–3.5: keep the middle circulation strip clear.
 // Kitchen against the rear wall, with sink, hob, cupboards and refrigerator.
 b(2.35,.45,.65,3.2,.85,.65,'#d3dcd9');b(2.35,.91,.65,3.28,.07,.7,'#b4a084');
 for(let x=1.15;x<3.8;x+=.7){b(x,.46,1,.018,.76,.015,'#82989d');b(x+.16,.72,1.025,.2,.025,.025,'#405b67');}
 b(1.45,.955,.65,.6,.035,.43,'#8da9b1');b(1.45,.975,.65,.42,.02,.28,'#496c7b');cylinder(parent,1.45,1.12,.44,.025,.28,'#a7b9bd');
 b(3.1,.96,.65,.65,.035,.46,'#253f4c');for(const x of [2.94,3.25])for(const z of [.53,.77])cylinder(parent,x,.985,z,.085,.018,'#728c95');
 b(2.4,1.82,.4,2.8,.68,.4,'#d0d9d6');for(let x=1.2;x<3.8;x+=.7)b(x,1.82,.61,.018,.62,.015,'#718c96');
 b(4.3,1,.65,.7,1.95,.72,'#a4b4ba');b(4.3,1.45,1.02,.68,.025,.02,'#667f8a');b(4.52,1.25,1.04,.035,.5,.035,'#344f5c');
 // Small bathroom in the rear right corner. Existing perimeter is untouched.
 b(5,1.3,1.25,.1,2.6,2.3,'#d4d9dc');b(5.32,1.3,2.4,.64,2.6,.1,'#d4d9dc');b(6.63,1.3,2.4,.52,2.6,.1,'#d4d9dc');
 b(6,1.08,2.4,.78,2.16,.06,'#78949e');b(6,2.41,2.4,.82,.38,.1,'#d4d9dc');b(6.27,1.04,2.35,.035,.15,.03,'#d4dddd');
 b(6.24,.45,.53,.5,.75,.3,'#f0f2ee');cylinder(parent,6.24,.37,.91,.255,.33,'#e8ecea');b(6.24,.56,.9,.48,.045,.57,'#fffef6');
 b(5.45,.82,1.32,.48,.16,.4,'#edf0e8');b(5.45,.91,1.32,.3,.025,.24,'#8aa7b1');cylinder(parent,5.45,1,1.18,.02,.22,'#8fa6af');b(5.08,1.5,1.32,.03,.65,.42,'#b1cbd3');
 table(2.5,2.05,1.3,.65);chair(2.5,2.75);chair(3.65,2.05,Math.PI/2);
 // Entrance hall remains clear from the street door to the inner door.
 b(1, .025,3,1.1,.025,.8,'#70848b');sofa(2.85,5.05,1.8);
 return;
 }
 if(id===15&&use==='Oficina'){table(cx,z0+.23,1.2,.4);b(cx,.97,z0+.22,.42,.3,.04,'#273d4c');chair(cx,z1-.17);return;}
 if(use==='Oficina'){desk(cx,z0+.75,Math.min(1.8,W-.4));if(D>3)chair(cx,z0+2.4,Math.PI);if(W>4)cabinet(x1-.65,z0+.3,1);}
 else if(use==='Sala de reuniones'){const l=Math.min(2.6,W-1.1),d=Math.min(1,D-1.2);table(cx,cz,l,d);for(const a of [-.65,.65]){chair(cx+a,cz+d/2+.55);chair(cx+a,cz-d/2-.55,Math.PI)}b(cx,1.6,z0+.035,Math.min(1.7,W-.3),.9,.04,'#f0f2ed');}
 else if(use==='Almacén general'||use==='Almacén de repuestos'){rack(cx,z0+.28,Math.max(.7,W-.25),.45);if(D>2.4)rack(cx,z1-.28,Math.max(.7,W-.25),.45);}
 else if(use==='Archivo'){// Existing archive cabinet remains; add compact folders along the rear.
 rack(cx,z0+.18,Math.min(1.9,W-.3),Math.min(.28,D*.4),true);}
 else if(use==='Baño'){
 // Two separate WC cubicles in each existing bathroom; no perimeter changes.
 const rear=z1-.05,front=z1-1.35,stallW=1.05,start=x0+.12;
 for(let k=0;k<2;k++){
 const tx=start+stallW*(k+.5),tz=rear-.25;
 b(tx,.45,tz,.5,.75,.3,'#f0f2ee');cylinder(parent,tx,.37,tz-.36,.255,.33,'#e8ecea');b(tx,.56,tz-.32,.48,.045,.57,'#fffef6');
 b(start+k*stallW,1.05,(front+rear)/2,.045,2.1,rear-front,'#bdcbd0');
 b(tx,1.03,front,stallW-.07,2.06,.045,'#7595a0');b(tx+.33,1,front-.04,.035,.14,.025,'#d3dcdf');
 }
 b(start+2*stallW,1.05,(front+rear)/2,.045,2.1,rear-front,'#bdcbd0');
 const sinkX=x0+.55,sinkZ=z0+.36;
 b(sinkX,.8,sinkZ,.75,.16,.48,'#f1f2ef');b(sinkX,.89,sinkZ,.4,.035,.27,'#a7bfc5');cylinder(parent,sinkX,1,sinkZ-.16,.025,.25,'#899da5');b(sinkX,1.5,z0+.03,.65,.7,.035,'#a8c2cf');
 if(id===11){const sx=x1-.65,sz=z1-.65;
 b(sx,.09,sz,1.1,.12,1.1,'#e9eeec');b(sx,.16,sz,.08,.015,.08,'#627d86');
 const glass=new THREE.MeshStandardMaterial({color:'#a9dce6',transparent:true,opacity:.32,roughness:.15,metalness:.05,side:THREE.DoubleSide,depthWrite:false});
 for(const [gx,gz,l,d] of [[sx-.55,sz,.035,1.1],[sx,sz-.55,1.1,.035]]){const panel=b(gx,1.12,gz,l,2,d,'#a9dce6');panel.material=glass;}
 cylinder(parent,sx,1.35,z1-.06,.025,1.25,'#8fa8b3');b(sx,1.98,z1-.22,.28,.045,.3,'#aebfc4');b(sx,.95,z1-.07,.24,.06,.1,'#8197a3');
 }
 }
 else if(use==='Sala de espera'){sofa(cx,z0+.55,Math.min(2.6,W-.5));table(cx,cz+.2,1.1,.55);if(W>4){chair(x0+.8,z1-.7);chair(x1-.8,z1-.7)}b(cx,1.5,z0+.025,1.1,.65,.04,'#233e52');}
 else if(use==='Recepción'){table(cx,z0+.6,Math.min(2,W-.3),.65);b(cx,.45,z0+.6,Math.min(2,W-.3),.65,.06,'#284d61');b(cx,.99,z0+.6,.45,.35,.05,'#263e4b');chair(cx,z0+1.35);}
 else if(use==='Descanso del personal'){table(cx,cz,Math.min(1.5,W-.6),.65);chair(cx,cz+.65);chair(cx,cz-.65,Math.PI);cabinet(x1-.45,z0+.25,.65);}
 else if(use==='Limpieza'){cabinet(cx,z0+.25,Math.min(1,W-.2));cylinder(parent,cx,.3,z1-.3,.18,.55,'#3f8295');}
 else if(use==='Cuarto técnico'){// Preserve the original compressor; add a wall control panel.
 b(x0+.45,1.45,z0+.08,.55,.7,.16,'#8fa4aa');for(const a of [-.12,.12])b(x0+.45+a,1.5,z0+.17,.07,.07,.025,a<0?'#d65d4c':'#4b9c72');}
}
