// Renders each .dc.html board to a static, standalone HTML snapshot and PNG screenshots (light + dark).
// Usage: node export.js <srcDir> <outDir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [srcDir, outDir] = process.argv.slice(2);
const boards = [
  ['Main', 'desk'],
  ['Race', 'race-file'],
  ['Swing', 'swing-explorer'],
  ['Scorecard', 'signal-scorecard'],
  ['Notebook', 'notebook'],
];
const linkMap = Object.fromEntries(boards.map(([b, n]) => [b + '.dc.html', n + '.html']));

// Runs in the page: expands {{holes}}, <sc-for>, <sc-if> using the board's own renderVals().
function renderInPage({ markup, script, dark }) {
  class DCLogic { constructor() { this.props = { dark }; this.state = null; } setState() {} forceUpdate() {} }
  const Component = new Function('DCLogic', script + '\nreturn Component;')(DCLogic);
  const vals = new Component().renderVals();
  const get = (scope, p) => {
    p = p.trim();
    if (p === 'true') return true;
    if (p === 'false') return false;
    if (/^-?\d/.test(p)) return Number(p);
    return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  };
  const interp = (str, scope) => {
    const whole = str.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (whole) return get(scope, whole[1]);
    return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => { const v = get(scope, p); return v == null ? '' : String(v); });
  };
  const walk = (parent, scope) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3) { if (node.nodeValue.includes('{{')) node.nodeValue = interp(node.nodeValue, scope); continue; }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (tag === 'sc-for') {
        const list = interp(node.getAttribute('list'), scope) || [];
        const as = node.getAttribute('as');
        list.forEach((item, i) => {
          const frag = document.createDocumentFragment();
          for (const c of Array.from(node.childNodes)) frag.appendChild(c.cloneNode(true));
          const holder = document.createElement('div');
          holder.appendChild(frag);
          walk(holder, Object.assign({}, scope, { [as]: item, $index: i }));
          while (holder.firstChild) parent.insertBefore(holder.firstChild, node);
        });
        node.remove();
        continue;
      }
      if (tag === 'sc-if') {
        if (interp(node.getAttribute('value'), scope)) {
          walk(node, scope);
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
        }
        node.remove();
        continue;
      }
      for (const a of Array.from(node.attributes)) {
        if (/^on[A-Z]/.test(a.name) || a.name.startsWith('hint-')) { node.removeAttribute(a.name); continue; }
        if (a.value.includes('{{')) {
          const v = interp(a.value, scope);
          if (typeof v === 'function' || v == null || v === false) node.removeAttribute(a.name);
          else node.setAttribute(a.name, String(v));
        }
      }
      walk(node, scope);
    }
  };
  const root = document.getElementById('root');
  root.innerHTML = markup;
  walk(root, vals);
  return root.innerHTML;
}

(async () => {
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });
  const browser = await chromium.launch();
  for (const [board, name] of boards) {
    const src = fs.readFileSync(path.join(srcDir, board + '.dc.html'), 'utf8');
    const title = src.match(/<title>([\s\S]*?)<\/title>/)[1];
    const helmet = src.match(/<helmet>([\s\S]*?)<\/helmet>/)[1];
    const xdc = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1].replace(/<helmet>[\s\S]*?<\/helmet>/, '');
    const script = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];

    for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
      await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8">${helmet}</head><body><div id="root"></div></body></html>`);
      let html = await page.evaluate(renderInPage, { markup: xdc, script, dark });
      for (const [from, to] of Object.entries(linkMap)) html = html.split(`href="${from}"`).join(`href="${to}"`);
      await page.evaluate((h) => { document.getElementById('root').innerHTML = h; }, html);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(outDir, 'screenshots', `${name}-${dark ? 'dark' : 'light'}.png`), fullPage: true });

      if (!dark) {
        const toggle = `<script>
document.querySelectorAll('button').forEach(function (b) {
  if (!/Dark mode|Light mode/.test(b.textContent)) return;
  b.addEventListener('click', function () {
    var root = document.querySelector('.mf');
    var dark = root.classList.toggle('dark');
    document.querySelectorAll('button').forEach(function (x) {
      if (/Dark mode|Light mode/.test(x.textContent)) {
        x.lastChild.textContent = dark ? 'Light mode' : 'Dark mode';
        x.setAttribute('aria-pressed', dark ? 'true' : 'false');
      }
    });
  });
});
</script>`;
        const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Mycroft analyst workbench mockup (static export). All values are illustrative mock data.">
<title>${title}</title>
${helmet.trim()}
</head>
<body>
${html.trim()}
${toggle}
</body>
</html>
`;
        fs.writeFileSync(path.join(outDir, name + '.html'), doc);
      }
      await page.close();
      console.log('rendered', name, dark ? 'dark' : 'light');
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
