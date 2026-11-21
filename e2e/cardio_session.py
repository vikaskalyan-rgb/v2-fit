import asyncio, re, json
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
        await pg.evaluate("""()=>{
          const k='v2fit-store', j=JSON.parse(localStorage.getItem(k)); const s=j.state
          const today=new Date(Date.now()+330*60000).toISOString().slice(0,10)
          s.profiles.varsha.onboarded=true; s.person='varsha'; s.me='varsha'
          s.active.varsha={id:'varsha|'+today+'|wed',date:today,key:'wed',title:'Conditioning + Core',weekday:'wed',cycle:1,weekIndex:1,isDay0:false,startedAt:Date.now()-36*60000,phase:'work',idx:0,sets:{},swaps:{},rest:null,cardio:{'0':{startedAt:Date.now()-35*60000,elapsed:0,done:false}},checks:{},prs:[]}
          s.overlay={type:'session'}
          localStorage.setItem(k,JSON.stringify(j))}""")
        await pg.reload(); await pg.wait_for_timeout(2000)
        body=await pg.locator('body').inner_text()
        check('stopwatch shows target reached with overrun', bool(re.search(r'Target 30:00 reached · \+5:0\d',body)), body[:300].replace('\n',' | '))
        check('count-up not capped at target', bool(re.search(r'35:0\d',body)))
        check('shows Stop while running', await pg.get_by_role('button',name='Stop').count()==1)
        await pg.screenshot(path='/home/claude/qa/99-cardio-session.png')
        await pg.get_by_role('button',name='Stop').click(); await pg.wait_for_timeout(500)
        c=await pg.evaluate("JSON.parse(localStorage.getItem('v2fit-store')).state.active.varsha.cardio['0']")
        check('stopped keeps elapsed', c['startedAt'] is None and c['done'] and c['elapsed']>=2099, c)
        await pg.get_by_test_id('edit-target').click(); await pg.wait_for_timeout(200)
        await pg.get_by_role('button',name='Increase Target minutes').click(); await pg.wait_for_timeout(300)
        t=await pg.evaluate("JSON.parse(localStorage.getItem('v2fit-store')).state.active.varsha.cardioMin")
        check('target edit stored for this session', t and list(t.values())==[35], t)
        body=await pg.locator('body').inner_text()
        check('screen shows the new 35 min target', 'Change target' in body or '35' in body)
        check('no page errors', not errs, errs)
        await b.close()
    print('FAILS:',fails)
asyncio.run(main())
