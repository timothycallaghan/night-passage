import { Vector3 } from 'three';
// Geometric coverage, cached once in bind space; always skin the selected
// triangle centroids in the current pose before testing the strict viewport/ray.
export const SURFACE_LIMITS=Object.freeze({meshes:3,pointsPerMesh:12});
export function createActorSurfaceFallback(){
  const cache=new WeakMap(),a=new Vector3(),b=new Vector3(),point=new Vector3();
  function representatives(mesh){
    const g=mesh.geometry,position=g.getAttribute('position'),index=g.index,count=index?index.count:position.count;
    if(!g.boundingBox)g.computeBoundingBox();const size=g.boundingBox.getSize(new Vector3());
    const candidates=[];
    for(let k=0;k+2<count;k+=3){const ids=[0,1,2].map(j=>index?index.getX(k+j):k+j);point.set(0,0,0);for(const id of ids)point.add(a.fromBufferAttribute(position,id));point.multiplyScalar(1/3);
      candidates.push({ids,triangle:k/3,p:new Vector3(point.x/(size.x||1),point.y/(size.y||1),point.z/(size.z||1)),distance:Infinity});}
    const chosen=[];let next=0;
    // Farthest-point coverage spans the entire normalized surface, rather than
    // adding a joint or depending on authored triangle-index ordering.
    while(chosen.length<SURFACE_LIMITS.pointsPerMesh&&chosen.length<candidates.length){const pick=candidates[next];chosen.push(pick);pick.distance=-1;let farthest=-1;
      for(let i=0;i<candidates.length;i++){const c=candidates[i];if(c.distance<0)continue;c.distance=Math.min(c.distance,c.p.distanceToSquared(pick.p));if(c.distance>farthest){farthest=c.distance;next=i;}}
    }return chosen;
  }
  return function surface(root,visible,stats){
    let meshes=cache.get(root);if(!meshes){meshes=[];root.traverse(o=>{if(o.isSkinnedMesh&&meshes.length<SURFACE_LIMITS.meshes&&!o.material?.transparent)meshes.push({mesh:o,samples:null});});
      // The authored head is often unobstructed above the counter. Prioritize
      // it without dropping body coverage or changing any occlusion decision.
      meshes.sort((a,b)=>Number(b.mesh.material?.name==='head')-Number(a.mesh.material?.name==='head'));cache.set(root,meshes);}
    for(const entry of meshes){const {mesh}=entry;let shown=true;for(let p=mesh;p;p=p.parent){if(!p.visible){shown=false;break;}if(p===root)break;}if(!shown)continue;
      const samples=entry.samples??(entry.samples=representatives(mesh));
      for(const sample of samples){point.set(0,0,0);for(const id of sample.ids)point.add(mesh.getVertexPosition(id,b));point.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld);stats.surfacePoints++;
        if(visible(point,root))return {surface:true,mesh:mesh.name,triangle:sample.triangle,point:point.toArray()};
      }
    }return null;
  };
}
