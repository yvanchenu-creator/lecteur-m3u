const {chromium}=require('playwright');const fs=require('fs');
const R='/home/user/lecteur-m3u/'; const svg=fs.readFileSync(R+'logo/blasto-tv-icone.svg','utf8');
const uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
(async()=>{const b=await chromium.launch();
async function shot(w,h,html,out){const p=await b.newPage({viewport:{width:w,height:h}});await p.setContent('<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap"><style>html,body{margin:0;background:transparent}</style></head><body>'+html+'</body></html>');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);await p.screenshot({path:out,omitBackground:true});await p.close();}
// Icône carrée pleine (iOS arrondit lui-même, donc fond sans coins arrondis)
const full=svg.replace('rx="112"','rx="0"'); const furi='data:image/svg+xml;base64,'+Buffer.from(full).toString('base64');
for(const n of [180,512]) await shot(n,n,`<img src="${furi}" width=${n} height=${n} style="display:block">`,R+`logo/blasto-tv-${n}.png`);
await shot(432,432,`<img src="${uri}" width=432 height=432 style="display:block">`,R+'android/app/src/main/res/drawable-nodpi/ic_launcher.png');
const nb='data:image/svg+xml;base64,'+Buffer.from(svg.replace('fill="url(#bg)"','fill="none"')).toString('base64');
const banner=(w,h)=>`<div style="width:${w}px;height:${h}px;background:radial-gradient(circle at 30% 40%,#1c1a17,#0b0b0d 70%);display:flex;align-items:center;justify-content:center;gap:${h*.06}px"><img src="${nb}" style="width:${h*.56}px;height:${h*.56}px"><span style="font-family:'Bebas Neue';font-size:${h*.25}px;letter-spacing:${h*.012}px;color:#fff;line-height:1;white-space:nowrap">BLASTO <span style="color:#f5b83d">TV</span></span></div>`;
await shot(640,360,banner(640,360),R+'android/app/src/main/res/drawable-nodpi/banner.png');
await shot(1200,400,banner(1200,400),R+'logo/blasto-tv-banniere.png');
await b.close();})();
