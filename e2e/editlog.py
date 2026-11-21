import asyncio, re, json
from playwright.async_api import async_playwright
URL='http://localhost:4173'
fails=[]
def check(n, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ')+n, extra)
    if not ok: fails.append(n)
SEED='''async ()=>{
  const today=new Date(Date.now()+330*60000).toISOString().slice(0,10)
  const row={id:'vikas'+today+'x',person:'vikas',date:today,key:({sat:'fri',sun:'sat'})[['sun','mon','tue','wed','thu','fri','sat'][new Date(Date.now()+330*60000).getUTCDay()]]||['sun','mon','tue','wed','thu','fri','sat'][new Date(Date.now()+330*60000).getUTCDay()],title:'Upper A',cycle:1,weekIndex:1,startedAt:1,finishedAt:2,volume:480,sets:{s1:[{w:60,r:8,done:true}],s2:[{w:20,r:10,done:true}]},exOf:{s1:'bb-bench-press',s2:'db-curl'},updatedAt:Date.now()}
  const db=await new Promise((res,rej)=>{const q=indexedDB.open('v2fit');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})
  await new Promise((res,rej)=>{const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(row);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
  return row.id
}'''
READ='''async (id)=>{const db=await new Promise(r=>{const q=indexedDB.open('v2fit');q.onsuccess=()=>r(q.result)});return await new Promise(r=>{const g=db.transaction('sessions').objectStore('sessions').get(id);g.onsuccess=()=>r(g.result)})}'''
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
        sid=await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(1500)
        # from Progress
        await pg.get_by_role('button',name='Progress',exact=True).click(); await pg.wait_for_timeout(1000)
        check('recent sessions listed', await pg.get_by_test_id('recent-sessions').count()==1)
        await pg.get_by_role('button',name=re.compile('^Edit Upper A')).first.click(); await pg.wait_for_timeout(800)
        check('editor opens', await pg.get_by_test_id('session-editor').count()==1)
        w=pg.get_by_label('Barbell Bench Press set 1 weight', exact=True) if False else pg.locator('input[aria-label$="set 1 weight"]').first
        await w.click(); await w.fill(''); await w.press_sequentially('62.5')
        check('decimal typed intact', await w.input_value()=='62.5', await w.input_value())
        await pg.get_by_role('button',name='Save changes').click(); await pg.wait_for_timeout(800)
        row=await pg.evaluate(READ, sid)
        check('decimal weight saved', row['sets']['s1'][0]['w']==62.5, row['sets']['s1'])
        check('volume updated by the difference', row['volume']==480+2.5*8, row['volume'])
        check('other sets untouched', row['sets']['s2'][0]['w']==20)
        # from Today
        await pg.get_by_role('button',name='Today',exact=True).click(); await pg.wait_for_timeout(800)
        check('edit button on Today when logged', await pg.get_by_role('button',name='Edit this workout').count()==1)
        await pg.get_by_role('button',name='Edit this workout').click(); await pg.wait_for_timeout(700)
        r=pg.locator('input[aria-label$="set 1 reps"]').first
        await r.click(); await r.fill('9'); 
        await pg.get_by_role('button',name=re.compile('Set 1 (done|not done)')).first.click()
        await pg.get_by_role('button',name='Save changes').click(); await pg.wait_for_timeout(700)
        row=await pg.evaluate(READ, sid)
        check('reps edit saved, undone set leaves volume', row['sets']['s1'][0]['r']==9 and row['sets']['s1'][0]['done'] is False and row['volume']==480+2.5*8-62.5*8, row['volume'])
        await pg.screenshot(path='/home/claude/qa/104-edit.png')
        check('no page errors', not errs, errs)
        await b.close()
    print('FAILS:',fails)
asyncio.run(main())
