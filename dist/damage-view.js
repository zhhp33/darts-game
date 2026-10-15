import {makeSurfaceCracks} from './fracture.js?v=varied-cracks-2';

// Fixed surface textures keep old marks without a growing list of canvas objects.
export function createDamageLayer(makeCanvas=()=>document.createElement('canvas')){
  let layer=makeCanvas(),count=0;layer.width=layer.height=0;
  function grow(width,height){
    width=Math.max(layer.width,Math.ceil(width));height=Math.max(layer.height,Math.ceil(height));
    if(width===layer.width&&height===layer.height)return;
    const next=makeCanvas();next.width=width;next.height=height;
    if(count)next.getContext('2d').drawImage(layer,0,0);
    layer=next;
  }
  return {
    add(stamp,{x,y,size,width,height}){grow(width,height);layer.getContext('2d').drawImage(stamp,x,y,size,size);count++;},
    paint(g,...args){if(count)g.drawImage(layer,...args);},
    clear(){layer.width=layer.height=0;count=0;},
    get count(){return count;}
  };
}

// Build one small stamp per strike, then bake it into its permanent surface.
export function createDamageStamp(seed,material='wall'){
  const stamp=document.createElement('canvas');stamp.width=stamp.height=128;
  const g=stamp.getContext('2d');g.translate(64,64);g.scale(44,44);g.lineCap='round';g.lineJoin='round';
  if(material==='wall'){
    for(const path of makeSurfaceCracks(seed)){
      g.beginPath();path.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));
      g.strokeStyle='#f5f1dcaa';g.lineWidth=.052;g.stroke();g.strokeStyle='#59634ccc';g.lineWidth=.024;g.stroke();
    }
    return stamp;
  }
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const edge=Array.from({length:18},(_,i)=>{const a=i/18*Math.PI*2,r=.31*(.82+rnd()*.34);return {x:Math.cos(a)*r,y:Math.sin(a)*r};});
  const trace=points=>{g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();};
  trace(edge);g.fillStyle='#80613e';g.fill();
  const core=edge.map((p,i)=>({x:p.x*(i%4===0?.86:.70)+.012,y:p.y*(i%5===0?.82:.69)+.025}));
  trace(core);g.fillStyle='#302b23';g.fill();
  for(const i of [0,3,8,12,15]){const j=(i+1)%edge.length;trace([edge[i],edge[j],core[j],core[i]]);g.fillStyle=i%2?'#dfbf85':'#b78f57';g.fill();}
  // Broken paint and exposed fibers keep a roughly circular footprint without a machined rim.
  for(let i=0;i<6;i++){
    const a=i/6*Math.PI*2+(rnd()-.5)*.35,p=edge[Math.floor(a/(Math.PI*2)*18+18)%18],length=.07+rnd()*.09;
    g.beginPath();g.moveTo(p.x*.79,p.y*.79);g.lineTo(p.x+Math.cos(a)*length,p.y+Math.sin(a)*length*.75);g.strokeStyle=i%2?'#e0c18a':'#8e693f';g.lineWidth=i%2?.025:.035;g.stroke();
  }
  g.save();trace(core);g.clip();
  for(const i of [2,7,13]){
    const p=core[i];g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x*.63,p.y*.7+.015);
    g.strokeStyle='#ae8d5a';g.lineWidth=.02;g.stroke();
  }
  g.restore();
  for(let i=0;i<3;i++){
    const x=.12+rnd()*.43,y=.30+rnd()*.4,s=.035+rnd()*.025;
    g.beginPath();g.moveTo(x-s,y);g.lineTo(x+s,y-s);g.lineTo(x+s*.7,y+s);g.closePath();g.fillStyle=i%2?'#9f7949':'#d1b17c';g.fill();
  }
  return stamp;
}
