import Link from "next/link";

export function CobiaLogo() {
  return (
    <Link className="brand" href="/" aria-label="Cobia home">
      <svg className="brand__mark" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="5" cy="17" r="3.1" fill="currentColor" />
        <circle cx="29" cy="17" r="3.1" fill="currentColor" />
        <path d="M8 17C12 17 11 7 19 7c5.2 0 5.4 7.1 7 8.5" />
        <path d="M8 17h18" />
        <path d="M8 17c4 0 3 10 11 10 5.2 0 5.4-7.1 7-8.5" />
      </svg>
      <span>COBIA</span>
    </Link>
  );
}
