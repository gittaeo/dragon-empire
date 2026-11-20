import * as THREE from './vendor/three.module.js';

// A lightweight, self-contained valley; distant hero assets can be added alongside it.
export function createEnvironment(scene) {
  const group = new THREE.Group();
  group.name = 'Emerald Valley';
  scene.add(group);
  const seed = n => { const x = Math.sin(n * 127.1 + 17.8) * 43758.5453; return x - Math.floor(x); };
  const height = (x,z) => {
    const r = Math.hypot(x,z);
    const hills = Math.sin(x*.008)*11 + Math.cos(z*.009)*9 + Math.sin((x+z)*.018)*3;
    const rim = Math.max(0,r-300);
    return -6 + hills*.45 + Math.pow(rim/52,1.65)*4;
  };
  // Vertex colors create a textured, elevated landscape without expensive texture fetches.
  const terrainGeo = new THREE.PlaneGeometry(2200,2200,160,160);
  terrainGeo.rotateX(-Math.PI/2);
  const p=terrainGeo.attributes.position, colors=[];
  const low=new THREE.Color(0x557b4d), high=new THREE.Color(0x7f8c78), peak=new THREE.Color(0xb2b7ad);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),h=height(x,z);p.setY(i,h);
    const color=low.clone().lerp(high,THREE.MathUtils.smoothstep(h,20,110)).lerp(peak,THREE.MathUtils.smoothstep(h,125,250)*.8);
    color.multiplyScalar(.91+seed(i)*.18);colors.push(color.r,color.g,color.b);
  }
  terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();
  const terrain=new THREE.Mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));terrain.name='Valley terrain';group.add(terrain);

  // A gently winding translucent river follows the valley floor.
  const riverVerts=[],riverIndices=[];
  for(let i=0;i<=120;i++){
    const z=-1050+i*17.5,x=110+Math.sin(z*.0038)*75+Math.sin(z*.009)*16,y=height(x,z)+1.2;
    riverVerts.push(x-35,y,z,x+35,y,z);
    if(i<120){const n=i*2;riverIndices.push(n,n+2,n+1,n+1,n+2,n+3)}
  }
  const riverGeo=new THREE.BufferGeometry();riverGeo.setAttribute('position',new THREE.Float32BufferAttribute(riverVerts,3));riverGeo.setIndex(riverIndices);riverGeo.computeVertexNormals();
  const river=new THREE.Mesh(riverGeo,new THREE.MeshStandardMaterial({color:0x69abb3,metalness:.22,roughness:.3,side:THREE.DoubleSide}));river.name='River';group.add(river);

  // Shared tree meshes reduce hundreds of draw calls to two.
  const count=420, trunkGeo=new THREE.CylinderGeometry(1.1,1.8,13,6), crownGeo=new THREE.ConeGeometry(7.5,28,7);
  const trunks=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:0x594937,roughness:1}),count);
  const crowns=new THREE.InstancedMesh(crownGeo,new THREE.MeshStandardMaterial({color:0x47704b,roughness:1}),count);
  const dummy=new THREE.Object3D(), c=new THREE.Color();let used=0;
  for(let i=0;i<count*2&&used<count;i++){
    const x=(seed(i*3+1)-.5)*1600,z=(seed(i*3+2)-.5)*1600,riverX=110+Math.sin(z*.0038)*75+Math.sin(z*.009)*16;
    const h=height(x,z);if(Math.abs(x-riverX)<60||h>115||Math.hypot(x,z)<80)continue;
    const size=.7+seed(i*3+3)*.8;dummy.position.set(x,h+6.5*size,z);dummy.scale.setScalar(size);dummy.rotation.y=seed(i+100)*Math.PI;dummy.updateMatrix();trunks.setMatrixAt(used,dummy.matrix);
    dummy.position.y=h+23*size;dummy.updateMatrix();crowns.setMatrixAt(used,dummy.matrix);c.setHSL(.29+seed(i+400)*.045,.28+seed(i+500)*.1,.28+seed(i+600)*.1);crowns.setColorAt(used,c);used++;
  }
  trunks.count=crowns.count=used;trunks.instanceMatrix.needsUpdate=crowns.instanceMatrix.needsUpdate=true;if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;group.add(trunks,crowns);

  // Opaque cloud banks give the sky depth without transparent overdraw.
  const cloudGeo=new THREE.SphereGeometry(1,9,6),cloudMat=new THREE.MeshStandardMaterial({color:0xf4f5ed,roughness:1});
  const clouds=new THREE.InstancedMesh(cloudGeo,cloudMat,72);
  for(let i=0;i<72;i++){
    const cluster=Math.floor(i/4), angle=cluster*2.399, radius=430+seed(cluster+700)*500;
    dummy.position.set(Math.sin(angle)*radius+(i%4)*22,125+seed(cluster+800)*100+Math.sin(i)*5,Math.cos(angle)*radius);
    dummy.scale.set(30+seed(i+11)*22,10+seed(i+12)*9,20+seed(i+13)*15);dummy.rotation.set(0,angle,0);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate=true;group.add(clouds);
  return {group, terrain, river, heightAt:height, dispose(){scene.remove(group);terrainGeo.dispose();riverGeo.dispose();trunkGeo.dispose();crownGeo.dispose();cloudGeo.dispose();group.traverse(o=>{if(o.material){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose())}})}};
}
