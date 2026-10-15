// Unequal physical fragments around the actual impact, rather than radial slices.
const TAU=Math.PI*2;
// A fragment is removed as soon as it reaches the floor.
export function fallingFragmentPose(shard,scene,time){
  const {radius:r,width,height,origin,rotation=0}=scene,c=shard.center,scale=r/180,cos=Math.cos(rotation),sin=Math.sin(rotation),gravity=height*1.5;
  const vx=(shard.vx*cos-shard.vy*sin)*scale,vy=(shard.vx*sin+shard.vy*cos)*scale,startX=origin.x+(c.x*cos-c.y*sin)*r,startY=origin.y+(c.x*sin+c.y*cos)*r;
  const floor=height*.89+c.y*r*.03,landTime=Math.max(0,(-vy+Math.sqrt(vy*vy+2*gravity*Math.max(0,floor-startY)))/gravity),t=Math.max(0,time);
  if(t>=landTime)return {landed:true};
  const angle=rotation+shard.spin*t,tilt=Math.max(.28,Math.abs(Math.cos(shard.tilt*t))),a=Math.cos(angle),b=Math.sin(angle);
  const vertices=shard.polygon.map(p=>{const dx=(p.x-c.x)*r*tilt,dy=(p.y-c.y)*r;return {x:dx*a-dy*b,y:dx*b+dy*a};});
  const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x)),minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
  let x=startX+vx*t,y=startY+vy*t+.5*gravity*t*t;
  x=Math.max(10-minX,Math.min(width-10-maxX,x));y=Math.max(10-minY,Math.min(height-12-maxY,y));
  return {x,y,rotation:angle,tilt,landed:false,polygon:vertices.map(p=>({x:x+p.x,y:y+p.y}))};
}
// Surface cracks grow out of the strike; wood follows its vertical grain.
export function makeSurfaceCracks(seed=1,material='wall'){
  const rnd=random(seed),paths=[],wood=material==='wood',pattern=(seed>>>0)%4,arms=wood?4:[7,4,8,5][pattern],turn=rnd()*TAU;
  for(let i=0;i<arms;i++){
    let angle=wood?(i%2?Math.PI/2:-Math.PI/2)+(rnd()-.5)*.3:turn+i/arms*TAU+(rnd()-.5)*.5;
    if(!wood&&pattern===1)angle=turn+(i%2?Math.PI:0)+(i<2?0:.6)+(rnd()-.5)*.2;
    if(!wood&&pattern===3)angle=turn+(i/(arms-1)-.5)*Math.PI*1.2+(rnd()-.5)*.25;
    const length=(.55+rnd()*.6)*(!wood&&pattern===1?(i<2?1.12:.58):1),path=[{x:0,y:0}];
    for(let j=1;j<=5;j++){
      const d=length*j/5,bend=(rnd()-.5)*(wood?.07:pattern===2?.25:.17);
      path.push({x:Math.cos(angle)*d-Math.sin(angle)*bend,y:Math.sin(angle)*d+Math.cos(angle)*bend});
    }
    paths.push(path);
    if(i%2===0){const p=path[2],branch=angle+(rnd()>.5?1:-1)*.65;paths.push([p,{x:p.x+Math.cos(branch)*length*.19,y:p.y+Math.sin(branch)*length*.19},{x:p.x+Math.cos(branch+.12)*length*.36,y:p.y+Math.sin(branch+.12)*length*.36}]);}
  }
  return paths;
}
function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
// Each impact owns its geometry. Later hits never resize an earlier fissure.
export function makeImpactCracks(hit,index){
  const stage=Math.min(3,index+1),rnd=random(1903+index*83),paths=[];
  const arms=stage===1?4:stage===2?5:6,growth=[1,2.6,5.2][stage-1];
  for(let arm=0;arm<arms;arm++){
    const angle=arm/arms*TAU+rnd()*(stage===1?.55:1.05)+index*.73;
    const length=(.065+rnd()*.08)*growth,vertices=[{x:hit.x,y:-hit.y}];
    const steps=stage===1?4:6;
    for(let step=1;step<=steps;step++){
      const distance=length*step/steps,drift=(rnd()-.5)*length*(stage===1?.18:.28);
      vertices.push({x:hit.x+Math.cos(angle)*distance-Math.sin(angle)*drift,y:-hit.y+Math.sin(angle)*distance+Math.cos(angle)*drift});
    }
    paths.push({vertices,lightWidth:[1.6,2.3,3.2][stage-1],darkWidth:[.75,1.1,1.6][stage-1]});
    if(stage>1&&arm%2===0){
      const p=vertices[2+arm%3],turn=angle+(arm%3===0?-.85:.7),branch=[p];
      for(let step=1;step<=3;step++){
        const d=length*.32*step/3,drift=(rnd()-.5)*length*.06;
        branch.push({x:p.x+Math.cos(turn)*d-Math.sin(turn)*drift,y:p.y+Math.sin(turn)*d+Math.cos(turn)*drift});
      }
      paths.push({vertices:branch,lightWidth:stage===2?1.5:2,darkWidth:stage===2?.65:.9});
    }
  }
  return paths;
}
function halfPlane(polygon,nx,ny,c){
  const out=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=a.x*nx+a.y*ny-c,db=b.x*nx+b.y*ny-c;
    if(da<=1e-9)out.push(a);
    if((da>0)!==(db>0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  return out;
}
export function makeFragments(impact,seed=73,count=26){
  const rnd=random(seed),seeds=[];
  seeds.push({x:impact.x,y:impact.y});
  for(let i=0;i<7;i++){
    const a=i/7*TAU+(rnd()-.5)*.45,d=.08+rnd()*.2;
    const x=impact.x+Math.cos(a)*d,y=impact.y+Math.sin(a)*d;
    if(Math.hypot(x,y)<.99)seeds.push({x,y});
  }
  while(seeds.length<count){const a=rnd()*TAU,d=Math.sqrt(rnd())*.97,x=Math.cos(a)*d,y=Math.sin(a)*d;if(seeds.every(s=>Math.hypot(x-s.x,y-s.y)>.13))seeds.push({x,y});}
  const border=Array.from({length:80},(_,i)=>({x:Math.cos(i/80*TAU),y:Math.sin(i/80*TAU)}));
  return seeds.map((s,i)=>{
    let polygon=border;
    for(let j=0;j<seeds.length&&polygon.length;j++){if(i===j)continue;const b=seeds[j];polygon=halfPlane(polygon,b.x-s.x,b.y-s.y,(b.x*b.x+b.y*b.y-s.x*s.x-s.y*s.y)/2);}
    const center=polygon.length?{x:polygon.reduce((n,p)=>n+p.x,0)/polygon.length,y:polygon.reduce((n,p)=>n+p.y,0)/polygon.length}:s;
    const dx=center.x-impact.x,dy=center.y-impact.y,d=Math.max(.06,Math.hypot(dx,dy));
    return {polygon,center,vx:dx/d*(75+rnd()*160),vy:dy/d*(70+rnd()*150)-90,spin:(rnd()-.5)*6,tilt:(rnd()-.5)*4,thickness:3+rnd()*4,red:Math.hypot(center.x,center.y)>.675};
  }).filter(s=>s.polygon.length>=3);
}
