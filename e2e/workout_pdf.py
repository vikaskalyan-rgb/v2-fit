import asyncio, re, subprocess
from playwright.async_api import async_playwright
URL='http://localhost:4173'
fails=[]
def check(n, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ')+n, extra)
    if not ok: fails.append(n)
SEED='''async ()=>{
  const today=new Date(Date.now()+330*60000).toISOString().slice(0,10)
  const add=(d,n)=>new Date(Date.parse(d)+n*864e5).toISOString().slice(0,10)
  const db=await new Promise((res,rej)=>{const q=indexedDB.open('v2fit');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})
  const tx=db.transaction(['days','weights','sessions'],'readwrite')
  const A=['bb-bench-press','incline-db-press','cable-fly','cable-triceps-pushdown','db-lateral-raise','seated-db-shoulder-press']
  const B=['lat-pulldown','seated-cable-row','face-pull','ez-bar-curl','hammer-curl','plank']
  const C=['back-squat','leg-press','bb-romanian-deadlift','lying-leg-curl','standing-calf-raise','cable-crunch']
  const sets=(k,i)=>Array.from({length:3+(i%2)},(_,j)=>({w:20+k*5+i+j*2.5,r:10-j,done:true}))
  for(let i=0;i<14;i++){const date=add(today,-i);
    tx.objectStore('days').put({id:'vikas'+date,person:'vikas',date,eaten:{breakfast:true},swaps:{},water:2,steps:5000,extras:[],updatedAt:Date.now()})
    if(i%7===0) tx.objectStore('weights').put({id:'vikas'+date,person:'vikas',date,kg:70-i/10,updatedAt:Date.now()})
    if(i%2===0 && i<13){const g=[A,B,C][(i/2)%3|0], key=['mon','tue','wed'][(i/2)%3|0]
      const s={},ex={}; g.forEach((e,k)=>{const id='x'+k; ex[id]=e; s[id]=e==='plank'?[{w:0,r:45,done:true},{w:0,r:40,done:true}]:sets(k,i)})
      tx.objectStore('sessions').put({id:'vikas'+date+'s',person:'vikas',date,key,title:['Upper A','Pull','Lower A'][(i/2)%3|0],cycle:1,weekIndex:1,startedAt:1000,finishedAt:1000+(50+i)*60000,sets:s,exOf:ex,updatedAt:Date.now()})}}
  await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
}'''
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':430,'height':932},is_mobile=True,has_touch=True,reduced_motion='reduce',accept_downloads=True)
        pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(800)
        await pg.get_by_text('I understand').click(); await pg.wait_for_timeout(300)
        await pg.get_by_text('Start as Vikas').click(); await pg.get_by_text('Build my plan').click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button',name='Got it').click(); await pg.wait_for_timeout(600)
        await pg.get_by_role('button',name='I’m Vikas').click(); await pg.wait_for_timeout(600)
        await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.get_by_role('button',name='Progress',exact=True).click(); await pg.wait_for_timeout(700)
        await pg.get_by_role('button',name=re.compile('^Insights')).click(); await pg.wait_for_timeout(1200)
        await pg.get_by_test_id('insights-pdf').click(); await pg.wait_for_timeout(500)
        check('workout report is the default', await pg.get_by_role('radio',name='Workout report').get_attribute('aria-checked')=='true')
        await pg.get_by_role('radio',name='14 days').click()
        async with pg.expect_download(timeout=60000) as dl:
            await pg.get_by_role('button',name=re.compile('Download 14-day workout report')).click()
        d=await dl.value; path='/tmp/wk.pdf'; await d.save_as(path)
        check('named as workouts pdf', d.suggested_filename.startswith('V2Fit-Workouts-'), d.suggested_filename)
        txt=subprocess.run(['pdftotext','-layout',path,'-'],capture_output=True,text=True).stdout
        info=subprocess.run(['pdfinfo',path],capture_output=True,text=True).stdout
        pages=int(re.search(r'Pages:\s+(\d+)',info).group(1))
        check('at most 5 pages', 1<=pages<=5, pages)
        check('has workout sections', 'MUSCLE ACTIVATION' in txt and 'WORKOUT LOG' in txt and 'MUSCLE BREAKDOWN' in txt)
        check('has exercises', 'Barbell Bench Press' in txt and 'Lat Pulldown' in txt)
        check('no food data', not re.search(r'protein|eaten', txt, re.I))
        print('pages',pages); await b.close()
        check('no page errors', not errs, errs)
    print('FAILS:',fails)
asyncio.run(main())
