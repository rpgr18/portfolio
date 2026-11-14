// The matching engine's own in-browser benchmark (copied from github.com/rpgr18/matching-engine/web),
// run off the main thread so the page stays responsive. Same order-flow model as the native runs.
import createLob from './lob.mjs';

const ready = createLob();

onmessage = async ({ data }) => {
  try {
    const lob = await ready;
    const trades = () => lob.HEAPF64[lob._lob_info_buf() >> 3];
    lob._lob_bench_prepare(0, data.requests);   // 0: the "balanced" workload
    const n = lob._lob_bench_requests();
    postMessage({ phase: 'dense' });
    const denseMs = lob._lob_bench_run(0, data.reps);
    const denseTrades = trades();
    postMessage({ phase: 'map' });
    const mapMs = lob._lob_bench_run(1, data.reps);
    postMessage({ phase: 'done', n, denseMs, mapMs, trades: denseTrades, agree: denseTrades === trades() });
  } catch (e) {
    postMessage({ phase: 'error', message: String(e && e.message || e) });
  }
};
