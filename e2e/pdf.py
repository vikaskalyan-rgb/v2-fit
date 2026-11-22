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
  for(let i=0;i<30;i++){const date=add(today,-i);
    tx.objectStore('days').put({id:'vikas'+date,person:'vikas',date,eaten:{breakfast:true,lunch:i%3!==0,dinner:true},swaps:{},water:2+(i%3)*0.5,steps:4000+i*180,extras:[{id:'x'+i,label:'snack',kcal:300,protein:10}],updatedAt:Date.now()})
    if(i%7===0) tx.objectStore('weights').put({id:'vikas'+date,person:'vikas',date,kg:70-i/10,updatedAt:Date.now()})
    if(i%2===0) tx.objectStore('sessions').put({id:'vikas'+date+'s',person:'vikas',date,key:'mon',title:'t',cycle:1,weekIndex:1,startedAt:1,finishedAt:3600000,sets:{s1:[{w:60,r:8,done:true}]},exOf:{s1:'bb-bench-press'},updatedAt:Date.now()})}
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
        await pg.get_by_role('radio',name='Health insights').click()
        check('sheet shows day choices', await pg.get_by_role('radio',name=re.compile('days$')).count()==6)
        await pg.get_by_role('radio',name='14 days').click()
        check('chip fills the number box', await pg.get_by_test_id('pdf-days').input_value()=='14')
        await pg.get_by_test_id('pdf-days').fill('21')
        check('custom 21 days on the button', await pg.get_by_role('button',name=re.compile('Download 21-day PDF')).count()==1)
        await pg.get_by_test_id('pdf-days').fill('0')
        check('0 days disables download', await pg.get_by_role('button',name=re.compile('day PDF')).is_disabled())
        await pg.get_by_test_id('pdf-days').fill('21')
        async with pg.expect_download(timeout=30000) as dl:
            await pg.get_by_role('button',name=re.compile('Download 21-day PDF')).click()
        d=await dl.value; path='/tmp/ins.pdf'; await d.save_as(path)
        check('file named as a PDF', d.suggested_filename.endswith('-21d.pdf'), d.suggested_filename)
        txt=subprocess.run(['pdftotext','-layout',path,'-'],capture_output=True,text=True).stdout
        info=subprocess.run(['pdfinfo',path],capture_output=True,text=True).stdout
        check('PDF has the header and name', 'Insights' in txt and 'Vikas' in txt)
        check('PDF says 21 days', '(21 days)' in txt)
        check('PDF has day-by-day log and chart caption', 'Day by day' in txt and 'Calories: eaten vs burnt' in txt)
        check('21 day rows', len(re.findall(r'\n\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? ',txt))>=21, len(re.findall(r'\n\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun) ',txt)))
        print(info.split('\n')[0:0], [l for l in info.split('\n') if 'Pages' in l])
        await pg.wait_for_timeout(900)
        check('sheet closed after download', await pg.get_by_test_id('pdf-days').count()==0)
        check('no page errors', not errs, errs)
        await b.close()
    print('FAILS:',fails)
asyncio.run(main())
