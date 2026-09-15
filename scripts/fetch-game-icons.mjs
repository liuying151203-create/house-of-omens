import fs from 'node:fs/promises';
const choices = {
  coffee: 'delapouite/coffee-cup',
  medkit: 'delapouite/first-aid-kit',
  tonic: 'lorc/pill',
  crowbar: 'delapouite/crowbar',
  flashlight: 'delapouite/flashlight',
  boots: 'lorc/boots',
  tools: 'delapouite/toolbox',
  lucky: 'lorc/clover',
  bandage: 'lorc/bandage-roll',
  tea: 'lorc/teapot',
  bell: 'lorc/ringing-bell',
  book: 'delapouite/secret-book',
  mask: 'lorc/domino-mask',
  compass: 'lorc/compass',
  locket: 'lorc/gem-pendant',
  bone: 'lorc/crossed-bones',
  key: 'lorc/skeleton-key',
  eye: 'lorc/eyeball',
  wolf: 'lorc/wolf-head',
};
const root = 'https://raw.githubusercontent.com/game-icons/icons/master/';
await fs.mkdir('public/art/game-icons', { recursive: true });
const entries = await Promise.all(
  Object.entries(choices).map(async ([id, path]) => {
    const response = await fetch(root + path + '.svg');
    if (!response.ok) throw Error(`${path}: ${response.status}`);
    const svg = await response.text();
    if (
      !svg.includes('<svg') ||
      /<script|<foreignObject|href=|onload=/i.test(svg)
    )
      throw Error('Unexpected SVG content');
    await fs.writeFile(`public/art/game-icons/${id}.svg`, svg);
    const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((d) => d !== 'M0 0h512v512H0z');
    if (!paths.length) throw Error('Missing vector paths');
    return [
      id,
      {
        author: path.split('/')[0],
        source: `https://game-icons.net/1x1/${path}.html`,
        paths,
      },
    ];
  }),
);
const license = await fetch(root + 'license.txt');
if (!license.ok) throw Error('License unavailable');
await fs.writeFile('public/art/game-icons/LICENSE.txt', await license.text());
await fs.writeFile(
  'lib/item-art.json',
  JSON.stringify(Object.fromEntries(entries), null, 2) + '\n',
);
console.log(
  `Saved ${entries.length} icons, source metadata and original license.`,
);
