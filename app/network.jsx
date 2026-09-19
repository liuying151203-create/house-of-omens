'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Cloud,
  Copy,
  Link,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { HEROES } from '@/lib/game-data.mjs';
import { createRemoteTransport } from '@/lib/network/remote-transport.mjs';
import { remoteRoomVisible } from '@/lib/network/remote-rollout.mjs';
import { gameModeLabel } from '../lib/game-view.mjs';
import { PlaytestPresetPicker } from './playtest-controls';

const SESSION = 'hillhouse-network-session-v2';
const LEGACY_SESSION = 'hillhouse-network-session';

function validSession(value) {
  if (!value?.key || !/^[A-Z0-9]{6}$/.test(value.code || '')) return null;
  return {
    code: value.code,
    key: value.key,
    kind: value.kind === 'remote' ? 'remote' : 'local',
  };
}

export function buildRemoteInviteUrl(location, code) {
  const url = new URL(location.href);
  url.searchParams.set('network', 'remote');
  url.searchParams.set('join', code);
  url.hash = '';
  return url.href;
}

export function networkStatusLabel(kind, state) {
  if (state === 'expired') return '房间已过期';
  if (state === 'upgrade_required') return '需要刷新版本';
  if (state === 'connected')
    return kind === 'remote' ? '云端已同步' : '局域网已同步';
  if (state === 'connecting') return '正在连接';
  return '正在重连';
}

export function useNetwork(setGame) {
  const [session, setSession] = useState(null),
    [room, setRoom] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connectionState, setConnectionState] = useState('idle'),
    [preferredKind, setPreferredKind] = useState(null),
    [retrySerial, setRetrySerial] = useState(0);
  const sequence = useRef(-1),
    sessionRef = useRef(null),
    roomRef = useRef(null),
    commandSerial = useRef(0),
    remoteTransport = useRef(null);

  const accept = useCallback(
    (next) => {
      if (next.revision <= sequence.current) return;
      sequence.current = next.revision;
      roomRef.current = next;
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

  function getRemoteTransport() {
    remoteTransport.current ||= createRemoteTransport();
    return remoteTransport.current;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const restored =
          validSession(JSON.parse(sessionStorage.getItem(SESSION))) ||
          validSession(JSON.parse(sessionStorage.getItem(LEGACY_SESSION)));
        if (restored) {
          sessionRef.current = restored;
          setPreferredKind(restored.kind);
          setConnectionState('connecting');
          setSession(restored);
        }
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    if (session.kind === 'remote') {
      const transport = getRemoteTransport();
      return transport.subscribe(session, {
        revision: sequence.current,
        onSnapshot: (next) => {
          accept(next);
          setError('');
        },
        onStatus: (status) => {
          setConnectionState(status);
          if (status === 'connected') setError('');
        },
        onError: (nextError) => {
          setError(nextError.message || '连接中断，正在尝试重连…');
          if (nextError.code === 'room_not_found') {
            setConnectionState('expired');
            transport.close();
          } else if (nextError.code === 'upgrade_required') {
            setConnectionState('upgrade_required');
            transport.close();
          }
        },
      });
    }

    let stopped = false;
    async function poll() {
      try {
        const response = await fetch('/api/rooms/' + session.code, {
            headers: { Authorization: 'Bearer ' + session.key },
          }),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!stopped) {
          accept(data);
          setConnectionState('connected');
          setError('');
        }
      } catch (nextError) {
        if (!stopped) {
          setConnectionState('reconnecting');
          setError(nextError.message || '连接中断，正在尝试重连…');
        }
      }
    }
    void poll();
    const timer = setInterval(poll, 1200);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session, accept, retrySerial]);

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
    if (!response.ok) {
      const nextError = new Error(result.error || '操作未完成');
      nextError.code = result.code;
      throw nextError;
    }
    return result;
  }

  async function connect(kind, mode, data) {
    if (busy) return;
    setBusy(true);
    setError('');
    setConnectionState('connecting');
    try {
      if (window.location.protocol === 'file:')
        throw new Error(
          kind === 'remote'
            ? '请从已部署的游戏网址打开远程联机。'
            : '请通过游戏主机网址打开局域网联机。',
        );
      const result =
          kind === 'remote'
            ? await getRemoteTransport()[mode](data)
            : await request(
                mode === 'create' ? '/api/rooms' : '/api/join',
                data,
              ),
        nextSession = { code: result.code, key: result.key, kind };
      sequence.current = -1;
      roomRef.current = null;
      sessionRef.current = nextSession;
      setPreferredKind(kind);
      setSession(nextSession);
      try {
        sessionStorage.setItem(SESSION, JSON.stringify(nextSession));
        sessionStorage.removeItem(LEGACY_SESSION);
      } catch {}
      accept(result);
      if (kind === 'local') setConnectionState('connected');
    } catch (nextError) {
      setConnectionState('idle');
      setError(nextError.message || '联机操作未完成。');
    } finally {
      setBusy(false);
    }
  }

  async function update(data) {
    const currentSession = sessionRef.current,
      currentRoom = roomRef.current;
    if (!currentSession || busy || !currentRoom) return;
    setBusy(true);
    try {
      const commandId =
          globalThis.crypto?.randomUUID?.() ||
          `${Date.now().toString(36)}-${(++commandSerial.current).toString(36)}`,
        command = {
          ...data,
          revision: currentRoom.revision,
          commandId,
        },
        result =
          currentSession.kind === 'remote'
            ? await getRemoteTransport().command(currentSession, command)
            : await request(
                '/api/rooms/' + currentSession.code,
                command,
                currentSession.key,
              );
      if (sessionRef.current === currentSession) {
        if (result?.game || result?.players) accept(result);
        setError('');
      }
    } catch (nextError) {
      setError(nextError.message || '操作未完成。');
      if (nextError.code === 'room_not_found') setConnectionState('expired');
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    if (!sessionRef.current) return;
    setError('');
    setConnectionState('connecting');
    remoteTransport.current?.close();
    setRetrySerial((value) => value + 1);
  }

  function leave() {
    remoteTransport.current?.close();
    setSession(null);
    sessionRef.current = null;
    setRoom(null);
    roomRef.current = null;
    setConnectionState('idle');
    setError('');
    sequence.current = -1;
    try {
      sessionStorage.removeItem(SESSION);
      sessionStorage.removeItem(LEGACY_SESSION);
    } catch {}
    setGame(null);
  }

  return {
    session,
    room,
    error,
    busy,
    connected: connectionState === 'connected',
    connectionState,
    kind: session?.kind || null,
    preferredKind,
    connect,
    update,
    retry,
    leave,
  };
}

export function NetworkLobby({ net, scenario, count, onClose }) {
  const [playtestFocus, setPlaytestFocus] = useState('basic'),
    [mode, setMode] = useState('local'),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [addresses, setAddresses] = useState([]),
    [copied, setCopied] = useState(''),
    [rollout, setRollout] = useState('preview'),
    [remoteOptIn, setRemoteOptIn] = useState(false);
  const activeMode = net.session?.kind || mode,
    room = net.room,
    isRemote = activeMode === 'remote',
    showRemote =
      net.session?.kind === 'remote' || remoteRoomVisible(rollout, remoteOptIn),
    inviteUrl =
      room && isRemote && typeof window !== 'undefined'
        ? buildRemoteInviteUrl(window.location, room.code)
        : '';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search),
      remoteRequested = params.get('network') === 'remote',
      invitedCode = params.get('join')?.toUpperCase(),
      validCode = /^[A-Z0-9]{6}$/.test(invitedCode || '');
    const timer = setTimeout(() => {
      if (remoteRequested) {
        setRemoteOptIn(true);
        setMode('remote');
        if (validCode) setCode(invitedCode);
      }
    }, 0);
    let cancelled = false;
    fetch('/api/remote/availability')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && ['off', 'preview', 'on'].includes(data.stage))
          setRollout(data.stage);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (activeMode !== 'local') {
      return;
    }
    let cancelled = false;
    fetch('/api/network-info')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAddresses(data.addresses || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeMode]);

  function copy(value, type) {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(type);
        setTimeout(() => setCopied(''), 1800);
      })
      .catch(() => {});
  }

  return (
    <section className="network-lobby">
      <div className="workshop-heading network-heading">
        <div>
          <span className="eyebrow">GATHER AROUND THE TABLE</span>
          <h1>多人联机</h1>
          <p>
            {gameModeLabel({
              scenario: room?.scenario || scenario,
              automaticHaunt: (room?.scenario || scenario) === 'mystery',
              phase: 'explore',
            })}
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => {
            if (net.session) net.leave();
            onClose();
          }}
        >
          <ArrowLeft size={17} />
          返回单人
        </button>
      </div>

      <div
        className={`network-mode-switch ${showRemote ? '' : 'network-mode-single'}`}
        aria-label="联机方式"
      >
        {showRemote && (
          <button
            aria-pressed={activeMode === 'remote'}
            disabled={!!net.session}
            onClick={() => setMode('remote')}
          >
            <Cloud size={18} />
            <span>
              远程房间
              <small>跨网络 · 云端保存 24 小时</small>
            </span>
          </button>
        )}
        <button
          aria-pressed={activeMode === 'local'}
          disabled={!!net.session}
          onClick={() => setMode('local')}
        >
          <Wifi size={18} />
          <span>
            局域网房间
            <small>同一 Wi-Fi · 主机临时保存</small>
          </span>
        </button>
      </div>

      {activeMode === 'local' && addresses.length > 0 && (
        <div className="lan-addresses">
          <strong>局域网地址</strong>
          {addresses.map((address) => (
            <div key={address}>
              <a href={address}>{address}</a>
              <button
                className="icon-button"
                aria-label="复制局域网地址"
                title="复制局域网地址"
                onClick={() => copy(address, address)}
              >
                <Copy size={16} />
              </button>
              {copied === address && <small>已复制</small>}
            </div>
          ))}
        </div>
      )}

      {!room ? (
        <div className="network-join">
          <label>
            你的名字
            <input
              value={name}
              maxLength={24}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              placeholder="探险者"
            />
          </label>
          <button
            className="gold-button"
            disabled={
              net.busy || !!net.session || (isRemote && rollout === 'off')
            }
            onClick={() =>
              net.connect(activeMode, 'create', { name, scenario, count })
            }
          >
            {isRemote ? <Cloud size={18} /> : <Wifi size={18} />}
            创建{isRemote ? '远程' : '局域网'}房间 · {count} 个角色
          </button>
          {isRemote && rollout === 'off' && (
            <p className="network-note">
              远程房间暂不开放创建，已有房间仍可加入。
            </p>
          )}
          <div className="network-divider">
            <span>或加入已有房间</span>
          </div>
          <label>
            六位房间码
            <input
              value={code}
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              onChange={(event) =>
                setCode(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                )
              }
              placeholder="ABC123"
            />
          </label>
          <button
            className="secondary-button"
            disabled={net.busy || code.length !== 6 || !!net.session}
            onClick={() => net.connect(activeMode, 'join', { name, code })}
          >
            <Link size={18} />
            加入{isRemote ? '远程' : '局域网'}房间
          </button>
        </div>
      ) : (
        <>
          <div className="room-code">
            <span>房间码</span>
            <strong>{room.code}</strong>
            <button
              className="icon-button"
              aria-label="复制房间码"
              title="复制房间码"
              onClick={() => copy(room.code, 'code')}
            >
              <Copy size={17} />
            </button>
            {isRemote && (
              <button
                className="secondary-button invite-copy"
                onClick={() => copy(inviteUrl, 'invite')}
              >
                <Link size={16} />
                复制邀请链接
              </button>
            )}
            <span className="room-player-count">
              {room.players.length} 位玩家
            </span>
            {copied && ['code', 'invite'].includes(copied) && (
              <output className="copy-confirmation">已复制</output>
            )}
          </div>

          <output
            className={`network-connection connection-${net.connectionState}`}
          >
            {net.connected ? (
              <ShieldCheck size={17} />
            ) : (
              <RefreshCw size={17} />
            )}
            <span>{networkStatusLabel(activeMode, net.connectionState)}</span>
            {!net.connected &&
              !['expired', 'upgrade_required'].includes(
                net.connectionState,
              ) && (
                <button
                  className="icon-button"
                  aria-label="立即重连"
                  title="立即重连"
                  onClick={net.retry}
                >
                  <RefreshCw size={16} />
                </button>
              )}
          </output>

          <div className="network-seats">
            {HEROES.slice(0, room.count).map((hero, index) => {
              const owner = room.players.find(
                (player) => player.id === room.seats[index],
              );
              return (
                <button
                  key={hero.name}
                  className={
                    'network-seat ' + (owner?.id === room.you ? 'mine' : '')
                  }
                  disabled={net.busy || net.connectionState === 'expired'}
                  onClick={() => net.update({ type: 'seat', seat: index })}
                  title={
                    owner?.id === room.you
                      ? `${hero.name}由你控制`
                      : owner
                        ? `与${owner.name}交换角色`
                        : `改选${hero.name}`
                  }
                >
                  <span style={{ color: hero.color }}>{hero.mark}</span>
                  <strong>{hero.name}</strong>
                  <small>
                    {owner
                      ? owner.name + (owner.id === room.you ? ' · 你' : '')
                      : '空位 · 房主代管'}
                  </small>
                  {owner && owner.id !== room.you && (
                    <span className="seat-swap-hint">
                      <ArrowLeftRight size={13} />
                      交换
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {room.you === room.hostId ? (
            <div className="network-start-actions">
              {room.scenario !== 'mystery' && (
                <PlaytestPresetPicker
                  scenario={room.scenario}
                  value={playtestFocus}
                  onChange={setPlaytestFocus}
                />
              )}
              <button
                className="gold-button"
                disabled={
                  net.busy ||
                  room.players.length < 2 ||
                  net.connectionState === 'expired'
                }
                onClick={() => net.update({ type: 'start' })}
              >
                全员入座，开始探索
              </button>
              {room.scenario !== 'mystery' && (
                <button
                  className="secondary-button"
                  disabled={
                    net.busy ||
                    room.players.length < 2 ||
                    net.connectionState === 'expired'
                  }
                  onClick={() =>
                    net.update({
                      type: 'start',
                      hauntPlaytest: true,
                      playtestFocus:
                        room.scenario === 'werewolf' ? playtestFocus : 'basic',
                    })
                  }
                >
                  定向测试 · 直接进入作祟
                </button>
              )}
            </div>
          ) : (
            <p className="network-waiting">等待房主开始游戏…</p>
          )}
        </>
      )}

      {net.error && <output className="network-error">{net.error}</output>}
      {net.connectionState === 'expired' && (
        <button className="secondary-button" onClick={net.leave}>
          返回并加入新房间
        </button>
      )}
      <p className="network-note">
        {isRemote
          ? '远程房间会在最后一次操作 24 小时后过期。刷新页面会恢复当前身份。'
          : '局域网房间由主机临时保存，主机程序关闭后房间消失。'}
      </p>
    </section>
  );
}
