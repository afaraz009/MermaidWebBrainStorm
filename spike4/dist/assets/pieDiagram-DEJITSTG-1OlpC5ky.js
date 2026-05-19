import{n as e}from"./path-Cu84sa3e.js";import{m as t}from"./dist-BNoYbyFS.js";import{t as n}from"./arc-CAr7cRIO.js";import{t as r}from"./array-D9dsfWgN.js";import{f as i,r as a}from"./chunk-5PVQY5BW-DunqM-YS.js";import{g as o,h as s}from"./src-CyNoTxGN.js";import{B as c,C as l,V as u,W as d,_ as f,a as p,b as m,c as h,d as g,v as _}from"./chunk-ICPOFSXX-LFSt2zrH.js";import{t as v}from"./ordinal-dE-ndWkh.js";import{t as y}from"./chunk-426QAEUC-BG7iIqX6.js";import{t as b}from"./chunk-4BX2VUAB-C3UgfL5B.js";import{t as x}from"./mermaid-parser.core-BEZ-NSpL.js";function S(e,t){return t<e?-1:t>e?1:t>=e?0:NaN}function C(e){return e}function w(){var n=C,i=S,a=null,o=e(0),s=e(t),c=e(0);function l(e){var l,u=(e=r(e)).length,d,f,p=0,m=Array(u),h=Array(u),g=+o.apply(this,arguments),_=Math.min(t,Math.max(-t,s.apply(this,arguments)-g)),v,y=Math.min(Math.abs(_)/u,c.apply(this,arguments)),b=y*(_<0?-1:1),x;for(l=0;l<u;++l)(x=h[m[l]=l]=+n(e[l],l,e))>0&&(p+=x);for(i==null?a!=null&&m.sort(function(t,n){return a(e[t],e[n])}):m.sort(function(e,t){return i(h[e],h[t])}),l=0,f=p?(_-u*b)/p:0;l<u;++l,g=v)d=m[l],x=h[d],v=g+(x>0?x*f:0)+b,h[d]={data:e[d],index:l,value:x,startAngle:g,endAngle:v,padAngle:y};return h}return l.value=function(t){return arguments.length?(n=typeof t==`function`?t:e(+t),l):n},l.sortValues=function(e){return arguments.length?(i=e,a=null,l):i},l.sort=function(e){return arguments.length?(a=e,i=null,l):a},l.startAngle=function(t){return arguments.length?(o=typeof t==`function`?t:e(+t),l):o},l.endAngle=function(t){return arguments.length?(s=typeof t==`function`?t:e(+t),l):s},l.padAngle=function(t){return arguments.length?(c=typeof t==`function`?t:e(+t),l):c},l}var T=g.pie,E={sections:new Map,showData:!1,config:T},D=E.sections,O=E.showData,k=structuredClone(T),A={getConfig:s(()=>structuredClone(k),`getConfig`),clear:s(()=>{D=new Map,O=E.showData,p()},`clear`),setDiagramTitle:d,getDiagramTitle:l,setAccTitle:u,getAccTitle:_,setAccDescription:c,getAccDescription:f,addSection:s(({label:e,value:t})=>{if(t<0)throw Error(`"${e}" has invalid value: ${t}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);D.has(e)||(D.set(e,t),o.debug(`added new section: ${e}, with value: ${t}`))},`addSection`),getSections:s(()=>D,`getSections`),setShowData:s(e=>{O=e},`setShowData`),getShowData:s(()=>O,`getShowData`)},j=s((e,t)=>{b(e,t),t.setShowData(e.showData),e.sections.map(t.addSection)},`populateDb`),M={parse:s(async e=>{let t=await x(`pie`,e);o.debug(t),j(t,A)},`parse`)},N=s(e=>`
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,`getStyles`),P=s(e=>{let t=[...e.values()].reduce((e,t)=>e+t,0),n=[...e.entries()].map(([e,t])=>({label:e,value:t})).filter(e=>e.value/t*100>=1);return w().value(e=>e.value).sort(null)(n)},`createPieArcs`),F={parser:M,db:A,renderer:{draw:s((e,t,r,s)=>{o.debug(`rendering pie chart
`+e);let c=s.db,l=m(),u=a(c.getConfig(),l.pie),d=y(t),f=d.append(`g`);f.attr(`transform`,`translate(225,225)`);let{themeVariables:p}=l,[g]=i(p.pieOuterStrokeWidth);g??=2;let _=u.textPosition,b=n().innerRadius(0).outerRadius(185),x=n().innerRadius(185*_).outerRadius(185*_);f.append(`circle`).attr(`cx`,0).attr(`cy`,0).attr(`r`,185+g/2).attr(`class`,`pieOuterCircle`);let S=c.getSections(),C=P(S),w=[p.pie1,p.pie2,p.pie3,p.pie4,p.pie5,p.pie6,p.pie7,p.pie8,p.pie9,p.pie10,p.pie11,p.pie12],T=0;S.forEach(e=>{T+=e});let E=C.filter(e=>(e.data.value/T*100).toFixed(0)!==`0`),D=v(w).domain([...S.keys()]);f.selectAll(`mySlices`).data(E).enter().append(`path`).attr(`d`,b).attr(`fill`,e=>D(e.data.label)).attr(`class`,`pieCircle`),f.selectAll(`mySlices`).data(E).enter().append(`text`).text(e=>(e.data.value/T*100).toFixed(0)+`%`).attr(`transform`,e=>`translate(`+x.centroid(e)+`)`).style(`text-anchor`,`middle`).attr(`class`,`slice`);let O=f.append(`text`).text(c.getDiagramTitle()).attr(`x`,0).attr(`y`,-400/2).attr(`class`,`pieTitleText`),k=[...S.entries()].map(([e,t])=>({label:e,value:t})),A=f.selectAll(`.legend`).data(k).enter().append(`g`).attr(`class`,`legend`).attr(`transform`,(e,t)=>{let n=22*k.length/2;return`translate(216,`+(t*22-n)+`)`});A.append(`rect`).attr(`width`,18).attr(`height`,18).style(`fill`,e=>D(e.label)).style(`stroke`,e=>D(e.label)),A.append(`text`).attr(`x`,22).attr(`y`,14).text(e=>c.getShowData()?`${e.label} [${e.value}]`:e.label);let j=512+Math.max(...A.selectAll(`text`).nodes().map(e=>e?.getBoundingClientRect().width??0)),M=O.node()?.getBoundingClientRect().width??0,N=450/2-M/2,F=450/2+M/2,I=Math.min(0,N),L=Math.max(j,F)-I;d.attr(`viewBox`,`${I} 0 ${L} 450`),h(d,450,L,u.useMaxWidth)},`draw`)},styles:N};export{F as diagram};