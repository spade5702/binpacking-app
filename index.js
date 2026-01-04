const express = require('express');
const app = express();
app.use(express.json());

app.post('/pack', (req, res) => {
  // TODO: implement bin-packing algorithm
  res.json({ message: 'Packing service not yet implemented' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port ' + PORT);
});
