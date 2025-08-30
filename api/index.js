const serverless = require('serverless-http');
const path = require('path');
const app = require('../server');

app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

module.exports = (req, res) => {
  const handler = serverless(app);
  return handler(req, res);
};
