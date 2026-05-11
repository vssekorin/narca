import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface Card {
  id: string;
  image?: string;
  text?: string;
  next?: string[];
  discard?: string[];
}

interface Scenario {
  title: string;
  style?: string;
  init: string;
  cards: Card[];
}

// An entry in the tree. Opened cards appear once per cardId.
// Potential cards appear once per parent->cardId link (so the same cardId
// can have multiple potential entries until it is opened).
interface TreeItem {
  key: string;
  cardId: string;
  col: number;
  opened: boolean;
  parentId: string | null;
}

// --- Tree layout constants ---
const CARD_SIZE = 80;
const COL_GAP = 52;
const ROW_GAP = 16;
const PAD = 28;

let keyCounter = 0;
function nextKey(): string {
  return `k${++keyCounter}`;
}

// --- Lazy image ---

function CardImage({
  scenarioDir,
  imagePath,
}: {
  scenarioDir: string;
  imagePath: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    invoke<string>("read_image", { path: `${scenarioDir}/${imagePath}` })
      .then(setSrc)
      .catch(() => setError(true));
  }, [scenarioDir, imagePath]);

  if (error)
    return (
      <div className="image-placeholder image-error">
        Изображение не найдено
      </div>
    );
  if (!src) return <div className="image-placeholder">...</div>;
  return <img src={src} alt="" className="card-image" />;
}

// --- Tree ---

interface TreeProps {
  items: TreeItem[];
  selectedCard: string | null;
  onCardClick: (key: string) => void;
}

function Tree({ items, selectedCard, onCardClick }: TreeProps) {
  const openedByCardId = new Map<string, TreeItem>();
  items.forEach((t) => {
    if (t.opened) openedByCardId.set(t.cardId, t);
  });

  // Effective col: opened items use their stored col;
  // potential items sit one column right of their (opened) parent.
  const effectiveCols = new Map<string, number>();
  items.forEach((item) => {
    if (item.opened) {
      effectiveCols.set(item.key, item.col);
    } else {
      const parent = item.parentId ? openedByCardId.get(item.parentId) : null;
      effectiveCols.set(item.key, parent ? parent.col + 1 : item.col);
    }
  });

  const colRows = new Map<number, string[]>();
  items.forEach((item) => {
    const col = effectiveCols.get(item.key)!;
    if (!colRows.has(col)) colRows.set(col, []);
    colRows.get(col)!.push(item.key);
  });

  function cardPos(key: string) {
    const col = effectiveCols.get(key)!;
    const row = colRows.get(col)!.indexOf(key);
    return {
      x: PAD + col * (CARD_SIZE + COL_GAP),
      y: PAD + row * (CARD_SIZE + ROW_GAP),
    };
  }

  const maxCol = effectiveCols.size > 0 ? Math.max(...effectiveCols.values()) : 0;
  const maxRows = colRows.size > 0 ? Math.max(...[...colRows.values()].map((v) => v.length)) : 1;
  const W = PAD * 2 + (maxCol + 1) * CARD_SIZE + maxCol * COL_GAP;
  const H = PAD * 2 + maxRows * CARD_SIZE + Math.max(0, maxRows - 1) * ROW_GAP;

  // Arrows: each item (opened or potential) is linked to the one parent it
  // originated from.
  const arrows: { fromKey: string; toKey: string }[] = [];
  items.forEach((item) => {
    if (!item.parentId) return;
    const parent = openedByCardId.get(item.parentId);
    if (!parent) return;
    arrows.push({ fromKey: parent.key, toKey: item.key });
  });

  return (
    <div className="tree" style={{ width: W, height: H }}>
      <svg
        className="tree-svg"
        width={W}
        height={H}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 7 3.5, 0 7" fill="rgba(90,140,220,0.5)" />
          </marker>
        </defs>
        {arrows.map(({ fromKey, toKey }) => {
          const fp = cardPos(fromKey);
          const tp = cardPos(toKey);
          const x1 = fp.x + CARD_SIZE;
          const y1 = fp.y + CARD_SIZE / 2;
          const x2 = tp.x;
          const y2 = tp.y + CARD_SIZE / 2;
          const cx = (x1 + x2) / 2;
          return (
            <path
              key={`${fromKey}-${toKey}`}
              d={`M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`}
              stroke="rgba(90,140,220,0.45)"
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </svg>

      {items.map((item) => {
        const { x, y } = cardPos(item.key);
        const cls = [
          "tree-card",
          item.opened ? "opened" : "potential",
          selectedCard === item.cardId ? "selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={item.key}
            className={cls}
            style={{ left: x, top: y }}
            onClick={() => onCardClick(item.key)}
            title={item.cardId}
          >
            <span className="card-id">{item.cardId}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Card Content Panel ---

interface CardContentProps {
  card: Card | undefined;
  scenarioDir: string;
  onClose: () => void;
}

function CardContent({ card, scenarioDir, onClose }: CardContentProps) {
  if (!card) return null;
  return (
    <div className="card-content-panel">
      <div className="card-content-header">
        <span className="card-content-id">{card.id}</span>
        <button className="card-content-close" onClick={onClose} title="Закрыть">
          ×
        </button>
      </div>
      <div className="card-content-body">
        {card.image && (
          <CardImage scenarioDir={scenarioDir} imagePath={card.image} />
        )}
        {card.text && <p className="card-text">{card.text}</p>}
        {!card.image && !card.text && (
          <p className="card-empty">Нет содержимого</p>
        )}
      </div>
    </div>
  );
}

// --- Start Screen ---

interface StartScreenProps {
  onLoad: (scenario: Scenario, dir: string) => void;
}

function StartScreen({ onLoad }: StartScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSelectFolder() {
    setError(null);
    setLoading(true);
    try {
      const dir = await open({
        directory: true,
        multiple: false,
        title: "Выберите папку со сценарием",
      });
      if (!dir || Array.isArray(dir)) {
        setLoading(false);
        return;
      }
      const scenario = await invoke<Scenario>("load_scenario", { path: dir });
      onLoad(scenario, dir);
    } catch (e: unknown) {
      setError(String(e) || "Неизвестная ошибка");
      setLoading(false);
    }
  }

  return (
    <div className="start-screen">
      <h1 className="app-title">narca</h1>
      <p className="app-subtitle">Нарративные карточные игры</p>
      <button
        className="select-btn"
        onClick={handleSelectFolder}
        disabled={loading}
      >
        {loading ? "Загрузка..." : "Выбрать папку со сценарием"}
      </button>
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}

// --- Game Screen ---

interface GameScreenProps {
  scenario: Scenario;
  scenarioDir: string;
  onBack: () => void;
}

function buildInitialState(
  scenario: Scenario,
  cardMap: Map<string, Card>
): { items: TreeItem[]; discarded: Set<string> } {
  const initCard = cardMap.get(scenario.init);
  const discarded = new Set<string>(initCard?.discard ?? []);
  const items: TreeItem[] = [
    { key: nextKey(), cardId: scenario.init, col: 0, opened: true, parentId: null },
  ];
  initCard?.next?.forEach((nextCardId) => {
    if (!discarded.has(nextCardId)) {
      items.push({
        key: nextKey(),
        cardId: nextCardId,
        col: 1,
        opened: false,
        parentId: scenario.init,
      });
    }
  });
  return { items, discarded };
}

function GameScreen({ scenario, scenarioDir, onBack }: GameScreenProps) {
  const cardMap = new Map(scenario.cards.map((c) => [c.id, c]));
  const [treeItems, setTreeItems] = useState<TreeItem[]>(
    () => buildInitialState(scenario, cardMap).items
  );
  const [discarded, setDiscarded] = useState<Set<string>>(
    () => buildInitialState(scenario, cardMap).discarded
  );
  const [selectedCard, setSelectedCard] = useState<string | null>(scenario.init);
  const gameBgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameBgRef.current) {
      gameBgRef.current.style.cssText = scenario.style ?? "";
    }
  }, [scenario.style]);

  function handleCardClick(key: string) {
    const item = treeItems.find((t) => t.key === key);
    if (!item) return;
    if (item.opened) {
      setSelectedCard(item.cardId);
      return;
    }

    const cardId = item.cardId;
    const card = cardMap.get(cardId);

    // Open at the clicked instance's displayed position: its parent's col + 1.
    const parent = item.parentId
      ? treeItems.find((t) => t.opened && t.cardId === item.parentId)
      : null;
    const effectiveCol = parent ? parent.col + 1 : item.col;

    // Compute newly discarded ids (skip those already opened)
    const newlyDiscarded = new Set<string>();
    card?.discard?.forEach((dId) => {
      const dOpened = treeItems.some((t) => t.opened && t.cardId === dId);
      if (!dOpened) newlyDiscarded.add(dId);
    });

    // Remove discarded entries and sibling potentials of this cardId,
    // then mark the clicked entry as opened in place.
    let updated = treeItems
      .filter((t) => {
        if (newlyDiscarded.has(t.cardId)) return false;
        if (!t.opened && t.cardId === cardId && t.key !== key) return false;
        return true;
      })
      .map((t) =>
        t.key === key ? { ...t, opened: true, col: effectiveCol } : t
      );

    // Add next cards as potential (one per link, skipping discarded
    // and skipping next ids that are already opened — those just get arrows).
    const allDiscarded = new Set([...discarded, ...newlyDiscarded]);
    const openedCardIds = new Set(
      updated.filter((t) => t.opened).map((t) => t.cardId)
    );
    card?.next?.forEach((nextCardId) => {
      if (allDiscarded.has(nextCardId)) return;
      if (openedCardIds.has(nextCardId)) return;
      updated.push({
        key: nextKey(),
        cardId: nextCardId,
        col: effectiveCol + 1,
        opened: false,
        parentId: cardId,
      });
    });

    setTreeItems(updated);
    if (newlyDiscarded.size > 0) setDiscarded(allDiscarded);
    setSelectedCard(cardId);
  }

  const selectedCardData = selectedCard
    ? cardMap.get(selectedCard)
    : undefined;

  return (
    <div className="game-screen">
      <div className="game-bg" ref={gameBgRef} />
      <div className="game-header">
        <button className="back-btn" onClick={onBack} title="На главную">
          ←
        </button>
        <h2 className="game-title">{scenario.title}</h2>
      </div>
      <div className="game-body">
        <div className="tree-wrapper">
          <Tree
            items={treeItems}
            selectedCard={selectedCard}
            onCardClick={handleCardClick}
          />
        </div>
        {selectedCard && (
          <CardContent
            card={selectedCardData}
            scenarioDir={scenarioDir}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </div>
    </div>
  );
}

// --- App ---

function App() {
  const [game, setGame] = useState<{ scenario: Scenario; dir: string } | null>(
    null
  );

  return (
    <div className="app">
      {game ? (
        <GameScreen
          scenario={game.scenario}
          scenarioDir={game.dir}
          onBack={() => setGame(null)}
        />
      ) : (
        <StartScreen onLoad={(scenario, dir) => setGame({ scenario, dir })} />
      )}
    </div>
  );
}

export default App;
