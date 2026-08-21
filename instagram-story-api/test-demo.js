const app = require('./src/server');
const http = require('http');

process.env.STORY_PROVIDER = 'mock';

const server = http.createServer(app);
server.listen(4001, async () => {
  try {
    const res = await fetch('http://localhost:4001/api/instagram/story/instagram');
    const json = await res.json();
    console.log('--- Response from Mock Provider (Simulating Active Stories) ---');
    console.log(JSON.stringify(json, null, 2));
  } finally {
    server.close();
  }
});
