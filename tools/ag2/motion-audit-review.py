from pathlib import Path
from PIL import Image, ImageDraw
import json, statistics, collections

ROOT=Path('/opt/server-agent/workspace/st-testdata/redesign/motion-audit/runtime')
index=[];summary={}
for f in sorted(ROOT.glob('*/result.json')):
    if 'attempt' in str(f): continue
    j=json.loads(f.read_text());index.extend(j.get('screenshots',[]));rows=[]
    for s in j['steps']:
        p=f.parent/(s['name']+'.trace.json')
        if not p.exists(): continue
        t=json.loads(p.read_text());frames=t['frames'];durations={};costs=[x['cost'] for x in frames]
        for x in frames:
            for a in x['animations']:
                k=str(a.get('target'))+':'+str(a.get('name'));durations[k]=a.get('timing',{}).get('duration')
        row={'name':s['name'],'samples':len(frames),'sampleCostMedianMs':statistics.median(costs) if costs else None,'sampleCostMaxMs':max(costs) if costs else None,'elapsedMs':t['final']['t']-frames[0]['t'],'animationDurationsMs':durations,'events':len(t['events']),'check':s.get('check')}
        rows.append(row)
    summary[j['id']]={'ok':j['ok'],'failures':j['failures'],'channels':j.get('channels'),'mockCalls':j.get('mockCalls'),'rows':rows}
(ROOT/'screenshot-index.json').write_text(json.dumps(index,indent=2,ensure_ascii=False))
(ROOT/'trace-summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False))
out=ROOT/'contact-sheets';out.mkdir(exist_ok=True)
def sheet(items,name,cols=3,cell=(320,300)):
    w,h=cell;im=Image.new('RGB',(w*cols,h*((len(items)+cols-1)//cols)),(235,235,235));d=ImageDraw.Draw(im)
    for i,(p,label) in enumerate(items):
        pic=Image.open(p).convert('RGB');pic.thumbnail((w-8,h-36));x=(i%cols)*w+(w-pic.width)//2;y=(i//cols)*h
        im.paste(pic,(x,y+32));d.text(((i%cols)*w+4,y+4),label[:48],fill=(0,0,0))
    im.save(out/(name+'.jpg'),quality=88)
scenes=['chat','settings-open-steady','settings-look-steady','settings-world-info-steady','inspector-open-steady','palette-open-steady','plus-menu-open-steady','native-popup-toast-steady','receipt-expand-steady']
for view in ['desktop','phone']:
    for scene in scenes:
        items=[(ROOT/f'{view}-{mode}'/(scene+'.png'),mode+' / '+scene) for mode in ['normal','os','st']]
        if all(p.exists() for p,_ in items):sheet(items,view+'-'+scene,cell=(320,720 if view=='phone' else 250))
    for start in range(0,len(scenes),3 if view=='phone' else 6):
        sel=scenes[start:start+(3 if view=='phone' else 6)]
        sheet([(ROOT/f'{view}-normal'/(s+'.png'),s) for s in sel],view+'-normal-overview-'+str(start),cell=(320,720 if view=='phone' else 250))
    for scene in ['settings-open','palette-open']:
        frames=sorted((ROOT/f'{view}-normal').glob(scene+'-film-*.png'))
        if frames:
            selected=[ROOT/f'{view}-normal'/(scene+'-initial.png'),frames[0],frames[len(frames)//2],frames[-1],ROOT/f'{view}-normal'/(scene+'-steady.png')]
            sheet([(p,p.stem) for p in selected],view+'-'+scene+'-film',cols=5,cell=(200,460 if view=='phone' else 180))
for m in ['normal','os','st']:
    p=ROOT/f'phone-{m}-repro'/'queue-real-escape-0-steady.png'
    if p.exists():sheet([(p,m+' first queue interrupted')],'phone-'+m+'-queue-failure',cols=1,cell=(390,880))
print(json.dumps({'screenshots':len(index),'runs':len(summary),'contactSheets':len(list(out.glob('*.jpg'))),'samples':sum(s['samples'] for r in summary.values() for s in r['rows'])}))
