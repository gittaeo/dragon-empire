// Static landmark collision. Coordinates are world-space metres; capsule radii
// deliberately approximate the rendered meshes rather than their triangles.
const sq = x => x * x;
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

export function createObstacleField(shapes, cellSize = 180) {
  const cells = new Map();
  const key = (x,z) => `${x},${z}`;
  const cell = v => Math.floor(v / cellSize);
  shapes.forEach((s,id) => {
    const r=s.radius, minX=cell(Math.min(s.a.x,s.b.x)-r), maxX=cell(Math.max(s.a.x,s.b.x)+r);
    const minZ=cell(Math.min(s.a.z,s.b.z)-r), maxZ=cell(Math.max(s.a.z,s.b.z)+r);
    for(let x=minX;x<=maxX;x++) for(let z=minZ;z<=maxZ;z++) { const k=key(x,z); if(!cells.has(k))cells.set(k,[]); cells.get(k).push(id); }
  });
  function candidates(minX,maxX,minZ,maxZ) {
    const ids=new Set(); for(let x=cell(minX);x<=cell(maxX);x++)for(let z=cell(minZ);z<=cell(maxZ);z++)for(const id of cells.get(key(x,z))||[])ids.add(id);return ids;
  }
  // Traverse only the cells crossed by the segment, rather than its entire
  // bounding rectangle. Shapes are already indexed into every cell they cover.
  function rayCandidates(from,to) {
    const ids=new Set(), dx=to.x-from.x, dz=to.z-from.z;
    let x=cell(from.x),z=cell(from.z);const endX=cell(to.x),endZ=cell(to.z);
    const sx=Math.sign(dx),sz=Math.sign(dz),txDelta=sx?cellSize/Math.abs(dx):Infinity,tzDelta=sz?cellSize/Math.abs(dz):Infinity;
    let tx=sx?((sx>0?(x+1)*cellSize:x*cellSize)-from.x)/dx:Infinity;
    let tz=sz?((sz>0?(z+1)*cellSize:z*cellSize)-from.z)/dz:Infinity;
    const add=(cx,cz)=>{for(const id of cells.get(key(cx,cz))||[])ids.add(id)};
    for(;;){add(x,z);if(x===endX&&z===endZ)break;if(Math.abs(tx-tz)<1e-12){add(x+sx,z);add(x,z+sz);x+=sx;z+=sz;tx+=txDelta;tz+=tzDelta}else if(tx<tz){x+=sx;tx+=txDelta}else{z+=sz;tz+=tzDelta}}
    return ids;
  }
  function closest(p,s) {const ab=sub(s.b,s.a), ap=sub(p,s.a), d=dot(ab,ab), t=d?clamp(dot(ap,ab)/d,0,1):0;return {x:s.a.x+ab.x*t,y:s.a.y+ab.y*t,z:s.a.z+ab.z*t};}
  function obstacleAt(x,y,z,radius=0) {
    const p={x,y,z};let best=null;
    for(const id of candidates(x-radius,x+radius,z-radius,z+radius)) {const s=shapes[id], q=closest(p,s), v=sub(p,q), d=Math.hypot(v.x,v.y,v.z), depth=s.radius+radius-d;if(depth<=0)continue;const normal=d>1e-8?{x:v.x/d,y:v.y/d,z:v.z/d}:{x:0,y:1,z:0};if(!best||depth>best.depth)best={hit:true,normal,depth,obstacle:s.id};}
    return best||{hit:false,normal:{x:0,y:0,z:0},depth:0,obstacle:null};
  }
  function raycastObstacles(from,to) {
    const rd=sub(to,from), length=Math.hypot(rd.x,rd.y,rd.z);if(!length){const h=obstacleAt(from.x,from.y,from.z);return h.hit?{...h,point:{...from},fraction:0,distance:0}:null;}
    const dir={x:rd.x/length,y:rd.y/length,z:rd.z/length};let best=null;
    for(const id of rayCandidates(from,to)) {
      const s=shapes[id], ba=sub(s.b,s.a), oa=sub(from,s.a), baba=dot(ba,ba), bard=dot(ba,dir), baoa=dot(ba,oa), rdoa=dot(dir,oa), oaoa=dot(oa,oa);
      let t=Infinity;
      if(oaoa<=sq(s.radius)||dot(sub(from,closest(from,s)),sub(from,closest(from,s)))<=sq(s.radius))t=0;
      const A=baba-bard*bard,B=baba*rdoa-baoa*bard,C=baba*oaoa-baoa*baoa-sq(s.radius)*baba,disc=B*B-A*C;
      if(A>1e-10&&disc>=0){const v=(-B-Math.sqrt(disc))/A,y=baoa+v*bard;if(v>=0&&y>=0&&y<=baba)t=Math.min(t,v);}
      for(const center of [s.a,s.b]){const oc=sub(from,center),b=dot(oc,dir),c=dot(oc,oc)-sq(s.radius),h=b*b-c;if(h>=0){const v=-b-Math.sqrt(h);if(v>=0)t=Math.min(t,v);}}
      if(t<=length&&(!best||t<best.distance)){const point={x:from.x+dir.x*t,y:from.y+dir.y*t,z:from.z+dir.z*t},q=closest(point,s),v=sub(point,q),d=Math.hypot(v.x,v.y,v.z);best={hit:true,point,normal:d?{x:v.x/d,y:v.y/d,z:v.z/d}:{x:0,y:1,z:0},distance:t,fraction:t/length,obstacle:s.id};}
    }return best;
  }
  return {obstacleAt,raycastObstacles,shapeCount:shapes.length};
}
