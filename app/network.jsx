'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { HEROES } from '@/lib/game-data.mjs';
import { gameModeLabel } from '../lib/game-view.mjs';
import { PlaytestPresetPicker } from './playtest-controls';
const SESSION = 'hillhouse-network-session';
export function useNetwork(setGame) {
  const [session, setSession] = useState(null),
    [room, setRoom] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false);
  const sequence = useRef(-1),
    sessionRef = useRef(null),
    commandSerial = useRef(0);
  const accept = useCallback(
    (next) => {
      setConnected(true);
      if (next.revision <= sequence.current) return;
      sequence.current = next.revision;
      setRoom(next);
      if (next.game)
        setGame((prev) => {
          const latestMovement = next.game.events?.findLast(
              (event) => event.type === 'MovementQueued',
            ),
            previousMovement = prev?.events?.findLast(
              (event) => event.type === 'MovementQueued',
            );
          return {
            ...next.game,
            viewFloor:
              prev &&
              latestMovement?.id === previousMovement?.id &&
              prev.active === next.game.active &&
              prev.round === next.game.round &&
              prev.heroes[prev.active]?.pos ===
                next.game.heroes[next.game.active]?.pos
                ? prev.viewFloor
                : next.game.viewFloor,
          };
        });
    },
    [setGame],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = JSON.parse(sessionStorage.getItem(SESSION));
        if (raw?.key && raw?.code) {
          sessionRef.current = raw;
          setSession(raw);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    async function poll() {
      try {
        const r = await fetch('/api/rooms/' + session.code, {
            headers: { Authorization: 'Bearer ' + session.key },
          }),
          data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (!stopped) {
          accept(data);
        }
      } catch (e) {
        if (!stopped) {
          setConnected(false);
          setError(e.message || '连接中断，正在尝试重连…');
        }
      }
    }
    void poll();
    const timer = setInterval(poll, 1200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session, accept]);
  async function request(path, data, key) {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: 'Bearer ' + key } : {}),
      },
      body: JSON.stringify(data),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('联机需要通过游戏主机网址打开；离线文件仅支持单人。');
    }
    if (!response.ok) throw new Error(result.error || '操作未完成');
    return result;
  }
  async function connect(mode, data) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (window.location.protocol === 'file:')
        throw new Error(
          '请通过游戏主机网址打开联机；这个离线文件支持单人试玩和素材管理。',
        );
      const r = await request(
          mode === 'create' ? '/api/rooms' : '/api/join',
          data,
        ),
        s = { code: r.code, key: r.key };
      sequence.current = -1;
      sessionRef.current = s;
      setSession(s);
      try {
        sessionStorage.setItem(SESSION, JSON.stringify(s));
      } catch {}
      accept(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function update(data) {
    if (!session || busy || !room) return;
    setBusy(true);
    try {
      const expected = sessionRef.current;
      const commandId =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${(++commandSerial.current).toString(36)}`;
      const r = await request(
        '/api/rooms/' + session.code,
        { ...data, revision: room.revision, commandId },
        session.key,
      );
      if (sessionRef.current === expected) {
        accept(r);
        setError('');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function leave() {
    setSession(null);
    sessionRef.current = null;
    setRoom(null);
    setConnected(false);
    setError('');
    sequence.current = -1;
    try {
      sessionStorage.removeItem(SESSION);
    } catch {}
    setGame(null);
  }
  return { session, room, error, busy, connected, connect, update, leave };
}
export function NetworkLobby({ net, scenario, count, onClose }) {
  const [playtestFocus, setPlaytestFocus] = useState('basic');
  const [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [addresses, setAddresses] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/network-info')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAddresses(data.addresses || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const r = net.room;
  return (
    <section className="network-lobby">
      <div className="workshop-heading">
        <div>
          <span className="eyebrow">GATHER AROUND THE TABLE</span>
          <h1>一起进入宅邸</h1>
          <p>
            {gameModeLabel({
              scenario: r?.scenario || scenario,
              automaticHaunt: (r?.scenario || scenario) === 'mystery',
              phase: 'explore',
            })}
          </p>
          <p>局域网试玩 · 每人控制自己的角色，空位由房主代管。</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            if (net.session) net.leave();
            onClose();
          }}
        >
          返回单人
        </button>
      </div>
      {addresses.length > 0 && (
        <div className="lan-addresses">
          <strong>邀请同一 Wi-Fi 的朋友打开</strong>
          {addresses.map((address) => (
            <div key={address}>
              <a href={address}>{address}</a>
              <button
                className="text-button"
                onClick={() => {
                  navigator.clipboard?.writeText(address).catch(() => {});
                }}
              >
                复制网址
              </button>
            </div>
          ))}
          <small>打开网址后，再输入下面的房间码。</small>
        </div>
      )}
      {!r ? (
        <div className="network-join">
          <label>
            你的名字
            <input
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="探险者"
            />
          </label>
          <button
            className="gold-button"
            disabled={net.busy || !!net.session}
            onClick={() => net.connect('create', { name, scenario, count })}
          >
            创建房间 · {count} 个角色
          </button>
          <label>
            已有房间码
            <input
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="六位房间码"
            />
          </label>
          <button
            className="secondary-button"
            disabled={net.busy || code.length !== 6 || !!net.session}
            onClick={() => net.connect('join', { name, code })}
          >
            加入朋友的房间
          </button>
          <p>
            先让朋友打开同一台电脑提供的游戏网址，再输入房间码。仅在同一台主机上的房间码有效。
          </p>
        </div>
      ) : (
        <>
          <div className="room-code">
            房间码 <strong>{r.code}</strong>
            <button
              className="text-button"
              onClick={() => {
                navigator.clipboard?.writeText(r.code).catch(() => {});
              }}
            >
              复制
            </button>
            <span>{r.players.length} 位玩家已加入</span>
          </div>
          <p>
            点击空闲角色可以改选；点击其他玩家的角色会与对方交换位置。未被选择的角色由房主代管。
          </p>
          <div className="network-seats">
            {HEROES.slice(0, r.count).map((h, i) => {
              const owner = r.players.find((p) => p.id === r.seats[i]);
              return (
                <button
                  key={h.name}
                  className={
                    'network-seat ' + (owner?.id === r.you ? 'mine' : '')
                  }
                  disabled={net.busy}
                  onClick={() => net.update({ type: 'seat', seat: i })}
                  title={
                    owner?.id === r.you
                      ? `${h.name}由你控制`
                      : owner
                        ? `与${owner.name}交换角色`
                        : `改选${h.name}`
                  }
                >
                  <span style={{ color: h.color }}>{h.mark}</span>
                  <strong>{h.name}</strong>
                  <small>
                    {owner
                      ? owner.name + (owner.id === r.you ? ' · 你' : '')
                      : '空位 · 房主代管'}
                  </small>
                  {owner && owner.id !== r.you && (
                    <span className="seat-swap-hint">
                      <ArrowLeftRight size={13} />
                      交换
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {r.you === r.hostId ? (
            <div className="network-start-actions">
              {r.scenario !== 'mystery' && (
                <PlaytestPresetPicker
                  scenario={r.scenario}
                  value={playtestFocus}
                  onChange={setPlaytestFocus}
                />
              )}
              <button
                className="gold-button"
                disabled={net.busy || r.players.length < 2}
                onClick={() => net.update({ type: 'start' })}
              >
                全员入座，开始探索
              </button>
              {r.scenario !== 'mystery' && (
                <button
                  className="secondary-button"
                  disabled={net.busy || r.players.length < 2}
                  onClick={() =>
                    net.update({
                      type: 'start',
                      hauntPlaytest: true,
                      playtestFocus:
                        r.scenario === 'werewolf' ? playtestFocus : 'basic',
                    })
                  }
                >
                  定向测试 · 直接进入作祟
                </button>
              )}
            </div>
          ) : (
            <p>等待房主开始游戏…</p>
          )}
        </>
      )}
      {net.error && <output className="network-error">{net.error}</output>}
      {net.session && !net.connected && (
        <p>正在连接房间；重新连接会恢复当前对局。</p>
      )}
      <p className="network-note">
        这一阶段支持同一网络内联机与刷新重连。房间暂存于主机内存，主机程序关闭后消失。异地公网连接、账号和长期存档将在后续扩展。
      </p>
    </section>
  );
}
