'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Download, Upload, Save, Trash2 } from 'lucide-react';
import {
  builtinGameSets,
  GAME_SET_CATEGORIES,
  GAME_SET_CATALOG,
  GAME_SETS_STORAGE_KEY,
  validateGameSet,
  validateGameSetPack,
  validateGameSetLibrary,
} from '../lib/game-sets.mjs';
import { FLOORS } from '../lib/game-data.mjs';

export function useGameSets() {
  const [library, setLibrary] = useState({
    version: 1,
    gameSets: [],
    selectedId: 'classic',
  });
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(GAME_SETS_STORAGE_KEY);
        if (raw) setLibrary(validateGameSetLibrary(JSON.parse(raw)));
      } catch {
        setError(
          '本地游戏集无法读取，已使用经典预设。原数据未覆盖，可先导出浏览器数据备份。',
        );
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function persist(next) {
    try {
      const checked = validateGameSetLibrary(next);
      localStorage.setItem(GAME_SETS_STORAGE_KEY, JSON.stringify(checked));
      setLibrary(checked);
      setError('');
      return true;
    } catch (failure) {
      setError(`游戏集未保存：${failure.message}`);
      return false;
    }
  }
  const sets = [...builtinGameSets(), ...library.gameSets];
  return {
    ...library,
    sets,
    ready,
    error,
    selected: sets.find((set) => set.id === library.selectedId),
    select: (id) => persist({ ...library, selectedId: id }),
    save: (set) =>
      persist({
        ...library,
        gameSets: [
          ...library.gameSets.filter((entry) => entry.id !== set.id),
          set,
        ],
        selectedId: set.id,
      }),
    remove: (id) =>
      persist({
        ...library,
        gameSets: library.gameSets.filter((set) => set.id !== id),
        selectedId: library.selectedId === id ? 'classic' : library.selectedId,
      }),
    importSets: (sets) =>
      persist({
        ...library,
        gameSets: [...library.gameSets, ...sets],
        selectedId: sets.at(-1)?.id ?? library.selectedId,
      }),
  };
}

export function GameSetPicker({ controller, onManage }) {
  if (!controller) return null;
  return (
    <div className="game-set-picker">
      <label>
        本局游戏集
        <select
          aria-label="本局游戏集"
          value={controller.selectedId}
          disabled={!controller.ready}
          onChange={(event) => controller.select(event.target.value)}
        >
          {controller.sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>
      </label>
      <button className="text-button" onClick={onManage}>
        编辑／导入游戏集
      </button>
      {controller.error && <output role="alert">{controller.error}</output>}
    </div>
  );
}

export const GameSetSummary = ({ gameSet }) => (
  <p className="game-set-summary">
    游戏集：{gameSet?.name || '经典游戏集'}
    {gameSet && (
      <span>
        {' '}
        ·{' '}
        {Object.entries(GAME_SET_CATEGORIES)
          .map(([kind, name]) => `${name} ${gameSet.decks[kind].length}`)
          .join(' · ')}
      </span>
    )}
  </p>
);

// 局域网 HTTP 和离线页面不保证有 randomUUID；这里只需本地预设编号。
const freshId = () =>
  `set-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export default function GameSetManager({ controller, onClose, game }) {
  const [draft, setDraft] = useState(() =>
    structuredClone(controller.selected),
  );
  const [category, setCategory] = useState('item'),
    [query, setQuery] = useState('');
  const [message, setMessage] = useState(''),
    [dirty, setDirty] = useState(false);
  const [discardTarget, setDiscardTarget] = useState(null),
    [deleting, setDeleting] = useState(false);
  const upload = useRef(null);
  const builtin = ['classic', 'expanded'].includes(draft.id);
  function load(set) {
    setDraft(structuredClone(set));
    setDirty(false);
    setDeleting(false);
    setMessage('');
  }
  function leave(target) {
    if (dirty) setDiscardTarget(target);
    else if (target === 'close') onClose();
    else load(target);
  }
  function change(next) {
    setDraft(next);
    setDirty(true);
    setMessage('');
  }
  function save() {
    try {
      const checked = validateGameSet(draft);
      if (controller.save(checked)) {
        load(checked);
        setMessage('已保存，并选为下次开局的游戏集。');
      }
    } catch (error) {
      setMessage(error.message);
    }
  }
  function exportSet() {
    try {
      const checked = validateGameSet(draft),
        url = URL.createObjectURL(
          new Blob(
            [JSON.stringify({ version: 1, gameSets: [checked] }, null, 2)],
            { type: 'application/json' },
          ),
        ),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${checked.name.replace(/[<>:"/\\|?*]/g, '_')}-游戏集.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('已导出当前游戏集。');
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function importSets(event) {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 100_000) throw new Error('游戏集文件不能超过 100 KB。');
      const incoming = validateGameSetPack(JSON.parse(await file.text())).map(
        (set) => ({ ...set, id: freshId() }),
      );
      if (!incoming.length) throw new Error('文件内没有游戏集。');
      if (controller.importSets(incoming)) {
        load(incoming.at(-1));
        setMessage(`已导入 ${incoming.length} 个游戏集，保留原有预设。`);
      }
    } catch (error) {
      setMessage(error.message);
    }
    event.target.value = '';
  }
  const cards = GAME_SET_CATALOG[category].filter((card) =>
    `${card.name || card.title} ${card.description || ''} ${typeof card.effect === 'string' ? card.effect : ''}`.includes(
      query,
    ),
  );
  return (
    <section className="workshop game-set-manager" aria-label="游戏集管理">
      <div className="workshop-heading">
        <div>
          <span className="eyebrow">GAME SETS</span>
          <h1>游戏集</h1>
          <p>
            选择本局会抽到的卡牌。内置预设可复制后编辑，适用于所有现有剧本。
          </p>
          {game && (
            <>
              <GameSetSummary gameSet={game.gameSet} />
              <p>当前对局保持开局配置，编辑仅影响以后新开的游戏。</p>
            </>
          )}
        </div>
        <button className="secondary-button" onClick={() => leave('close')}>
          <ArrowLeft size={16} />
          返回
        </button>
      </div>
      {controller.error && (
        <output className="workshop-message" role="alert">
          {controller.error}
        </output>
      )}
      {message && <output className="workshop-message">{message}</output>}
      {discardTarget && (
        <div className="game-set-confirm" role="alert">
          <span>当前修改尚未保存。</span>
          <button
            className="secondary-button"
            onClick={() => setDiscardTarget(null)}
          >
            继续编辑
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              const target = discardTarget;
              setDiscardTarget(null);
              if (target === 'close') onClose();
              else load(target);
            }}
          >
            放弃修改并继续
          </button>
        </div>
      )}
      <div className="game-set-layout">
        <nav className="game-set-list" aria-label="已保存的游戏集">
          {controller.sets.map((set) => (
            <button
              key={set.id}
              className="secondary-button"
              aria-pressed={draft.id === set.id}
              onClick={() => leave(set)}
            >
              {set.name}
              {controller.selectedId === set.id && <small>下次开局</small>}
            </button>
          ))}
          <button
            className="secondary-button"
            disabled={dirty || !controller.ready}
            onClick={() => upload.current.click()}
          >
            <Upload size={16} />
            导入游戏集
          </button>
          <input
            ref={upload}
            type="file"
            hidden
            accept="application/json,.json"
            onChange={importSets}
          />
        </nav>
        <div className="game-set-editor">
          <div className="workshop-toolbar">
            <label>
              游戏集名称
              <input
                aria-label="游戏集名称"
                value={draft.name}
                disabled={builtin}
                maxLength={60}
                onChange={(event) =>
                  change({ ...draft, name: event.target.value })
                }
              />
            </label>
            <button
              className="secondary-button"
              disabled={dirty}
              onClick={() => {
                change({
                  ...structuredClone(draft),
                  id: freshId(),
                  name: `${draft.name.slice(0, 54)} · 副本`,
                });
              }}
            >
              <Copy size={16} />
              复制为自定义
            </button>
            <button className="secondary-button" onClick={exportSet}>
              <Download size={16} />
              导出游戏集
            </button>
            {!builtin && (
              <button className="gold-button" onClick={save}>
                <Save size={16} />
                保存游戏集
              </button>
            )}
            {!dirty && (
              <button
                className="secondary-button"
                onClick={() => {
                  if (controller.select(draft.id))
                    setMessage('已选为下次开局的游戏集。');
                }}
              >
                用于下次开局
              </button>
            )}
            {!builtin &&
              controller.gameSets.some((set) => set.id === draft.id) && (
                <button
                  className="secondary-button"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={16} />
                  删除
                </button>
              )}
          </div>
          {deleting && (
            <div className="game-set-confirm" role="alert">
              删除“{draft.name}”？已经开始的对局不受影响。
              <button
                className="secondary-button"
                onClick={() => setDeleting(false)}
              >
                取消
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  if (controller.remove(draft.id)) load(builtinGameSets()[0]);
                }}
              >
                确认删除
              </button>
            </div>
          )}
          <p>
            {builtin
              ? '内置预设只读，请先复制。'
              : '勾选卡牌后保存，每种卡牌最多一张。'}{' '}
            起始房间固定保留。银弹仅由熔铸获得。
          </p>
          <div className="catalog-tabs">
            {Object.entries(GAME_SET_CATEGORIES).map(([kind, label]) => (
              <button
                key={kind}
                aria-pressed={category === kind}
                onClick={() => {
                  setCategory(kind);
                  setQuery('');
                }}
              >
                {label}
                <small>{draft.decks[kind].length}</small>
              </button>
            ))}
          </div>
          <input
            className="game-set-search"
            aria-label="搜索游戏集卡牌"
            placeholder="搜索卡牌名称或效果"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="game-set-cards">
            {cards.map((card) => (
              <label
                key={card.id}
                aria-label={card.name || card.title}
                className={
                  draft.decks[category].includes(card.id) ? 'included' : ''
                }
              >
                <input
                  type="checkbox"
                  checked={draft.decks[category].includes(card.id)}
                  disabled={builtin}
                  onChange={(event) =>
                    change({
                      ...draft,
                      decks: {
                        ...draft.decks,
                        [category]: event.target.checked
                          ? [...draft.decks[category], card.id]
                          : draft.decks[category].filter(
                              (id) => id !== card.id,
                            ),
                      },
                    })
                  }
                />
                <span>
                  <strong>{card.name || card.title}</strong>
                  <small>
                    {card.supply ? '通用扩展' : '经典内容'}
                    {card.floors &&
                      ` · ${card.floors.map((floor) => FLOORS.find((entry) => entry.id === floor)?.name).join('／')}`}
                    {card.icon && ` · 抽${GAME_SET_CATEGORIES[card.icon]}`}
                  </small>
                  <span>
                    {card.description ||
                      (typeof card.effect === 'string'
                        ? card.effect
                        : card.effect?.text) ||
                      card.story}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
