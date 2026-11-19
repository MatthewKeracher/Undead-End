// Tags each stylesheet and script in index.html with a fingerprint of its contents (style.css?v=1a2b3c4d),
// so browsers fetch a file again exactly when it has changed — no hard refresh needed after an update.
// Run with:  node tools/stamp.js   (the pre-commit hook in tools/pre-commit does it on every commit)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const page = path.join(root, 'index.html');
const html = fs.readFileSync(page, 'utf8');
const stamped = html.replace(/(href|src)="([\w.-]+\.(?:css|js))(?:\?v=\w+)?"/g, (whole, attr, file) => {
  const f = path.join(root, file);
  if (!fs.existsSync(f)) return whole;
  const v = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
  return `${attr}="${file}?v=${v}"`;
});
if (stamped !== html) fs.writeFileSync(page, stamped);
