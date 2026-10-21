// Extrae todos los bloques de receta de la planilla: nombre, materia prima, rinde, MOD, GIF.
const X=require('xlsx');const fs=require('fs');
const wb=X.read(fs.readFileSync('' + (process.argv[2] || 'PLANILLA COSTOS (1).xlsx') + ''));
const num=v=>typeof v==='number'&&isFinite(v)?v:null;
const txt=v=>String(v??'').trim();
const bloques=[];
for(const hoja of wb.SheetNames){const r=X.utils.sheet_to_json(wb.Sheets[hoja],{header:1,defval:'',raw:true});
 for(let i=0;i<r.length;i++){const f=r[i]||[];for(let c=0;c<f.length;c++){
  if(txt(f[c+4])!=='RECETA'||!txt(f[c]))continue;
  const b={hoja,fila:i+1,nombre:txt(f[c]),mp:null,rinde:null,mpUnit:null,mod:null,gif:null,etiquetaRinde:null};
  for(let k=i+1;k<Math.min(i+40,r.length);k++){const g=r[k]||[];
   if(k>i+1&&txt(g[c+4])==='RECETA')break;
   const lab=txt(g[c+5]).toUpperCase();
   if(lab==='TOTAL'&&b.mp==null){b.mp=num(g[c+8])??num(g[c+7])??num(g[c+6]);}
   else if(lab.startsWith('TOTAL')&&b.mp!=null&&b.rinde==null&&!lab.includes('COSTO')){
     const nums=[g[c+6],g[c+7],g[c+8]].map(num).filter(x=>x!=null);
     if(nums.length>=2){b.rinde=nums[0];b.mpUnit=nums[nums.length-1];b.etiquetaRinde=txt(g[c+5]);}
   }
   if(txt(g[c+4])==='Mano de obra'&&b.mod==null){const h=r[k+1]||[];b.mod=num(h[c+8]);}
   if(txt(g[c+4])==='G.I.F.'&&b.gif==null){const h=r[k+1]||[];b.gif=num(h[c+8]);}
   // bloques con MOD en columnas desplazadas (ej. FOCACCIAS) no se cubren
  }
  if(b.mp!=null)bloques.push(b);
 }}}
for(const b of bloques){const u=b.rinde&&b.rinde>0?b.rinde:1;b.mpUnitCalc=b.mpUnit??b.mp/u;b.totalUnit=(b.mp+(b.mod||0)+(b.gif||0))/u;}
fs.writeFileSync(__dirname + '/bloques.json',JSON.stringify(bloques,null,1));
console.log('bloques',bloques.length);
const porHoja={};for(const b of bloques)porHoja[b.hoja]=(porHoja[b.hoja]||0)+1;console.log(porHoja);
for(const b of bloques.filter(b=>['CAFETERIA','FRIAS','BOLLERÍA','GALLETAS, BROWNIES','PASTELERIA','TORTAS ','SALADOS '].includes(b.hoja)))
 console.log([b.hoja.trim().slice(0,10),b.nombre.slice(0,34),Math.round(b.mp),b.etiquetaRinde??'-',b.rinde??1,Math.round(b.mpUnitCalc),'MO+GIF/u:',Math.round(((b.mod||0)+(b.gif||0))/(b.rinde||1)),'total/u:',Math.round(b.totalUnit)].join(' | '));
