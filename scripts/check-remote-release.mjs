import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const rollbackRef = process.argv[2] || 'HEAD';
const versionFiles = [
  ['lib/network/room-persistence.mjs', 'REMOTE_ROOM_SCHEMA_VERSION'],
  ['lib/network/room-domain.mjs', 'ROOM_STATE_VERSION'],
  ['lib/network/network-protocol.mjs', 'NETWORK_PROTOCOL_VERSION'],
  ['lib/engine/migrations.mjs', 'CURRENT_GAME_VERSION'],
];

function exportedVersion(source, file, name) {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (
      !statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    )
      continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        ts.isNumericLiteral(declaration.initializer)
      )
        return Number(declaration.initializer.text);
    }
  }
  throw new Error(`${file} must export a numeric ${name}`);
}

for (const [file, name] of versionFiles) {
  const current = exportedVersion(
      await readFile(path.join(root, file), 'utf8'),
      file,
      name,
    ),
    rollbackSource = execFileSync('git', ['show', `${rollbackRef}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    previous = exportedVersion(rollbackSource, file, name);
  assert.equal(
    previous,
    current,
    `${name} changed from ${previous} in ${rollbackRef} to ${current}; this rollback target cannot safely reopen every current room`,
  );
}

const config = JSON.parse(
  await readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'),
);
const bindings = new Map(
  config.durable_objects?.bindings?.map((binding) => [
    binding.name,
    binding.class_name,
  ]),
);
assert.equal(bindings.get('GAME_ROOMS'), 'GameRoom');
assert.equal(bindings.get('REMOTE_RATE_LIMITERS'), 'RemoteRateLimiter');
assert.deepEqual(
  config.migrations?.map((migration) => ({
    tag: migration.tag,
    classes: migration.new_sqlite_classes,
  })),
  [
    { tag: 'remote-rooms-v1', classes: ['GameRoom'] },
    { tag: 'remote-rate-limits-v1', classes: ['RemoteRateLimiter'] },
  ],
  'Durable Object class lifecycle changed; inspect deployment and rollback compatibility before release',
);
await stat(path.join(root, 'dist/server/index.js'));
await stat(path.join(root, 'dist/client'));

console.log(
  `Remote release check passed: room, protocol and game versions match ${rollbackRef}; SQLite Durable Object bindings are intact.`,
);
