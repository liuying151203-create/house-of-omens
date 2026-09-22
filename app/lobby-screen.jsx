import { useState } from 'react';
import { ArrowRight, RotateCcw, Users, FlaskConical, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { HEROES, SCENARIOS } from '../lib/game-data.mjs';
import { gameModeLabel } from '../lib/game-view.mjs';
import { PlaytestPresetPicker } from './playtest-controls';
import ExplorerEmblem from './explorer-emblem';
import { GameSetPicker } from './game-sets';

export default function LobbyScreen({
  count,
  setCount,
  choice,
  setChoice,
  saved,
  savedPlaytest,
  playtestFocus,
  setPlaytestFocus,
  onStart,
  onContinue,
  onTest,
  onNetwork,
  gameSets,
  onGameSets,
}) {
  const [dialog, setDialog] = useState(null);
  const scenario = SCENARIOS.find((s) => s.id === choice);
  return (
    <div className="entry-screen">
      <div className="entry-art" aria-hidden="true" />
      <section className="entry-content" aria-label="开始游戏">
        <span className="entry-kicker">HOUSE OF OMENS</span>
        <h1>预兆之屋</h1>
        <p className="entry-tagline">推开一扇门，揭开一个秘密。</p>
        <div className="entry-setup">
          <div className="entry-count">
            <span id="entry-count-label">探险队</span>
            <RadioGroup
              value={String(count)}
              onValueChange={(v) => setCount(Number(v))}
              aria-labelledby="entry-count-label"
              className="count-options"
            >
              {[3, 4, 5, 6].map((n) => (
                <label key={n} className={count === n ? 'count-selected' : ''}>
                  <RadioGroupItem value={String(n)} />
                  <span>{n}人</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="entry-party" aria-label="本局探险队">
            {HEROES.slice(0, count).map((hero, id) => (
              <span
                className="entry-person"
                key={hero.name}
                title={`${hero.name} · ${hero.role}`}
              >
                <ExplorerEmblem hero={{ ...hero, id }} />
                <span>{hero.name}</span>
              </span>
            ))}
          </div>
          <GameSetPicker controller={gameSets} onManage={onGameSets} />
          <button
            className="gold-button entry-start"
            disabled={gameSets && !gameSets.ready}
            onClick={onStart}
          >
            <span>{saved ? '新开一局' : '进入宅邸'}</span>
            <ArrowRight size={20} />
          </button>
          <div className="entry-secondary">
            {saved && (
              <button
                className="text-button"
                title={gameModeLabel(saved)}
                onClick={() => onContinue(saved)}
              >
                <RotateCcw size={16} />
                继续游戏
              </button>
            )}
            <button className="text-button" onClick={onNetwork}>
              <Users size={16} />
              联机游戏
            </button>
          </div>
          {choice !== 'mystery' && (
            <button
              className="entry-mode"
              onClick={() => setDialog('test')}
              title="修改定向剧本"
            >
              定向剧本 · {scenario.title}
            </button>
          )}
        </div>
      </section>
      <footer className="entry-footer">
        <span>三层宅邸 · 四个午夜故事</span>
        <div>
          <button onClick={() => setDialog('test')}>
            <FlaskConical size={15} />
            定向测试
          </button>
          <button onClick={() => setDialog('credits')}>素材鸣谢</button>
        </div>
      </footer>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="entry-dialog" showCloseButton={false}>
          <button
            className="entry-close icon-button"
            aria-label="关闭弹窗"
            onClick={() => setDialog(null)}
          >
            <X size={20} />
          </button>
          <DialogTitle>
            {dialog === 'credits' ? '素材鸣谢' : '定向测试'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'credits'
              ? '美术来源与使用许可'
              : '选择剧本，直接进入作祟。测试进度独立保存。'}
          </DialogDescription>
          {dialog === 'test' ? (
            <>
              <div className="entry-scenarios" aria-label="定向剧本">
                {SCENARIOS.filter((s) => s.id !== 'mystery').map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={choice === s.id}
                    onClick={() => setChoice(s.id)}
                  >
                    <span>{s.type.split(' · ')[0]}</span>
                    <strong>{s.title}</strong>
                  </button>
                ))}
              </div>
              {choice !== 'mystery' && (
                <PlaytestPresetPicker
                  scenario={choice}
                  value={playtestFocus}
                  onChange={setPlaytestFocus}
                />
              )}
              <button
                className="gold-button"
                disabled={choice === 'mystery'}
                onClick={onTest}
              >
                {choice === 'mystery' ? '选择一个剧本' : '进入作祟测试'}
              </button>
              {savedPlaytest && (
                <button
                  className="secondary-button"
                  onClick={() => onContinue(savedPlaytest)}
                >
                  继续测试局 · {gameModeLabel(savedPlaytest)}
                </button>
              )}
              <button
                className="text-button"
                onClick={() => {
                  setChoice('mystery');
                  setDialog(null);
                }}
              >
                恢复随机探索
              </button>
            </>
          ) : (
            <div className="entry-credits">
              <p>
                物品图标：
                <a
                  href="https://game-icons.net"
                  target="_blank"
                  rel="noreferrer"
                >
                  Game-icons.net
                </a>{' '}
                · Lorc、Delapouite。遵循{' '}
                <a
                  href="https://creativecommons.org/licenses/by/3.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 3.0
                </a>
                ，统一调整为古金色。
              </p>
              <p>
                人物头像：
                <a
                  href="https://ladadori.itch.io/realistic-avatars-for-rpg"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ladadori · Realistic avatars for RPG
                </a>
                ，CC0。原作者使用 Artbreeder 生成并在 Krita
                中修整；本作统一了显示色调与头像框。
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
