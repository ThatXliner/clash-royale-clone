from PIL import Image
from pathlib import Path
import json, hashlib
root=Path(__file__).parent
src=json.loads((root/'plate-causal-control.json').read_text())
out={"candidateHead":src["candidateHead"],"candidateTree":src["candidateTree"],"geometry":src["fixtureGeometry"],"method":"Pillow RGB pixel comparisons on fresh native-size Chromium stage PNGs. For each sprite state, painted coverage is the pixel set changed by plate-on relative to same sprite state with plate-off; this counts exact color, antialiasing, border, and in-crop shadow. Exact color is exact RGB equality to CSS team color.","cases":[]}
for c in src['captures']:
    size=c['geometry']['stage'][2]
    side=c['key'].split('-')[-2]
    css=("c6452e" if side=='north' else "2e7f86")
    target=tuple(bytes.fromhex(css))
    loaded={}
    for state,info in c['files'].items():
        p=root/info['path']
        im=Image.open(p).convert('RGB')
        loaded[state]=im
    expected=(int(c['geometry']['stage'][2]),int(c['geometry']['stage'][3]))
    assert all(im.size==expected for im in loaded.values()), (c['key'], expected, {k:v.size for k,v in loaded.items()})
    def changed(a,b):
        ap=list(a.getdata());bp=list(b.getdata())
        return {i for i,(x,y) in enumerate(zip(ap,bp)) if x!=y}
    def exact(im):return {i for i,p in enumerate(im.getdata()) if p==target}
    def color_influence(on,off):
        # A changed pixel qualifies when the observed RGB delta is within 2.5
        # RGB units of a composite along the CSS team-color-to-baseline vector.
        # This counts exact fill plus antialiased/composited fill pixels.
        mask=set(); op=list(on.getdata()); bp=list(off.getdata())
        for i,(o,b) in enumerate(zip(op,bp)):
            v=[o[j]-b[j] for j in range(3)]; t=[target[j]-b[j] for j in range(3)]
            tt=sum(q*q for q in t)
            if not tt: continue
            ratio=sum(v[j]*t[j] for j in range(3))/tt
            residual=sum((v[j]-ratio*t[j])**2 for j in range(3))**0.5
            if 0.001 < ratio <= 1.01 and residual <= 2.5: mask.add(i)
        return mask
    unobsc=changed(loaded['asset-hidden-plate-on'],loaded['asset-hidden-plate-off'])
    visible=changed(loaded['asset-visible-plate-on'],loaded['asset-visible-plate-off'])
    un_exact=exact(loaded['asset-hidden-plate-on']) & unobsc
    vis_exact=exact(loaded['asset-visible-plate-on']) & visible
    lost=unobsc-visible
    added=visible-unobsc
    exact_lost=un_exact-vis_exact
    exact_added=vis_exact-un_exact
    un_color=color_influence(loaded['asset-hidden-plate-on'],loaded['asset-hidden-plate-off'])
    vis_color=color_influence(loaded['asset-visible-plate-on'],loaded['asset-visible-plate-off'])
    color_lost=un_color-vis_color
    color_added=vis_color-un_color
    expected_relpath='phone-light-teamplate-'+side+'-'+str(int(size))+'.png'
    comparable=root/expected_relpath
    old={"path":expected_relpath,"exists":comparable.exists()}
    if comparable.exists():
        oldimg=Image.open(comparable).convert('RGB')
        old["dimensions"]=list(oldimg.size)
        old["sameDecodedPixelsAsFreshVisibleState"]=list(oldimg.getdata())==list(loaded['asset-visible-plate-on'].getdata())
        old["oldPixelSha256"]=hashlib.sha256(oldimg.tobytes()).hexdigest()
        old["freshPixelSha256"]=hashlib.sha256(loaded['asset-visible-plate-on'].tobytes()).hexdigest()
    color_counts={}
    for state,im in loaded.items(): color_counts[state]=sum(1 for p in im.getdata() if p==target)
    h,w=loaded['asset-hidden-plate-on'].height,loaded['asset-hidden-plate-on'].width
    toxy=lambda inds:sorted([[i%w,i//w] for i in inds],key=lambda q:(q[1],q[0]))
    case={
      "key":c['key'],"viewport":c['viewport'],"theme":c['theme'],"geometry":c['geometry'],"teamColorCss":'#'+css,
      "stateDecodedPixelsSha256":{k:hashlib.sha256(im.tobytes()).hexdigest() for k,im in loaded.items()},
      "stateExactColorPixelCounts":color_counts,
      "unobstructedPlatePaintCoverage":{"pixels":len(unobsc),"exactTeamColorPixels":len(un_exact),"otherChangedIncludingAntialiasedBorderShadowPixels":len(unobsc-un_exact),"coordinates":toxy(unobsc)},
      "assetVisiblePlatePaintCoverage":{"pixels":len(visible),"exactTeamColorPixels":len(vis_exact),"otherChangedIncludingAntialiasedBorderShadowPixels":len(visible-vis_exact),"coordinates":toxy(visible)},
      "causalOcclusion":{"unobstructedChangedPixelsLostWhenAssetVisible":len(lost),"exactTeamColorPixelsLostWhenAssetVisible":len(exact_lost),"teamColorFillPixelsUnobstructedIncludingAntialias":len(un_color),"teamColorFillPixelsVisibleIncludingAntialias":len(vis_color),"teamColorFillPixelsLostIncludingAntialias":len(color_lost),"teamColorFillPixelsAddedIncludingAntialias":len(color_added),"newChangedPixelsWithAssetVisible":len(added),"exactColorPixelsNewWithAssetVisible":len(exact_added),"lostCoordinates":toxy(lost),"teamColorFillLostCoordinates":toxy(color_lost),"teamColorFillVisibleCoordinates":toxy(vis_color),"addedCoordinates":toxy(added)},
      "priorActualCropComparison":old,
      "rawDecodedRGBPixels":{k:list(im.getdata()) for k,im in loaded.items()},
    }
    out['cases'].append(case)
(root/'plate-causal-control-pixels.json').write_text(json.dumps(out,indent=2)+'\n')
# readable aggregate for review
summary=[]
for c in out['cases']:
    summary.append({k:c[k] for k in ['key','viewport','theme','teamColorCss','stateExactColorPixelCounts','unobstructedPlatePaintCoverage','assetVisiblePlatePaintCoverage','causalOcclusion','priorActualCropComparison']})
(root/'plate-causal-control-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for c in summary:
    print(c['key'], 'exact-hidden/visible=', c['stateExactColorPixelCounts']['asset-hidden-plate-on'],c['stateExactColorPixelCounts']['asset-visible-plate-on'],
          'paint-hidden/visible=',c['unobstructedPlatePaintCoverage']['pixels'],c['assetVisiblePlatePaintCoverage']['pixels'],
          'lost exact/total/fill=',c['causalOcclusion']['exactTeamColorPixelsLostWhenAssetVisible'],c['causalOcclusion']['unobstructedChangedPixelsLostWhenAssetVisible'],c['causalOcclusion']['teamColorFillPixelsLostIncludingAntialias'],
          'crop same=',c['priorActualCropComparison'].get('sameDecodedPixelsAsFreshVisibleState'))
