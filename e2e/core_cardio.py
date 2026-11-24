import asyncio, re
from playwright.async_api import async_playwright
URL='http://localhost:4173/?simulate=2026-11-18T07:30'
fails=[]
def check(n, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ')+n, extra)
    if not ok: fails.append(n)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':430,'height':932},is_mobile=True,has_touch=True,reduced_motion='reduce')
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.get_by_text('I understand').click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('Start as Vikas').click(); await pg.get_by_text('Build my plan').click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button',name='Got it').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button',name='I’m Vikas').click(); await pg.wait_for_timeout(800)
        core=pg.get_by_test_id('core-card'); cardio=pg.get_by_test_id('cardio-card')
        check('core card on Today', await core.count()==1)
        check('cardio card shows 0 of 30', '0' in await cardio.inner_text() and 'of 30 min' in await cardio.inner_text(), await cardio.inner_text())
        # quick-add cardio
        await cardio.get_by_role('button',name='Start').click(); await pg.wait_for_timeout(400)
        await pg.get_by_role('button',name='+15 min').click(); await pg.wait_for_timeout(300)
        await pg.get_by_role('button',name='+15 min').click(); await pg.wait_for_timeout(300)
        await pg.get_by_role('button',name='Done',exact=True).click(); await pg.wait_for_timeout(700)
        t=await cardio.inner_text()
        check('cardio ring reads 30 and target reached', re.search(r'30\s*of 30 min',t) and 'Target reached' in t, t.replace('\n',' '))
        # abs session
        await core.get_by_role('button',name='Start').click(); await pg.wait_for_timeout(900)
        body=await pg.locator('body').inner_text()
        check('abs session opens on the first exercise', 'Hanging Knee Raise' in body and 'Core' in body, body[:200].replace('\n',' | '))
        check('no warm-up screen', 'Start lifting' not in body)
        await pg.screenshot(path='/home/claude/qa/core-1.png')
        st=await pg.evaluate("JSON.parse(localStorage.getItem('v2fit-store')).state.active.vikas")
        check('stored as core session', st['key']=='core' and st['phase']=='work', st and (st['key'],st['phase']))
        # mark every set done, reload, finish and save
        await pg.evaluate("""()=>{const k='v2fit-store',j=JSON.parse(localStorage.getItem(k)),a=j.state.active.vikas
          const ids=['0','1','2','3','4'], sets={ '0':12,'1':12,'2':10,'3':40,'4':30 }
          ids.forEach(i=>{a.sets[i]=Array.from({length:i==='4'?2:3},()=>({w:i==='1'?30:0,r:sets[i],done:true}))}); a.idx=4
          localStorage.setItem(k,JSON.stringify(j))}""")
        await pg.reload(); await pg.wait_for_timeout(1500)
        if await pg.get_by_role('button',name='Got it').count(): await pg.get_by_role('button',name='Got it').click(); await pg.wait_for_timeout(500)
        await pg.get_by_role('button',name=re.compile('Finish session')).click(); await pg.wait_for_timeout(600)
        body=await pg.locator('body').inner_text()
        check('goes straight to summary (no cool-down)', 'Summary' in body and 'Core & Abs' in body, body[:160].replace('\n',' | '))
        await pg.screenshot(path='/home/claude/qa/core-2.png')
        await pg.get_by_role('button',name=re.compile('Save session')).click(); await pg.wait_for_timeout(1200)
        check('core card shows Done', 'Done' in await core.inner_text(), await core.inner_text())
        body=await pg.locator('body').inner_text()
        check('main workout is not marked done by the abs session', 'Done today' not in body and 'Logged' not in body)
        check('streak still 0', bool(re.search(r'0\s*\n?\s*streak',body)) or 'streak' in body)
        n=await pg.evaluate("(async()=>{const q=indexedDB.open('v2fit');const db=await new Promise(r=>q.onsuccess=()=>r(q.result));return await new Promise(r=>{const g=db.transaction('sessions').objectStore('sessions').getAll();g.onsuccess=()=>r(g.result.map(x=>x.key))})})()")
        check('saved as one core log', n==['core'], n)
        await b.close()
    print('FAILS:',fails, errs)
asyncio.run(main())
