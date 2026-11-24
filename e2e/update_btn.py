import asyncio, re
from playwright.async_api import async_playwright
fails=[]
def check(n, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ')+n, extra)
    if not ok: fails.append(n)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':430,'height':932},is_mobile=True,has_touch=True,reduced_motion='reduce')
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:4173/'); await pg.wait_for_timeout(800)
        await pg.get_by_text('I understand').click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('Start as Vikas').click(); await pg.get_by_text('Build my plan').click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button',name='Got it').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button',name='I’m Vikas').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button',name='Settings',exact=True).click(); await pg.wait_for_timeout(700)
        btn=pg.get_by_role('button',name='Check for updates')
        await btn.scroll_into_view_if_needed()
        check('version shown', await pg.get_by_test_id('build-id').count()==1, await pg.get_by_test_id('build-id').inner_text())
        await btn.click(); await pg.wait_for_timeout(2500)
        t=await pg.locator('body').inner_text()
        check('gives feedback', 'latest version' in t or 'checked automatically' in t, [l for l in t.split('\n') if 'latest' in l or 'automatic' in l])
        check('app still alive', await pg.get_by_role('button',name='Check for updates').count()==1)
        await b.close()
    print('FAILS:',fails,errs)
asyncio.run(main())
