import assert from 'node:assert/strict';
export default async function(T){
 const p=await T.newPage({phone:true});await T.prepare(p);await T.boot(p,{ag2:true});await T.openChat(p,await T.longChat(p));
 const out={ok:false,checks:[],shots:[]};const shot=async n=>out.shots.push(await T.shot(p,'dock-'+n,{animations:'allow'}));
 for(const width of [360,390,600])for(const qr of [true,false])for(const multiline of [false,true]){
  await p.setViewportSize({width,height:844});
  await p.evaluate(qr=>{const e=document.querySelector('#qr-bar');if(qr)e.style.removeProperty('display');else e.style.setProperty('display','none','important');},qr);
  await p.locator('#send_textarea').fill(multiline?'中性草稿第一行\n第二行\n第三行\n第四行':'');await T.sleep(300);
  await p.evaluate(()=>{const c=document.querySelector('#chat');c.scrollTop=c.scrollHeight;c.dispatchEvent(new Event('scroll'));});await T.sleep(250);
  const f=await p.evaluate(()=>{const c=document.querySelector('#chat'),d=document.querySelector('#form_sheld'),m=c.querySelector('.mes.last_mes');return {dock:d.getBoundingClientRect(),chat:c.getBoundingClientRect(),last:m.getBoundingClientRect(),dockH:getComputedStyle(document.body).getPropertyValue('--ag2-dock-h'),padding:parseFloat(getComputedStyle(c).paddingBottom),mask:getComputedStyle(c).maskImage,delta:c.scrollHeight-c.clientHeight-c.scrollTop};});
  out.checks.push({width,qr,multiline,...f});assert.equal(f.delta,0);assert.ok(Math.abs(parseFloat(f.dockH)-f.dock.height)<1);assert.ok(f.last.bottom<=f.dock.top-24,'last message outside fade');assert.ok(Math.abs(f.padding-f.dock.height-36)<1);
  await p.evaluate(()=>{const c=document.querySelector('#chat');c.scrollTop-=1200;c.dispatchEvent(new Event('scroll'));});await p.waitForSelector('#ap-jump-latest.is-visible');await T.sleep(300);await shot(`w${width}-qr${qr}-multi${multiline}-history`);
  await p.locator('#ap-jump-latest').tap();await T.sleep(900);assert.ok(await p.locator('#chat').evaluate(c=>c.scrollHeight-c.clientHeight-c.scrollTop<2),'real jump reaches bottom');
  await shot(`w${width}-qr${qr}-multi${multiline}-bottom`);
 }
 await p.locator('#send_textarea').fill('');await p.locator('#ag2-ph-back').tap();await T.sleep(400);out.list=[];
 for(const width of [360,390,600]){
  await p.setViewportSize({width,height:844});await p.locator('.ag2-side-list').evaluate(e=>{e.scrollTop=e.scrollHeight;});
  const f=await p.evaluate(()=>{const l=document.querySelector('.ag2-side-list'),t=document.querySelector('#ag2-tabbar'),r=l.querySelector('.ag2-row:last-child');return {list:l.getBoundingClientRect(),bar:t.getBoundingClientRect(),last:r.getBoundingClientRect(),mask:getComputedStyle(l).maskImage,pad:getComputedStyle(l).paddingBottom};});out.list.push({width,...f});assert.equal(f.bar.height,64);assert.ok(f.last.bottom<=f.bar.top-16,'last row fully clear of tabbar/fade');await shot('list-bottom-'+width);
 }
 const cdp=await p.context().newCDPSession(p);await p.locator('.ag2-side-list').evaluate(e=>{e.scrollTop=0;});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:600}]});
 for(const y of [560,510,450,390]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});await T.sleep(35);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await T.sleep(350);
 out.trustedTouch=await p.locator('.ag2-side-list').evaluate(e=>e.scrollTop);assert.ok(out.trustedTouch>0);await shot('list-trusted-touch');
 out.ok=true;return out;
}
