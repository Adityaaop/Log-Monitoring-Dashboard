const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const root = path.join(__dirname, 'standalone_preview');

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const reqPath = req.url.split('?')[0];
  const file = path.join(root, reqPath === '/' ? 'index.html' : reqPath);

  if (!file.startsWith(root)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'text/plain');
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  exec(`open http://localhost:${PORT}`);
});
