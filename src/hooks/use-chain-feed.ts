import { useEffect } from "react";

import {
  fetchHashrate,
  fetchRecentBlocks,
  MEMPOOL_PING,
  MEMPOOL_SOCKET_URL,
  MEMPOOL_SUBSCRIBE,
  parseMempoolMessage,
  TRACK_NEXT_BLOCK,
} from "@/data/mempool";
import { createSocketFeed } from "@/data/socket-feed";
import type { Block, MempoolUpdate } from "@/data/types";
import { SATS_PER_BTC } from "@/lib/bitcoin";
import {
  formatBtc,
  formatFeeRate,
  formatHeight,
  formatNumber,
} from "@/lib/format";
import { blockKey, txKey } from "@/lib/scene-key";
import { addActivity } from "@/stores/activity-store";
import { sendCameraCommand } from "@/stores/camera-store";
import { useChainStore } from "@/stores/chain-store";
import { useViewStore } from "@/stores/view-store";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** mempool.space drops connections that stay quiet; a ping now and then keeps this one. */
const PING_INTERVAL = 30 * SECOND;
/** Statistics arrive every few seconds: this long without a word, the connection is dead. */
const STALE_AFTER = 90 * SECOND;
const HASHRATE_REFRESH = 30 * MINUTE;
/** Transactions moving at least this much (sats) are called out as whales. */
const WHALE_VALUE = 100 * SATS_PER_BTC;

const announceBlock = (block: Block) => {
  addActivity({
    detail: `${block.pool?.name ?? "Unknown miner"} · ${formatNumber(block.txCount)} transactions`,
    id: `block:${block.id}`,
    kind: "block",
    target: blockKey(block.id),
    time: Date.now(),
    title: `Block ${formatHeight(block.height)} found`,
  });
  if (useViewStore.getState().toggles.followBlocks) {
    sendCameraCommand({ key: blockKey(block.id), kind: "focus" });
  }
};

/**
 * Big transactions as they reach the mempool or the next block (not those
 * of a full list, which were there before).
 */
const announceWhales = (update: MempoolUpdate) => {
  const arrived = [
    ...(update.recent ?? []),
    ...(update.nextBlock?.delta?.added ?? []),
  ];
  for (const tx of arrived) {
    if (tx.value >= WHALE_VALUE) {
      addActivity({
        detail: `${formatFeeRate(tx.rate)} · ${tx.txid.slice(0, 8)}…`,
        id: `whale:${tx.txid}`,
        kind: "whale",
        target: txKey(tx.txid),
        time: Date.now(),
        title: `${formatBtc(tx.value)} on the move`,
      });
    }
  }
};

/**
 * Keeps the chain store up to date with mempool.space: blocks as they are
 * found, the next block's transactions as they change, fees and mempool
 * statistics, and the network's hash rate.
 */
export const useChainFeed = () => {
  useEffect(() => {
    const { receive, setHashrate, setStatus } =
      useChainStore.getState().actions;
    const controller = new AbortController();

    // The live feed sends only the last few blocks on connecting.
    const loadBlocks = async () => {
      try {
        receive({ blocks: await fetchRecentBlocks(controller.signal) });
      } catch {
        // The live feed's own blocks stand in until the next connection.
      }
    };

    const loadHashrate = async () => {
      try {
        setHashrate(await fetchHashrate(controller.signal));
      } catch {
        // Shown as unknown until the next try.
      }
    };
    void loadHashrate();
    const hashrateTimer = setInterval(() => {
      void loadHashrate();
    }, HASHRATE_REFRESH);

    const feed = createSocketFeed(
      {
        parse: parseMempoolMessage,
        ping: { data: MEMPOOL_PING, interval: PING_INTERVAL },
        staleAfter: STALE_AFTER,
        urls: [MEMPOOL_SOCKET_URL],
      },
      {
        onMessage: (update) => {
          const { found, resync } = receive(update);
          if (resync) {
            feed.send(TRACK_NEXT_BLOCK);
          }
          if (found) {
            announceBlock(found);
          }
          announceWhales(update);
        },
        onOpen: (send) => {
          for (const message of MEMPOOL_SUBSCRIBE) {
            send(message);
          }
          void loadBlocks();
        },
        onStatus: setStatus,
      }
    );

    return () => {
      controller.abort();
      clearInterval(hashrateTimer);
      feed.close();
    };
  }, []);
};
