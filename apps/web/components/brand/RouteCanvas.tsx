export function RouteCanvas() {
  return (
    <div className="route-canvas" role="img" aria-label="A pinned Aave and Uniswap snapshot leads to one deterministic route quote and a recomputed signed bundle">
      <div className="route-canvas__label route-canvas__label--intent"><span>01</span> Signed intent</div>
      <div className="route-canvas__label route-canvas__label--discovery"><span>02</span> Pinned snapshot</div>
      <div className="route-canvas__label route-canvas__label--quote"><span>03</span> Aave + Uniswap route</div>
      <div className="route-canvas__label route-canvas__label--bundle"><span>04</span> Recomputed bundle</div>
      <svg viewBox="0 0 760 400" preserveAspectRatio="none" aria-hidden="true">
        <path className="route-path route-path--active" d="M40 200 C170 200 170 200 285 200 S410 200 520 200 S640 200 720 200" />
        <circle className="route-node" cx="40" cy="200" r="8" />
        <circle className="route-node" cx="285" cy="200" r="7" />
        <circle className="route-node" cx="520" cy="200" r="7" />
        <circle className="route-node" cx="720" cy="200" r="8" />
      </svg>
      <p className="route-canvas__caption">Snapshot-derived estimate only. Execution is fork-tested but not wired into the product.</p>
    </div>
  );
}
