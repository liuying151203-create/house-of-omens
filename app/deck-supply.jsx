import { Layers, CircleAlert, Package, Eye, ArrowRight } from 'lucide-react';
const decks = [
  ['rooms', '房间', Layers],
  ['event', '事件', CircleAlert],
  ['item', '物品', Package],
  ['omen', '预兆', Eye],
];
export default function DeckSupply({ game, net, moving, onEndRound }) {
  const host = !net.session || net.room?.you === net.room?.hostId;
  return (
    <aside className="deck-supply" aria-label="剩余牌堆与回合控制">
      <span className="supply-title">剩余牌堆</span>
      <div className="supply-counts">
        {decks.map(([key, name, Icon]) => (
          <span className={'supply-' + key} key={key} title={name + '牌堆'}>
            <Icon size={14} />
            <span>{name}</span>
            <b>{game.decks[key].length}</b>
          </span>
        ))}
      </div>
      <button
        disabled={
          !host ||
          !!game.queue.length ||
          moving ||
          net.busy ||
          game.phase === 'over'
        }
        onClick={onEndRound}
        title={host ? '提前结束整轮需要确认' : '仅房主可结束整轮'}
      >
        结束整轮
        <ArrowRight size={14} />
      </button>
    </aside>
  );
}
