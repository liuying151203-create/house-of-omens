'use client';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  Copy,
  Download,
  Upload,
  Trash2,
  Save,
  RotateCw,
} from 'lucide-react';
import {
  CATALOG,
  CATEGORIES,
  catalogName,
  validateDraft,
} from '@/lib/catalog.mjs';
import { FLOORS, TRAITS } from '@/lib/game-data.mjs';
const KEY = 'hillhouse-workshop-v1';
export default function Workshop({ onClose, TileFace }) {
  const [category, setCategory] = useState('rooms'),
    [query, setQuery] = useState(''),
    [drafts, setDrafts] = useState([]),
    [selected, setSelected] = useState(null),
    [edit, setEdit] = useState(null),
    [message, setMessage] = useState(''),
    [onlyDrafts, setOnlyDrafts] = useState(false),
    [rotation, setRotation] = useState(0);
  const upload = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) setDrafts(validateDraft(JSON.parse(raw)));
      } catch {
        setMessage('本地草稿无法读取，可以重新导入素材包。');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function persist(next) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, entries: next }));
      setDrafts(next);
      return true;
    } catch {
      setMessage('草稿未能保存，请导出备份后重试。');
      return false;
    }
  }
  const entries = [
    ...(!onlyDrafts
      ? CATALOG[category].map((data) => ({
          id: category + ':' + data.id,
          category,
          data,
          builtin: true,
        }))
      : []),
    ...drafts.filter((d) => d.category === category),
  ].filter((row) =>
    [catalogName(row.data), row.data.story, row.data.description]
      .join(' ')
      .includes(query),
  );
  function choose(row) {
    setSelected(row);
    setEdit(structuredClone(row.data));
    setRotation(0);
    setMessage('');
  }
  function duplicate() {
    const id =
        'diy-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6),
      data = { ...structuredClone(edit), id };
    if (data.title) data.title += ' · 自定义';
    else data.name += ' · 自定义';
    const row = { id, category, data };
    if (persist([...drafts, row])) {
      choose(row);
      setMessage('已创建可编辑副本。草稿暂不进入正式对局。');
    }
  }
  function save() {
    const row = { ...selected, data: edit };
    try {
      const next = drafts.map((d) => (d.id === row.id ? row : d));
      validateDraft({ version: 1, entries: next });
      if (persist(next)) {
        setSelected(row);
        setMessage('草稿已保存。');
      }
    } catch (e) {
      setMessage(e.message);
    }
  }
  function exportPack() {
    const blob = new Blob(
        [
          JSON.stringify(
            { version: 1, name: '黑松岭自定义素材', entries: drafts },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = '黑松岭-DIY素材包.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importPack(e) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2_000_000) throw new Error('素材包不能超过 2 MB。');
      const incoming = validateDraft(JSON.parse(await file.text())),
        merged = [...drafts];
      for (const row of incoming) {
        let next = row;
        if (merged.some((d) => d.id === row.id))
          next = {
            ...row,
            id: 'diy-' + Date.now() + '-' + Math.random().toString(16).slice(2),
          };
        merged.push(next);
      }
      validateDraft({ version: 1, entries: merged });
      if (persist(merged))
        setMessage(
          '已导入 ' + incoming.length + ' 个草稿，同名编号保留为副本。',
        );
    } catch (err) {
      setMessage(err.message);
    }
    e.target.value = '';
  }
  function setField(k, v) {
    setEdit((x) => ({ ...x, [k]: v }));
  }
  const readonly = selected?.builtin;
  return (
    <section className="workshop">
      <div className="workshop-heading">
        <div>
          <span className="eyebrow">THE COMPONENT WORKSHOP</span>
          <h1>宅邸素材室</h1>
          <p>查看完整组件，制作自己的副本。草稿独立保存，暂不替换对局规则。</p>
        </div>
        <button className="secondary-button" onClick={onClose}>
          <ArrowLeft size={16} />
          返回游戏
        </button>
      </div>
      <div className="workshop-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称或说明"
            aria-label="搜索素材"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyDrafts}
            onChange={(e) => setOnlyDrafts(e.target.checked)}
          />
          仅看 DIY 草稿
        </label>
        <button className="secondary-button" onClick={exportPack}>
          <Download size={16} />
          导出草稿 ({drafts.length})
        </button>
        <button
          className="secondary-button"
          onClick={() => upload.current.click()}
        >
          <Upload size={16} />
          导入素材包
        </button>
        <input
          hidden
          ref={upload}
          type="file"
          accept="application/json,.json"
          onChange={importPack}
        />
      </div>
      <div className="catalog-tabs">
        {Object.entries(CATEGORIES).map(([id, name]) => (
          <button
            key={id}
            aria-pressed={category === id}
            onClick={() => {
              setCategory(id);
              setSelected(null);
              setEdit(null);
            }}
          >
            {name}
            <small>{CATALOG[id].length}</small>
          </button>
        ))}
      </div>
      {message && <output className="workshop-message">{message}</output>}
      <div className="workshop-body">
        <div className="catalog-grid">
          {entries.length === 0 && (
            <p className="empty-inventory">
              没有符合条件的素材。选择内置组件，点击“复制为 DIY 草稿”开始制作。
            </p>
          )}
          {entries.map((row) => (
            <button
              key={row.id}
              className={
                'catalog-card ' + (selected?.id === row.id ? 'selected' : '')
              }
              onClick={() => choose(row)}
            >
              {category === 'rooms' ? (
                <span className="catalog-tile">
                  <TileFace tile={row.data} />
                </span>
              ) : (
                <span
                  className="catalog-emblem"
                  style={{ color: row.data.color }}
                >
                  {row.data.mark ||
                    { event: '✦', item: '◇', omen: '◉', scenarios: 'Ⅹ' }[
                      category
                    ] ||
                    '人'}
                </span>
              )}
              <strong>{catalogName(row.data)}</strong>
              <small>
                {row.builtin
                  ? row.data.starter
                    ? '起始板块'
                    : '内置组件'
                  : 'DIY 草稿'}
              </small>
            </button>
          ))}
        </div>
        <aside className="catalog-detail">
          {!edit ? (
            <div className="empty-inventory">
              选择一张卡牌、房间或棋子，查看规则及制作副本。
            </div>
          ) : (
            <>
              <div className="mini-heading">
                <span>{CATEGORIES[category]}</span>
                <span>{readonly ? '内置 · 只读' : 'DIY · 可编辑'}</span>
              </div>
              <label>
                名称
                <input
                  value={catalogName(edit)}
                  disabled={readonly}
                  onChange={(e) =>
                    setField(edit.title ? 'title' : 'name', e.target.value)
                  }
                  maxLength={100}
                />
              </label>
              {category === 'rooms' && (
                <>
                  <div className="catalog-tile detail-tile">
                    <TileFace tile={edit} rotation={rotation} />
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setRotation((r) => (r + 1) % 4)}
                  >
                    <RotateCw size={15} />
                    旋转预览
                  </button>
                  <fieldset disabled={readonly}>
                    <legend>允许楼层</legend>
                    {FLOORS.map((f) => (
                      <label key={f.id}>
                        <input
                          type="checkbox"
                          checked={edit.floors.includes(f.id)}
                          onChange={(e) =>
                            setField(
                              'floors',
                              e.target.checked
                                ? [...edit.floors, f.id]
                                : edit.floors.filter((x) => x !== f.id),
                            )
                          }
                        />
                        {f.name}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset disabled={readonly}>
                    <legend>门的位置（原始朝向）</legend>
                    {['北', '东', '南', '西'].map((n, i) => (
                      <label key={n}>
                        <input
                          type="checkbox"
                          checked={edit.doors.includes(i)}
                          onChange={(e) =>
                            setField(
                              'doors',
                              e.target.checked
                                ? [...edit.doors, i]
                                : edit.doors.filter((x) => x !== i),
                            )
                          }
                        />
                        {n}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    抽牌图标
                    <select
                      value={edit.icon || ''}
                      disabled={readonly}
                      onChange={(e) => setField('icon', e.target.value || null)}
                    >
                      <option value="">无</option>
                      <option value="event">事件</option>
                      <option value="item">物品</option>
                      <option value="omen">预兆</option>
                    </select>
                  </label>
                  <label>
                    房间插画
                    <select
                      value={edit.art}
                      disabled={readonly}
                      onChange={(e) => setField('art', Number(e.target.value))}
                    >
                      {[
                        '门厅',
                        '书库',
                        '餐厅',
                        '礼拜堂',
                        '卧室',
                        '温室',
                        '地窖',
                        '锅炉房',
                        '镜廊',
                      ].map((n, i) => (
                        <option value={i} key={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  {edit.special && (
                    <p>
                      房间特性：
                      {edit.special === 'stairsDown'
                        ? '连通地下室'
                        : edit.special}
                    </p>
                  )}
                </>
              )}
              {['story', 'description', 'effect']
                .filter((k) => typeof edit[k] === 'string')
                .map((k) => (
                  <label key={k}>
                    {
                      {
                        story: '故事',
                        description: '用途',
                        effect: '效果说明',
                      }[k]
                    }
                    <textarea
                      rows={4}
                      value={edit[k]}
                      disabled={readonly}
                      onChange={(e) => setField(k, e.target.value)}
                      maxLength={6000}
                    />
                  </label>
                ))}
              {edit.success && (
                <div className="card-rules">
                  <strong>
                    {TRAITS[edit.trait]}检定 · {edit.threshold}+
                  </strong>
                  <p>成功：{edit.success.text}</p>
                  <p>失败：{edit.failure.text}</p>
                  <small>
                    检定与效果逻辑保留源卡规则；本阶段可编辑文案及房间结构。
                  </small>
                </div>
              )}
              {edit.effect && typeof edit.effect === 'object' && (
                <p>{edit.effect.text}</p>
              )}
              {edit.tracks &&
                Object.entries(edit.tracks).map(([k, track]) => (
                  <div className="catalog-track" key={k}>
                    <b>{TRAITS[k]}</b>
                    {track.map((n, i) => (
                      <span
                        className={i === edit.start[k] ? 'current' : ''}
                        key={i}
                      >
                        {i === 0 ? '☠' : n}
                      </span>
                    ))}
                  </div>
                ))}
              {edit.objective && (
                <div className="card-rules">
                  <strong>{edit.objective}</strong>
                  <p>{edit.haunt}</p>
                  <small>基础倒计时：{edit.limit} 回合</small>
                </div>
              )}
              {edit.quantity && <p>基础数量：{edit.quantity}</p>}
              <button className="secondary-button" onClick={duplicate}>
                <Copy size={16} />
                复制为 DIY 草稿
              </button>
              {!readonly && (
                <>
                  <button className="gold-button" onClick={save}>
                    <Save size={16} />
                    保存草稿
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (persist(drafts.filter((d) => d.id !== selected.id))) {
                        setSelected(null);
                        setEdit(null);
                        setMessage('已删除该草稿。');
                      }
                    }}
                  >
                    <Trash2 size={15} />
                    删除草稿
                  </button>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
