const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, opts] of [['iphone', devices['iPhone 13']], ['tv', { viewport: { width: 1280, height: 720 } }]]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
    await p.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ body: 'window.Hls={isSupported:()=>false}' }));
    await p.goto('http://127.0.0.1:9200/');
    await p.fill('#pin', '1234'); await p.click('#login button');
    await p.waitForSelector('.tile'); await p.waitForTimeout(500);
    await p.screenshot({ path: '/tmp/claude-0/-home-claude/a7b866e4-8f02-5c15-b13b-f0dca246ac10/scratchpad/' + name + '-accueil.png' });
    if (name === 'tv') { await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowRight'); console.log('focus TV:', await p.evaluate(() => document.activeElement.textContent.trim().slice(0,40))); await p.screenshot({ path: '/tmp/claude-0/-home-claude/a7b866e4-8f02-5c15-b13b-f0dca246ac10/scratchpad/tv-focus.png' }); }
    await p.click('[data-tab=series]'); await p.click('.tile'); await p.waitForSelector('.ep');
    await p.screenshot({ path: '/tmp/claude-0/-home-claude/a7b866e4-8f02-5c15-b13b-f0dca246ac10/scratchpad/' + name + '-serie.png' });
    await p.click('#sclose');
    await p.click('[data-tab=movie]'); await p.click('.tile');
    await p.waitForTimeout(500); await p.click('#pfav');
    console.log(name, 'lecteur src:', await p.evaluate(() => document.querySelector('video').src), 'msg:', await p.textContent('#pmsg'));
    await p.click('#pclose'); await p.click('[data-tab=fav]');
    console.log(name, 'favoris:', await p.locator('.tile').count());
    await p.fill('#search', 'chaîne 1'); await p.waitForTimeout(400);
    console.log(name, 'recherche:', await p.locator('.tile').count());
  }
  console.log('erreurs:', errs);
  await b.close();
})();
