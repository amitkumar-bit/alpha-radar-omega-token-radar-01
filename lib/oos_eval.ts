// Offline Out-of-Sample Model Challenger Ladder (calls OMEGA exports from dashboard/analysis.js)
export function computeOosLadder(O: any, comps: any[], ms: number) {
  const { exp, abs, max, min, sqrt, ceil, floor, log } = Math;
  const L = (v: number) => log(max(1, v)), fx = (v: number, d = 2) => +v.toFixed(d);
  const confQ = (a: number[], q: number) => a.length ? [...a].sort((x, y) => x - y)[min(a.length - 1, max(0, ceil((a.length + 1) * q) - 1))]! : 0;
  const dt = comps.filter((r) => r.listed_at).sort((a, b) => Date.parse(a.listed_at) - Date.parse(b.listed_at));
  const cut = floor(dt.length * 0.7), tr = dt.slice(0, cut), trG = new Set(tr.map((x) => x.fam_group));
  const te = dt.slice(cut).filter((x) => !trG.has(x.fam_group)), n = comps.length;
  const specs: [string, string, any, number][] = [
    ['flat', 'Flat median', { flat: 1 }, 0],
    ['A', 'A. Official Starter', { starter: 1 }, 0],
    ['B', 'B. Huber + EB(6,24)', { kSup: 6, kCat: 24, noChain: 1, noGM: 1, stud: 0 }, 0],
    ['C', 'C. Huber+EB(16,64)+Chain', { kSup: 16, kCat: 64, noChain: 0, noGM: 1, stud: 1 }, 0],
    ['D', 'D. G4-Conf [Selected]', { kSup: 16, kCat: 64, noChain: 0, noGM: 0, stud: 1 }, 1],
  ];
  const ld = specs.map(([id, label, sp, sel]) => {
    const fW = O.fitConf(tr, ms, sp).full;
    const loo = comps.map((c) => {
      const trM = comps.filter((x) => x.fam_group !== c.fam_group), fM = O.fitModel(trM, sp);
      const yp = sp.flat ? fM.flatMed : O.decomposeLog(fM, c, ms, sp).totalLog;
      const e = abs(L(c.mcap_usd) - yp), lev = sp.stud ? O.levOf(fM, c.tvl_family) : 0;
      return { g: c.fam_group, e, s: e / sqrt(max(0.25, 1 - lev)) };
    });
    const tR = te.map((r) => {
      const yp = sp.flat ? fW.flatMed : O.decomposeLog(fW, r, ms, sp).totalLog;
      const m = sp.stud ? sqrt(1 + O.levOf(fW, r.tvl_family)) : 1, e = abs(L(r.mcap_usd) - yp);
      return { e, i5: e <= fW.q50 * m, i8: e <= fW.q80 * m };
    });
    return {
      id, label, selected: !!sel, n_loo: n, n_cs_train: cut, n_cs_test: te.length,
      loo_med_mult: fx(exp(O.median(loo.map((x) => x.e)))),
      loo_rmse: fx(sqrt(O.mean(loo, (x: any) => x.e * x.e)), 3),
      loo_p90_mult: fx(exp(O.quantile(loo.map((x) => x.e), 0.9))),
      cs_med_mult: fx(exp(O.median(tR.map((x) => x.e)))),
      cs_rmse: fx(sqrt(O.mean(tR, (x: any) => x.e * x.e)), 3),
      cov50_wf: fx(O.mean(tR, (x: any) => (x.i5 ? 1 : 0)) * 100, 1),
      cov80_wf: fx(O.mean(tR, (x: any) => (x.i8 ? 1 : 0)) * 100, 1),
      loo,
    };
  });
  const lS = ld[4]!.loo;
  let h5 = 0, h8 = 0;
  for (const x of lS) {
    const o = lS.filter((y) => y.g !== x.g).map((y) => y.s);
    if (x.s <= confQ(o, 0.5)) h5++;
    if (x.s <= confQ(o, 0.8)) h8++;
  }
  const fF = O.fitConf(comps, ms, { kSup: 16, kCat: 64, noChain: 0, noGM: 0, stud: 1 }).full;
  return {
    ladder: ld.map(({ loo, ...r }) => r),
    q50_log: fx(fF.q50, 4), q80_log: fx(fF.q80, 4),
    hit_p25_p75_pct: fx((h5 / n) * 100, 1), hit_p10_p90_pct: fx((h8 / n) * 100, 1),
    cs_hit_p25_p75_pct: ld[4]!.cov50_wf, cs_hit_p10_p90_pct: ld[4]!.cov80_wf,
  };
}
