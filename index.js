const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * Very simple 3D "shelf" placer (no rotations yet):
 * - Fill along X (length)
 * - When X overflows -> new row along Y (width)
 * - When Y overflows -> new layer along Z (height)
 *
 * Coordinates returned use:
 *   x = length axis
 *   y = width axis
 *   z = height axis
 */
function tryPlaceShelf(state, item) {
  const L = Number(item.length);
  const W = Number(item.width);
  const H = Number(item.height);
  if (![L, W, H].every((n) => Number.isFinite(n) && n > 0)) return null;

  const cL = Number(state.length);
  const cW = Number(state.width);
  const cH = Number(state.height);

  // Helper: attempt place at a candidate cursor
  function canPlaceAt(x, y, z) {
    return x + L <= cL && y + W <= cW && z + H <= cH;
  }

  // 1) Try current cursor
  if (canPlaceAt(state.x, state.y, state.z)) {
    const pos = { x: state.x, y: state.y, z: state.z };

    // advance cursor in X
    state.x += L;
    state.rowMaxW = Math.max(state.rowMaxW, W);
    state.layerMaxH = Math.max(state.layerMaxH, H);

    return pos;
  }

  // 2) New row (reset X, advance Y by widest item in row)
  {
    const newY = state.y + state.rowMaxW;
    if (Number.isFinite(newY)) {
      const x = 0;
      const y = newY;
      const z = state.z;

      if (canPlaceAt(x, y, z)) {
        state.x = x + L;
        state.y = y;
        // reset row
        state.rowMaxW = W;
        state.layerMaxH = Math.max(state.layerMaxH, H);
        return { x, y, z };
      }
    }
  }

  // 3) New layer (reset X,Y, advance Z by tallest item in layer)
  {
    const newZ = state.z + state.layerMaxH;
    const x = 0;
    const y = 0;
    const z = newZ;

    if (Number.isFinite(newZ) && canPlaceAt(x, y, z)) {
      state.x = x + L;
      state.y = y;
      state.z = z;
      // reset row + layer trackers
      state.rowMaxW = W;
      state.layerMaxH = H;
      return { x, y, z };
    }
  }

  return null;
}

app.post("/pack", (req, res) => {
  const { containers = [], items = [] } = req.body || {};

  // Basic input validation
  if (!Array.isArray(containers) || !Array.isArray(items)) {
    return res.status(400).json({ error: "containers and items must be arrays" });
  }

  // Initialize container states
  const states = containers.map((c) => ({
    id: c.id,
    length: Number(c.length),
    width: Number(c.width),
    height: Number(c.height),
    maxWeight: c.maxWeight == null ? Infinity : Number(c.maxWeight),
    usedWeight: 0,

    // shelf state
    x: 0,
    y: 0,
    z: 0,
    rowMaxW: 0,     // max item width in current row
    layerMaxH: 0,   // max item height in current layer

    placed: []      // { id, length, width, height, weight, position }
  }));

  // Sort items by volume (bigger first helps a bit)
  const sortedItems = [...items].sort((a, b) => {
    const va = Number(a.length) * Number(a.width) * Number(a.height);
    const vb = Number(b.length) * Number(b.width) * Number(b.height);
    return (Number.isFinite(vb) ? vb : 0) - (Number.isFinite(va) ? va : 0);
  });

  const placements = {};     // itemId -> { containerId, position } | null
  const unplaced = [];

  for (const item of sortedItems) {
    const itemId = item.id;
    const weight = item.weight == null ? 0 : Number(item.weight);

    let placed = false;

    for (const st of states) {
      // Validate container dims once
      if (![st.length, st.width, st.height].every((n) => Number.isFinite(n) && n > 0)) continue;
      if (!Number.isFinite(weight) || weight < 0) continue;
      if (st.usedWeight + weight > st.maxWeight) continue;

      // Quick reject if item larger than container
      if (Number(item.length) > st.length || Number(item.width) > st.width || Number(item.height) > st.height) {
        continue;
      }

      const pos = tryPlaceShelf(st, item);
      if (pos) {
        st.usedWeight += weight;

        const placedItem = {
          id: itemId,
          length: Number(item.length),
          width: Number(item.width),
          height: Number(item.height),
          weight,
          position: pos
        };

        st.placed.push(placedItem);
        placements[itemId] = { containerId: st.id, position: pos };
        placed = true;
        break;
      }
    }

    if (!placed) {
      placements[itemId] = null;
      unplaced.push(itemId);
    }
  }

  res.json({
    placements,
    unplaced,
    containers: states.map((s) => ({
      id: s.id,
      length: s.length,
      width: s.width,
      height: s.height,
      placed: s.placed
    }))
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
