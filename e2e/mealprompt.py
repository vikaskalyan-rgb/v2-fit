import asyncio, re
from playwright.async_api import async_playwright
URL='http://localhost:4173'
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
        await pg.get_by_role('button',name='I’m Vikas').click(); await pg.wait_for_timeout(400)
        today=await pg.evaluate("new Date(Date.now()+330*60000).toISOString().slice(0,10)")
        await pg.goto(f'{URL}/?meal=breakfast&date={today}&p=vikas'); await pg.wait_for_timeout(1500)
        check('prompt opens from notification tap', await pg.get_by_test_id('meal-prompt').count()==1)
        check('url cleaned', 'meal=' not in pg.url, pg.url)
        await pg.screenshot(path='/home/claude/qa/97-prompt.png')
        await pg.get_by_test_id('meal-prompt').get_by_role('button',name='Ate it').click(); await pg.wait_for_timeout(600)
        row=await pg.evaluate("""async (id)=>{const db=await new Promise(r=>{const q=indexedDB.open('v2fit');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const g=db.transaction('days').objectStore('days').get(id);g.onsuccess=()=>r(g.result)})}""", f'vikas|{today}')
        check('breakfast logged as eaten', bool(row and row['eaten'].get('breakfast')), row)
        # message path (app open, Android "Ate it" action)
        await pg.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'v2fit-ate',slot:'lunch',date:'%s',person:'vikas'}}))"%today); await pg.wait_for_timeout(600)
        row=await pg.evaluate("""async (id)=>{const db=await new Promise(r=>{const q=indexedDB.open('v2fit');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const g=db.transaction('days').objectStore('days').get(id);g.onsuccess=()=>r(g.result)})}""", f'vikas|{today}')
        check('lunch logged via message', bool(row and row['eaten'].get('lunch')), row and row['eaten'])
        # junk params are ignored
        await pg.goto(f'{URL}/?meal=x&date=nope&p=bob'); await pg.wait_for_timeout(800)
        check('bad params ignored', await pg.get_by_test_id('meal-prompt').count()==0)
        check('no page errors', not errs, errs)
        await b.close()
    print('FAILS:',fails)
asyncio.run(main())
