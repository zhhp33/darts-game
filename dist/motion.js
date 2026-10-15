import {clamp,CONFIG} from './physics.js?v=swing-six-hits-2';

export const SWING = Object.freeze({amplitudes:[0,6,14,28],period:2,manualMinCycles:3,manualDamping:.25,dragThreshold:8,flickSpeed:4,flickDistance:.15});
const omega=2*Math.PI/SWING.period,damping=SWING.manualDamping;
export function createBoardMotion(tier=0,time=0){return {tier,started:time,manualAt:time,offset:0,velocity:0,dragAngle:null,settle:null};}
export function sampleMotion(m,time){
  if(m.settle){const t=clamp((time-m.settle.at)/.32,0,1),ease=1-(1-t)**3;return {angle:m.settle.angle*(1-ease),velocity:0};}
  if(m.dragAngle!==null)return {angle:m.dragAngle,velocity:0};
  const age=Math.max(0,time-m.started),amplitude=SWING.amplitudes[m.tier]*Math.PI/180;
  const t=Math.max(0,time-m.manualAt),wd=Math.sqrt(omega*omega-damping*damping),a=m.offset,b=(m.velocity+damping*a)/wd;
  const decay=Math.exp(-damping*t),wave=a*Math.cos(wd*t)+b*Math.sin(wd*t);
  const angle=amplitude*Math.sin(omega*age)+decay*wave;
  const velocity=amplitude*omega*Math.cos(omega*age)+decay*((b*wd-damping*a)*Math.cos(wd*t)-(a*wd+damping*b)*Math.sin(wd*t));
  return {angle:clamp(angle,-Math.PI/3,Math.PI/3),velocity};
}
export function releaseBoard(m,angle,velocity,time){
  m.dragAngle=null;m.manualAt=time;m.offset=0;m.velocity=0;
  const base=sampleMotion(m,time);m.offset=angle-base.angle;m.velocity=velocity-base.velocity;
}
export function boardPose(m,view,time){
  const {angle,velocity}=sampleMotion(m,time),length=view.radius+40,pivot={x:view.cx,y:view.cy-length};
  return {x:pivot.x+Math.sin(angle)*length,y:pivot.y+Math.cos(angle)*length,rotation:-angle,angle,velocity,pivot};
}
export function poseInWorld(pose,view,active=true){return {x:(pose.x-view.cx)/view.radius,y:CONFIG.boardY-(pose.y-view.cy)/view.radius,rotation:pose.rotation,active};}
export function localPoint(point,pose,radius){
  const dx=point.x-pose.x,dy=point.y-pose.y,c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);
  return {x:(dx*c+dy*s)/radius,y:(-dx*s+dy*c)/radius};
}
export function shouldFling(distance,speed,diameter){return distance>=diameter*SWING.flickDistance&&Math.abs(speed)>=diameter*SWING.flickSpeed;}
export function motionIsActive(m,time){
  if(m.settle)return time-m.settle.at<.32;
  if(m.dragAngle!==null||m.tier>0)return true;
  const wd=Math.sqrt(omega*omega-damping*damping),envelope=Math.hypot(m.offset,(m.velocity+damping*m.offset)/wd),elapsed=Math.max(0,time-m.manualAt);
  return envelope>0&&(elapsed<SWING.manualMinCycles*SWING.period||envelope*Math.exp(-damping*elapsed)>.001);
}
export function advanceSwingTier(state,kind){state.swingTier=kind==='escape'?0:((state.swingTier||0)+1)%4;return state.swingTier;}
