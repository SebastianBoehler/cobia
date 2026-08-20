import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DocsBody, DocsDescription, DocsPage, DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { getDocsMdxComponents } from "../../../components/docs/mdx";
import { docsSource } from "../../../lib/docs/source";

export function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata({ params }: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  const page = docsSource.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}

export default async function DeveloperDocsPage({ params }: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await params;
  const page = docsSource.getPage(slug);
  if (!page) notFound();
  const Content = page.data.body;
  return <DocsPage toc={page.data.toc}>
    <DocsTitle>{page.data.title}</DocsTitle>
    {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
    <DocsBody><Content components={getDocsMdxComponents()} /></DocsBody>
  </DocsPage>;
}
