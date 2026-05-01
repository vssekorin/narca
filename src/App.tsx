import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface Card {
  id: string;
  image?: string;
  text?: string;
  next?: string[];
}

interface Scenario {
  title: string;
  style?: string;
  init: string;
  cards: Card[];
}

// A card that has appeared in the tree (opened or potential)
interface TreeItem {
  id: string;
  col: number;
  opened: boolean;
  parentId: string | null;
}

// --- Tree layout constants ---
const CARD_SIZE = 80;
const COL_GAP = 52;
const ROW_GAP = 16;
const PAD = 28;

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
  cardMap: Map<string, Card>;
  selectedCard: string | null;
  onCardClick: (id: string) => void;
}

function Tree({ items, cardMap, selectedCard, onCardClick }: TreeProps) {
  // For potential cards: effective col = max(opened parent col) + 1
  const effectiveCols = new Map<string, number>(items.map((t) => [t.id, t.col]));
  items.forEach((item) => {
    if (!item.opened) {
      let maxParentCol = -1;
      items.forEach((other) => {
        if (other.opened && cardMap.get(other.id)?.next?.includes(item.id)) {
          if (other.col > maxParentCol) maxParentCol = other.col;
        }
      });
      if (maxParentCol >= 0) effectiveCols.set(item.id, maxParentCol + 1);
    }
  });

  // Map each card to its row index within its effective column
  const colRows = new Map<number, string[]>();
  items.forEach((item) => {
    const col = effectiveCols.get(item.id)!;
    if (!colRows.has(col)) colRows.set(col, []);
    colRows.get(col)!.push(item.id);
  });

  // Compute absolute position for each card
  function cardPos(id: string) {
    const col = effectiveCols.get(id)!;
    const row = colRows.get(col)!.indexOf(id);
    return {
      x: PAD + col * (CARD_SIZE + COL_GAP),
      y: PAD + row * (CARD_SIZE + ROW_GAP),
    };
  }

  // Tree canvas dimensions
  const maxCol = effectiveCols.size > 0 ? Math.max(...effectiveCols.values()) : 0;
  const maxRows = colRows.size > 0 ? Math.max(...[...colRows.values()].map((v) => v.length)) : 1;
  const W = PAD * 2 + (maxCol + 1) * CARD_SIZE + maxCol * COL_GAP;
  const H = PAD * 2 + maxRows * CARD_SIZE + Math.max(0, maxRows - 1) * ROW_GAP;

  return (
    <div className="tree" style={{ width: W, height: H }}>
      {/* SVG layer for arrows */}
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
        {(() => {
          const itemIds = new Set(items.map((t) => t.id));
          const arrows: { from: TreeItem; to: TreeItem }[] = [];
          items
            .filter((t) => t.opened)
            .forEach((opened) => {
              cardMap.get(opened.id)?.next?.forEach((nextId) => {
                if (itemIds.has(nextId)) {
                  const toItem = items.find((t) => t.id === nextId)!;
                  arrows.push({ from: opened, to: toItem });
                }
              });
            });
          return arrows.map(({ from, to }) => {
            const fp = cardPos(from.id);
            const tp = cardPos(to.id);
            const x1 = fp.x + CARD_SIZE;
            const y1 = fp.y + CARD_SIZE / 2;
            const x2 = tp.x;
            const y2 = tp.y + CARD_SIZE / 2;
            const cx = (x1 + x2) / 2;
            return (
              <path
                key={`${from.id}-${to.id}`}
                d={`M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                stroke="rgba(90,140,220,0.45)"
                strokeWidth="1.5"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            );
          });
        })()}
      </svg>

      {/* Cards */}
      {items.map((item) => {
        const { x, y } = cardPos(item.id);
        const cls = [
          "tree-card",
          item.opened ? "opened" : "potential",
          selectedCard === item.id ? "selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={item.id}
            className={cls}
            style={{ left: x, top: y }}
            onClick={() => onCardClick(item.id)}
            title={item.id}
          >
            <span className="card-id">{item.id}</span>
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

function buildInitialItems(
  scenario: Scenario,
  cardMap: Map<string, Card>
): TreeItem[] {
  const items: TreeItem[] = [
    { id: scenario.init, col: 0, opened: true, parentId: null },
  ];
  cardMap.get(scenario.init)?.next?.forEach((nextId) => {
    items.push({ id: nextId, col: 1, opened: false, parentId: scenario.init });
  });
  return items;
}

function GameScreen({ scenario, scenarioDir, onBack }: GameScreenProps) {
  const cardMap = new Map(scenario.cards.map((c) => [c.id, c]));
  const [treeItems, setTreeItems] = useState<TreeItem[]>(() =>
    buildInitialItems(scenario, cardMap)
  );
  const [selectedCard, setSelectedCard] = useState<string | null>(scenario.init);
  const gameBgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameBgRef.current) {
      gameBgRef.current.style.cssText = scenario.style ?? "";
    }
  }, [scenario.style]);

  function handleCardClick(id: string) {
    setTreeItems((prev) => {
      const item = prev.find((t) => t.id === id);
      if (!item || item.opened) return prev;

      // Effective col at open time: max opened parent col + 1
      let maxParentCol = -1;
      prev.forEach((other) => {
        if (other.opened && cardMap.get(other.id)?.next?.includes(id)) {
          if (other.col > maxParentCol) maxParentCol = other.col;
        }
      });
      const effectiveCol = maxParentCol >= 0 ? maxParentCol + 1 : item.col;

      // Mark card as opened with the effective column
      const updated = prev.map((t) =>
        t.id === id ? { ...t, opened: true, col: effectiveCol } : t
      );

      // Add its next cards as potential (if not already in tree)
      const existingIds = new Set(updated.map((t) => t.id));
      cardMap.get(id)?.next?.forEach((nextId) => {
        if (!existingIds.has(nextId)) {
          updated.push({
            id: nextId,
            col: effectiveCol + 1,
            opened: false,
            parentId: id,
          });
          existingIds.add(nextId);
        }
      });

      return updated;
    });
    setSelectedCard(id);
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
            cardMap={cardMap}
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
