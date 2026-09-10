import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

export default function CardNotice({ notice }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <aside className="card-notice" aria-label="卡牌生效提示">
      <output>
        <strong>
          <Check size={15} />
          {notice.title} · 已生效
        </strong>
        <p>{notice.text}</p>
        {notice.changes?.filter(Boolean).map((change, i) => (
          <small key={i}>{change}</small>
        ))}
        {notice.skipHint && <small>{notice.skipHint}</small>}
      </output>
      <button
        className="icon-button"
        aria-label="收起卡牌提示"
        onClick={() => setVisible(false)}
      >
        <X size={15} />
      </button>
    </aside>
  );
}
