// Instanced unlit quads/meshes with a per-instance colour AND opacity, so a
// whole family of short-lived effects (bursts, rings, trails, health bars)
// fades smoothly in one draw call. Opacity rides in an `instanceAlpha`
// attribute that a small shader patch multiplies into the fragment alpha.
import {
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
} from "../three-module.js";

function patchInstanceAlpha(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvInstanceAlpha = instanceAlpha;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vInstanceAlpha;")
      .replace("#include <opaque_fragment>", "diffuseColor.a *= vInstanceAlpha;\n#include <opaque_fragment>");
  };
  material.customProgramCacheKey = () => "moss-ember-instance-alpha";
  return material;
}

/**
 * @param {{ name: string, geometry: import("three").BufferGeometry, capacity: number,
 *   renderOrder?: number, depthTest?: boolean, polygonOffset?: number, blending?: number }} options
 */
export function createFadingInstances({
  name, geometry, capacity, renderOrder = 0, depthTest = true, polygonOffset = 0, blending,
}) {
  const material = patchInstanceAlpha(new MeshBasicMaterial({
    color: 0xffffff,
    depthTest,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
    ...(blending === undefined ? {} : { blending }),
    ...(polygonOffset === 0 ? {} : {
      polygonOffset: true, polygonOffsetFactor: polygonOffset, polygonOffsetUnits: polygonOffset,
    }),
  }));
  const alpha = new InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
  geometry.setAttribute("instanceAlpha", alpha);
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return {
    mesh,
    setAt(index, matrix, color, opacity = 1) {
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color);
      alpha.array[index] = opacity;
    },
    commit(count) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      alpha.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
