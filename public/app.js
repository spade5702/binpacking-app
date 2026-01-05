import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const elContainers = document.querySelector("#containers");
const elItems = document.querySelector("#items");
const btnAddContainer = document.querySelector("#addContainer");
const btnAddItem = document.querySelector("#addItem");
const btnPack = document.querySelector("#packBtn");
const elStatus = document.querySelector("#status");
const elResults = document.querySelector("#results");
const elViewer = document.querySelector("#viewer");
const elContainerSelect = document.querySelector("#containerSelect");

function containerRow(data = {}) {
  const div = document.createElement("div");
  div.className = "rowline";
  div.innerHTML = `
    <input placeholder="id" value="${data.id ?? "box1"}" data-k="id" />
    <input placeholder="L" value="${data.length ?? 30}" data-k="length" type="number" step="any"/>
    <input placeholder="W" value="${data.width ?? 20}" data-k="width" type="number" step="any"/>
    <input placeholder="H" value="${data.height ?? 20}" data-k="height" type="number" step="any"/>
    <input placeholder="maxWeight" value="${data.maxWeight ?? 50}" data-k="maxWeight" type="number" step="any"/>
    <button class="x">✕</button>
  `;
  div.querySelector(".x").onclick = () => div.remove();
  return div;
}

function itemRow(data = {}) {
  const div = document.createElement("div");
  div.className = "rowline";
  div.innerHTML = `
    <input placeholder="id" value="${data.id ?? "itemA"}" data-k="id" />
    <input placeholder="qty" value="${data.qty ?? 1}" data-k="qty" type="number" min="1" step="1"/>
    <input placeholder="L" value="${data.length ?? 10}" data-k="length" type="number" step="any"/>
    <input placeholder="W" value="${data.width ?? 8}" data-k="width" type="number" step="any"/>
    <input placeholder="H" value="${data.height ?? 4}" data-k="height" type="number" step="any"/>
    <input placeholder="weight" value="${data.weight ?? 1}" data-k="weight" type="number" step="any"/>
    <button class="x">✕</button>
  `;
  div.querySelector(".x").onclick = () => div.remove();
  return div;
}

function readRows(root) {
  return [...root.querySelectorAll(".rowline")].map((row) => {
    const obj = {};
    [...row.querySelectorAll("input")].forEach((inp) => {
      const k = inp.dataset.k;
      obj[k] = inp.type === "number" ? Number(inp.value) : inp.value.trim();
    });
    return obj;
  });
}

// Seed initial rows
elContainers.appendChild(containerRow({ id: "box1", length: 30, width: 20, height: 20, maxWeight: 50 }));
elItems.appendChild(itemRow({ id: "itemA", qty: 2, length: 10, width: 8, height: 4, weight: 1 }));
elItems.appendChild(itemRow({ id: "itemB", qty: 1, length: 12, width: 10, height: 6, weight: 2 }));

btnAddContainer.onclick = () => elContainers.appendChild(containerRow({ id: `box${elContainers.children.length + 1}` }));
btnAddItem.onclick = () => elItems.appendChild(itemRow({ id: `item${String.fromCharCode(65 + elItems.children.length)}` }));

// --- Three.js viewer ---
let scene, camera, renderer, controls, group;

function init3D() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  elViewer.innerHTML = "";
  elViewer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 2, 3);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  group = new THREE.Group();
  scene.add(group);

  window.addEventListener("resize", resize3D);
  resize3D();
  animate();
}

function resize3D() {
  const w = elViewer.clientWidth || 600;
  const h = elViewer.clientHeight || 400;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h & 0xffffff;
}

function clearGroup() {
  while (group.children.length) group.remove(group.children[0]);
}

function renderContainer(container) {
  clearGroup();
  if (!container) return;

  const L = container.length, W = container.width, H = container.height;

  // Container wireframe (Three: x=length, y=height, z=width)
  const boxGeo = new THREE.BoxGeometry(L, H, W);
  const edges = new THREE.EdgesGeometry(boxGeo);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x222222 }));
  line.position.set(L / 2, H / 2, W / 2);
  group.add(line);

  // Items
  for (const it of container.placed || []) {
    const geo = new THREE.BoxGeometry(it.length, it.height, it.width);
    const mat = new THREE.MeshPhongMaterial({
      color: hashColor(it.id),
      transparent: true,
      opacity: 0.75
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Convert pack coords (x,y,z) => Three coords (x,z->y,y->z)
    mesh.position.set(
      it.position.x + it.length / 2,
      it.position.z + it.height / 2,
      it.position.y + it.width / 2
    );

    group.add(mesh);
  }

  // Camera framing
  const center = new THREE.Vector3(L / 2, H / 2, W / 2);
  const maxDim = Math.max(L, W, H);
  camera.position.set(L * 1.2, H * 1.2, W * 1.2 + maxDim);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init3D();

// --- Pack button ---
btnPack.onclick = async () => {
  elStatus.textContent = "Packing…";

  const containers = readRows(elContainers).map((c) => ({
    id: c.id,
    length: c.length,
    width: c.width,
    height: c.height,
    maxWeight: c.maxWeight
  }));

  // Expand qty into individual item ids
  const items = [];
  for (const r of readRows(elItems)) {
    const qty = Math.max(1, Number(r.qty) || 1);
    for (let i = 1; i <= qty; i++) {
      items.push({
        id: qty === 1 ? r.id : `${r.id}-${i}`,
        length: r.length,
        width: r.width,
        height: r.height,
        weight: r.weight
      });
    }
  }

  try {
    const resp = await fetch("/pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containers, items })
    });

    const data = await resp.json();
    elResults.textContent = JSON.stringify(data, null, 2);

    // Populate container dropdown + render first container
    elContainerSelect.innerHTML = "";
    (data.containers || []).forEach((c, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = c.id;
      elContainerSelect.appendChild(opt);
    });

    const first = (data.containers || [])[0];
    renderContainer(first);

    elContainerSelect.onchange = () => {
      const idx = Number(elContainerSelect.value);
      renderContainer((data.containers || [])[idx]);
    };

    elStatus.textContent = data.unplaced?.length ? `Done (unplaced: ${data.unplaced.length})` : "Done ✅";
  } catch (e) {
    elStatus.textContent = "Error ❌";
    elResults.textContent = String(e);
  }
};
