const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function slingPartPoses({width,height,sx,sy,scale},time){
  const p=clamp(time/.82,0,1),ease=1-(1-p)**2;
  return [
    {pivot:{x:72,y:73},bounds:{left:18,top:7,right:127,bottom:114},angle:-.78,side:-1},
    {pivot:{x:68,y:133},bounds:{left:53,top:104,right:89,bottom:160},angle:.65,side:1}
  ].map(part=>{
    if(p===1)return {landed:true};
    const {bounds:b,pivot:c,angle}=part,cos=Math.cos(angle),sin=Math.sin(angle);
    const corners=[[b.left,b.top],[b.right,b.top],[b.right,b.bottom],[b.left,b.bottom]].map(([x,y])=>({x:((x-c.x)*cos-(y-c.y)*sin)*scale,y:((x-c.x)*sin+(y-c.y)*cos)*scale}));
    const left=Math.min(...corners.map(v=>v.x)),right=Math.max(...corners.map(v=>v.x)),bottom=Math.max(...corners.map(v=>v.y));
    const start={x:sx+(c.x-72)*scale,y:sy+(c.y-48)*scale};
    const end={x:clamp(sx+part.side*62*scale,12-left,width-12-right),y:height-14-bottom};
    return {...part,x:start.x+(end.x-start.x)*ease,y:start.y+(end.y-start.y)*p*p-8*scale*4*p*(1-p),rotation:angle*ease,landed:p===1};
  });
}
