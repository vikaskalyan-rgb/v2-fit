import asyncio, re
from playwright.async_api import async_playwright
URL='http://localhost:4173'
fails=[]
def check(n, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ')+n, extra)
    if not ok: fails.append(n)
async def goto(pg, date):
    await pg.goto(f'{URL}/?simulate={date}T07:30'); await pg.wait_for_timeout(1500)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':430,'height':932},is_mobile=True,has_touch=True,reduced_motion='reduce')
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.get_by_text('I understand').click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('Start as Vikas').click(); await pg.get_by_text('Build my plan').click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button',name='Got it').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button',name='I’m Vikas').click(); await pg.wait_for_timeout(500)
        # normal week, Friday off by default
        await goto(pg,'2026-11-20')
        t=await pg.locator('main').inner_text()
        check('Friday is the day off', 'Day off' in t, t[:120].replace('\n',' | '))
        await goto(pg,'2026-11-21')
        check('Saturday carries Lower B', 'Lower B' in await pg.locator('main').inner_text())
        await goto(pg,'2026-11-22')
        check('Sunday carries Active recovery', 'Active recovery' in await pg.locator('main').inner_text())
        # Monday: skip, answer the Friday question
        await goto(pg,'2026-11-16')
        check('Monday is Upper A', 'Upper A' in await pg.locator('main').inner_text())
        await pg.get_by_test_id('skip-today').click(); await pg.wait_for_timeout(400)
        await pg.get_by_test_id('skip-reasons').get_by_role('button',name='Travelling').click(); await pg.wait_for_timeout(500)
        check('asked about Friday', await pg.get_by_test_id('off-ask').count()==1)
        txt=await pg.get_by_test_id('off-ask').inner_text()
        check('both outcomes described', 'Tue Upper A' in txt and 'dropped this week' in txt, txt.replace('\n',' | ')[:300])
        await pg.get_by_test_id('off-no').click(); await pg.wait_for_timeout(700)
        check('skipped card shows what moved', 'Tue Upper A' in await pg.get_by_test_id('moved-line').inner_text())
        d=await pg.evaluate("""async()=>{const db=await new Promise(r=>{const q=indexedDB.open('v2fit');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const q=db.transaction('days').objectStore('days').getAll();q.onsuccess=()=>r(q.result.filter(x=>x.skip))})}""")
        check('skip saved with the Friday answer', len(d)==1 and d[0]['skip'].get('useOff') is False, d)
        # the rest of the week follows
        await goto(pg,'2026-11-17'); check('Tuesday now Upper A', 'Upper A' in await pg.locator('main').inner_text())
        await goto(pg,'2026-11-18'); check('Wednesday now Lower A', 'Lower A' in await pg.locator('main').inner_text())
        await goto(pg,'2026-11-20'); check('Friday still off', 'Day off' in await pg.locator('main').inner_text())
        await goto(pg,'2026-11-21'); check('Saturday now Pull', 'Pull' in await pg.locator('main').inner_text())
        await goto(pg,'2026-11-22'); check('Sunday now Lower B', 'Lower B' in await pg.locator('main').inner_text())
        # undo restores the week
        await goto(pg,'2026-11-16')
        await pg.get_by_role('button',name='Undo').click(); await pg.wait_for_timeout(600)
        await goto(pg,'2026-11-17'); check('undo puts Tuesday back to Lower A', 'Lower A' in await pg.locator('main').inner_text())
        # Monday skip again, this time yes to Friday
        await goto(pg,'2026-11-16')
        await pg.get_by_test_id('skip-today').click(); await pg.wait_for_timeout(400)
        await pg.get_by_test_id('skip-reasons').get_by_role('button',name='Busy day').click(); await pg.wait_for_timeout(500)
        await pg.get_by_test_id('off-yes').click(); await pg.wait_for_timeout(700)
        await goto(pg,'2026-11-20'); t=await pg.locator('main').inner_text()
        check('yes: Friday trains Pull', 'Pull' in t and 'Day off' not in t, t[:100].replace('\n',' | '))
        await goto(pg,'2026-11-22'); check('yes: Sunday keeps Active recovery', 'Active recovery' in await pg.locator('main').inner_text())
        # settings control
        await pg.get_by_role('button',name='Settings',exact=True).click(); await pg.wait_for_timeout(900)
        await pg.get_by_role('tab',name='Profile').click() if await pg.get_by_role('tab',name='Profile').count() else None
        await pg.wait_for_timeout(400)
        sel=pg.get_by_test_id('off-day')
        check('settings has the weekly day off, Friday by default', await sel.count()==1 and await sel.input_value()=='fri', await sel.count())
        await sel.select_option('none'); await pg.wait_for_timeout(300)
        check('can change it to none', await sel.input_value()=='none')
        check('no page errors', not errs, errs)
        await b.close()
    print('FAILS:',fails)
asyncio.run(main())
