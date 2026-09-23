import { notFound } from "next/navigation";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { DetailPage } from "@/components/landing/detail-page";
import { learnPages } from "@/lib/landing-content";

interface LearnPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return Object.keys(learnPages).map((slug) => ({ slug }));
}

export default async function LearnPage({ params }: LearnPageProps) {
  const { slug } = await params;
  const content = learnPages[slug];

  if (!content) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col font-sans">
      <Header />
      <DetailPage content={content} backHref="/#what-we-do" />
      <Footer />
    </div>
  );
}
