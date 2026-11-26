import fs from 'node:fs';
import path from 'node:path';
import {buildScene} from '../../dist/hero/impact.js';

if (!process.env.VR_RENDER_DIR) throw new Error('Stel VR_RENDER_DIR in.');
const directory = path.join(process.env.VR_RENDER_DIR, 'geometry');
fs.mkdirSync(directory, {recursive:true});
const write = (name, data) => fs.writeFileSync(path.join(directory, name), JSON.stringify(data));

function geometry(mesh) {
  const {attributes, index} = mesh.geometry;
  return {
    pos: Array.from(attributes.position.array),
    index: Array.from(index?.array ?? []),
    uv: Array.from(attributes.uv?.array ?? []),
    matrix: mesh.matrix.toArray(),
    instances: mesh.isInstancedMesh ? Array.from(mesh.instanceMatrix.array) : null
  };
}

const {scene, can, render} = await buildScene();
const sheet = scene.getObjectByName('impact-sheet');
const drops = scene.getObjectByName('impact-droplets');
render(.8);
can.updateMatrixWorld(true);
write('base.json', {mesh: can.children.map(geometry), sheet: geometry(sheet), drops: geometry(drops)});
for (let frame = 0; frame < 79; frame++) {
  render(frame / 30);
  can.updateMatrixWorld(true);
  write(frame + '.json', {
    can: can.matrix.toArray(),
    wet: sheet.visible,
    verts: Array.from(sheet.geometry.attributes.position.array),
    ys: sheet.scale.y,
    rain: drops.visible,
    inst: Array.from(drops.instanceMatrix.array)
  });
}
