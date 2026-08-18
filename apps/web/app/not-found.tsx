import { ArrowRight, Compass } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className="not-found" id="main-content">
        <div>
          <h1>This page is no longer part of Cobia.</h1>
          <p>Start a new bounded intent or explore current challenges and past solver discoveries.</p>
          <div>
            <Link className="button button--primary" href="/intents/new">Create an intent <ArrowRight aria-hidden="true" size={17} /></Link>
            <Link className="button button--quiet" href="/discover"><Compass aria-hidden="true" size={17} /> Discover</Link>
          </div>
        </div>
      </main>
    </>
  );
}
