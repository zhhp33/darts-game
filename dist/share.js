// 3:4 share cards for the big moments: smashed board, new best, and the coffee ending.
const W=1080,H=1440,PANEL={x:60,y:180,w:960,h:800,r:36};
const SITE='https://darts.abitnicer.com/';
const FONT='-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
const COPY={
  smash:{head:'罗老师，别这样',hot:true,text:s=>`我在「弹弓飞镖」把靶盘打碎了：罗老师，别这样！总得分 ${s.score}。`},
  best:{head:'新纪录',hot:true,text:s=>`我在「弹弓飞镖」拿到 ${s.score} 分新纪录，投掷 ${s.shots} 次，命中 ${s.accuracy}。`},
  coffee:{head:'理解万岁',hot:true,text:()=>'我在「弹弓飞镖」抡起锤子把整个页面砸了个稀巴烂。'}
};

function loadImage(src){return new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=new URL(src,import.meta.url).href;});}
function roundRect(g,x,y,w,h,r){g.beginPath();g.roundRect?g.roundRect(x,y,w,h,r):g.rect(x,y,w,h);}

// Crop the live canvas around the board so the card frames it the same way on any screen size.
export function cropScene(canvas,view,cssWidth){
  const dpr=canvas.width/cssWidth,aspect=PANEL.w/PANEL.h;
  let h=view.radius*2.6,w=h*aspect;
  if(w>cssWidth){w=cssWidth;h=w/aspect;}
  const x=Math.max(0,Math.min(cssWidth-w,view.cx-w/2)),y=Math.max(0,Math.min(canvas.height/dpr-h,view.cy-h*.47));
  const out=document.createElement('canvas');out.width=PANEL.w;out.height=PANEL.h;
  out.getContext('2d').drawImage(canvas,x*dpr,y*dpr,w*dpr,h*dpr,0,0,PANEL.w,PANEL.h);
  return out;
}

async function drawCoffeePanel(g,board){
  const wash=g.createLinearGradient(PANEL.x,PANEL.y,PANEL.x+PANEL.w,PANEL.y+PANEL.h);wash.addColorStop(0,'#e3e5d9');wash.addColorStop(.55,'#d9dece');wash.addColorStop(1,'#c0cbb1');
  g.fillStyle=wash;g.fillRect(PANEL.x,PANEL.y,PANEL.w,PANEL.h);
  g.save();g.translate(PANEL.x+380,PANEL.y+390);g.rotate(-.14);g.shadowColor='#45503e52';g.shadowBlur=40;g.shadowOffsetX=18;g.shadowOffsetY=26;
  g.drawImage(board,-310,-310,620,620);g.restore();
  const coffee=await loadImage('./assets/coffee-paper.webp');
  if(coffee){g.save();g.shadowColor='#29321f40';g.shadowBlur=30;g.shadowOffsetY=14;g.drawImage(coffee,PANEL.x+600,PANEL.y+330,320,368);g.restore();}
}

export async function prepareShareCard(kind,{scene,board,score,shots,accuracy}){
  const copy=COPY[kind],card=document.createElement('canvas');card.width=W;card.height=H;
  const g=card.getContext('2d');
  g.fillStyle='#f4f1e8';g.fillRect(0,0,W,H);

  const mark=await loadImage('./assets/favicon.svg');
  if(mark){g.save();g.translate(98,98);g.rotate(-5*Math.PI/180);g.drawImage(mark,-38,-38,76,76);g.restore();}
  g.fillStyle='#343c34';g.font=`800 44px ${FONT}`;g.textBaseline='middle';g.fillText('弹弓飞镖',156,100);

  g.save();roundRect(g,PANEL.x,PANEL.y,PANEL.w,PANEL.h,PANEL.r);g.clip();
  if(kind==='coffee')await drawCoffeePanel(g,board);else g.drawImage(scene,PANEL.x,PANEL.y);
  g.restore();
  roundRect(g,PANEL.x+.5,PANEL.y+.5,PANEL.w-1,PANEL.h-1,PANEL.r);g.strokeStyle='#c9cebf';g.lineWidth=2;g.stroke();

  g.textBaseline='alphabetic';g.fillStyle='#89907d';g.font=`600 22px ${FONT}`;
  if('letterSpacing' in g)g.letterSpacing='5px';
  g.fillText('A LITTLE AIM. A LITTLE CHAOS.',66,1062);
  if('letterSpacing' in g)g.letterSpacing='0px';
  g.fillStyle=copy.hot?'#ac4329':'#343c34';g.font=`700 80px ${FONT}`;g.fillText(copy.head,62,1160);
  if(kind!=='coffee'){
    g.fillStyle='#3f4a38';g.font='150px Georgia,"Times New Roman",serif';g.fillText(String(score),58,1306);
    g.fillStyle='#747e68';g.font=`500 30px ${FONT}`;g.fillText(`总得分 · 投掷 ${shots} · 命中 ${accuracy}`,66,1384);
  }
  g.textAlign='right';g.fillStyle='#89907d';g.font=`600 26px ${FONT}`;g.fillText(SITE.replace(/^https:\/\/|\/$/g,''),W-62,1384);

  const blob=await new Promise(resolve=>card.toBlob(resolve,'image/png'));
  return {file:new File([blob],`darts-${kind}-${score}.png`,{type:'image/png'}),text:`${copy.text({score,shots,accuracy})}来试试 → ${SITE}`};
}

// Safari only shares inside the tap, so the card must already be prepared. Returns 'shared', 'cancelled', 'saved' or 'saved-image'.
export async function shareCard({file,text}){
  if(navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],text,title:'弹弓飞镖'});return 'shared';}
    catch(error){if(error.name==='AbortError')return 'cancelled';}
  }
  const url=URL.createObjectURL(file);
  Object.assign(document.createElement('a'),{href:url,download:file.name}).click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  try{await navigator.clipboard.writeText(text);}catch{return 'saved-image';}
  return 'saved';
}
