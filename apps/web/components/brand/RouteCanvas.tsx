export function RouteCanvas() {
  return (
    <div className="route-canvas" role="img" aria-label="Three solver routes enter one verifier and one verified route exits">
      <div className="route-canvas__label route-canvas__label--intent"><span>01</span> Your intent</div>
      <div className="route-canvas__label route-canvas__label--solver-a"><span>02A</span> Deterministic</div>
      <div className="route-canvas__label route-canvas__label--solver-b"><span>02B</span> Research</div>
      <div className="route-canvas__label route-canvas__label--verify"><span>03</span> Policy verifier</div>
      <div className="route-canvas__label route-canvas__label--winner"><span>04</span> Winning route</div>
      <svg viewBox="0 0 760 400" preserveAspectRatio="none" aria-hidden="true">
        <path className="route-path route-path--muted" d="M40 200 C170 200 150 72 285 72 S410 185 520 200" />
        <path className="route-path route-path--active route-path--delay" d="M40 200 C170 200 150 200 285 200 S410 200 520 200" />
        <path className="route-path route-path--rejected" d="M40 200 C170 200 150 328 285 328 S400 228 445 220" />
        <path className="route-path route-path--active route-path--winner" d="M520 200 C605 200 645 200 720 200" />
        <circle className="route-node" cx="40" cy="200" r="8" />
        <circle className="route-node route-node--ring" cx="520" cy="200" r="18" />
        <circle className="route-node" cx="520" cy="200" r="7" />
        <circle className="route-node" cx="720" cy="200" r="8" />
        <path className="reject-mark" d="M449 208l14 14m0-14-14 14" />
      </svg>
      <p className="route-canvas__caption">One solver stops at policy. The verified route continues.</p>
    </div>
  );
}
