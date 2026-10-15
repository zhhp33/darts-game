export const BREAKABLES=Object.freeze(['board','rope','sound','score','restart','replace','brand','power','sling']);
export function createMayhemState(){return {mode:'normal',damaged:[],scoreFrozen:false,soundBefore:true,boardStrikes:0,slingStrikes:0};}
export function ropeFallMode(state){return state.boardStrikes>=10?'shatter':'whole';}
export function strikeMayhem(state,target){
  if(state.mode!=='hammer')return {points:0,showPoints:false,first:false,complete:false};
  const showPoints=!state.scoreFrozen,points=showPoints?(target==='board'?80:['rope','sound','brand'].includes(target)?666:40):0;
  const first=BREAKABLES.includes(target)&&!state.damaged.includes(target);
  if(target==='board')state.boardStrikes++;
  if(target==='sling')state.slingStrikes++;
  if(first)state.damaged.push(target);
  if(target==='score')state.scoreFrozen=true;
  const complete=state.damaged.length===BREAKABLES.length&&state.slingStrikes>=2;
  if(complete)state.mode='ending';
  return {points,showPoints,first,complete};
}
