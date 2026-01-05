const express = require('express');
const app = express();
app.use(express.json());

app.post('/pack', (req, res) => {
  const { containers = [], items = [] } = req.body;

  // Initialize container states with remaining volume and weight
  const containerStates = containers.map(container => ({
    ...container,
    remainingVolume: container.length * container.width * container.height,
    remainingWeight: container.maxWeight ?? Infinity,
    items: []
  }));

  const placements = {};
  for (const item of items) {
    const itemVolume = item.length * item.width * item.height;
    const itemWeight = item.weight ?? 0;
    let placed = false;
    for (const container of containerStates) {
      if (container.remainingVolume >= itemVolume && container.remainingWeight >= itemWeight) {
        container.items.push(item.id);
        container.remainingVolume -= itemVolume;
        container.remainingWeight -= itemWeight;
        placements[item.id] = container.id;
        placed = true;
        break;
      }
    }
    if (!placed) {
      placements[item.id] = null;
    }
  }

  const responseContainers = containerStates.map(c => ({
    id: c.id,
    items: c.items
  }));

  res.json({ placements, containers: responseContainers });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
