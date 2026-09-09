import { useState, useMemo, useSyncExternalStore } from 'react';
import { RotateCcw, Save, Undo2 } from 'lucide-react';
import {
  CHECKPOINT_SAVE_KEY,
  makeCheckpoint,
  readCheckpoint,
  playtestPreset,
  playtestPresets,
  createHauntPlaytest,
} from '../lib/playtest.mjs';

function subscribe(listener) {
  window.addEventListener('storage', listener);
  window.addEventListener('house-checkpoint', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('house-checkpoint', listener);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(CHECKPOINT_SAVE_KEY);
  } catch {
    return null;
  }
}
const serverSnapshot = () => null;

export function PlaytestPresetPicker({ scenario, value, onChange }) {
  const options = playtestPresets(scenario);
  const selected = options.find((p) => p.id === value) || options[0];
  return (
    <label className="playtest-preset-picker">
      <span>测试场景</span>
      <select value={selected.id} onChange={(e) => onChange(e.target.value)}>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <small>{selected.description}</small>
    </label>
  );
}

export default function PlaytestControls({ game, onRestore, network = false }) {
  const [message, setMessage] = useState('');
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const checkpoint = useMemo(() => readCheckpoint(raw, game), [raw, game]);
  if (game.playtest?.mode !== 'haunt') return null;
  const preset = playtestPreset(game);
  return (
    <section className="playtest-controls" aria-label="快速测试工具">
      <div>
        <strong>测试场景 · {preset?.label || '作祟开局'}</strong>
        <p>{preset?.description}</p>
      </div>
      {network ? (
        <small>联机测试场景由房主在开局时选择。</small>
      ) : (
        <div className="playtest-control-buttons">
          <button
            className="secondary-button"
            disabled={game.phase === 'over'}
            onClick={() => {
              try {
                localStorage.setItem(CHECKPOINT_SAVE_KEY, makeCheckpoint(game));
                window.dispatchEvent(new Event('house-checkpoint'));
                setMessage(
                  `已保存第 ${game.round} 回合的测试点；再次保存会替换这个测试点。`,
                );
              } catch {
                setMessage('测试点保存失败，请检查浏览器存储是否可用。');
              }
            }}
          >
            <Save size={15} />
            保存测试点
          </button>
          <button
            className="secondary-button"
            disabled={!checkpoint}
            title="还原此测试局保存的状态与骰子，撤销保存后的操作"
            onClick={() => {
              onRestore(structuredClone(checkpoint));
              setMessage('已回到测试点，骰子和对局状态一并还原。');
            }}
          >
            <Undo2 size={15} />
            回到测试点
          </button>
          <button
            className="secondary-button"
            title="重新开始相同的测试场景"
            onClick={() => {
              onRestore(
                createHauntPlaytest(
                  game.scenario,
                  game.playtest.seed,
                  game.count,
                  game.playtest.focus || 'basic',
                ),
              );
              setMessage('已重置为相同的测试场景。');
            }}
          >
            <RotateCcw size={15} />
            重置当前场景
          </button>
        </div>
      )}
      {!network && (
        <small>
          {checkpoint
            ? `测试点：第 ${checkpoint.round} 回合 · 已保存`
            : '尚无此开局的测试点。先保存，再尝试不同操作。'}{' '}
          可在出现结果前保存，反复验证同一步。
        </small>
      )}
      {message && <output>{message}</output>}
    </section>
  );
}
