'use client';
import { useEffect, useRef, useState } from 'react';
import { WORLD_H, WORLD_W } from '@/game/building/layout';
import type { BuildingScene } from '@/game/scenes/BuildingScene';
import { accStore, selectAgent } from '@/lib/store';

declare global {
  interface Window {
    __acc?: { actors: () => (ReturnType<BuildingScene['debugActors']>[number] & { clientX: number; clientY: number })[] };
  }
}

/** Monta o jogo Phaser só no navegador e liga a cena ao estado sincronizado. */
export function PhaserGame() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const Phaser = await import('phaser');
      const { BuildingScene } = await import('@/game/scenes/BuildingScene');
      if (destroyed || !host.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        width: WORLD_W,
        height: WORLD_H,
        backgroundColor: '#7dd3fc',
        antialias: true,
        roundPixels: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
        banner: false,
        audio: { noAudio: true },
      });
      game.scene.add('building', BuildingScene, true, {
        bridge: {
          onSelect: (id: string) => selectAgent(id),
          onReady: (scene: BuildingScene) => {
            scene.sync(accStore.getState());
            scene.select(accStore.getState().selectedAgentId);
            unsubscribe = accStore.subscribe((s, prev) => {
              if (s.agents !== prev.agents || s.tasks !== prev.tasks || s.approvals !== prev.approvals || s.projects !== prev.projects) scene.sync(s);
              if (s.selectedAgentId !== prev.selectedAgentId) scene.select(s.selectedAgentId);
            });
            window.__acc = {
              actors: () => {
                const rect = game!.canvas.getBoundingClientRect();
                return scene.debugActors().map((a) => ({
                  ...a,
                  clientX: rect.left + (a.x * rect.width) / WORLD_W,
                  clientY: rect.top + ((a.y - 20) * rect.height) / WORLD_H,
                }));
              },
            };
          },
        },
      });
    })().catch((err) => setFailed(String(err)));

    return () => {
      destroyed = true;
      unsubscribe?.();
      game?.destroy(true);
      delete window.__acc;
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-line bg-sky-300" style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}` }}>
      <div ref={host} className="absolute inset-0" data-testid="building" />
      {failed && <div className="absolute inset-0 grid place-items-center bg-ink/90 p-6 text-center text-sm text-red-300">Não foi possível carregar o prédio: {failed}</div>}
    </div>
  );
}
