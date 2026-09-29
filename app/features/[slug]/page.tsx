import { notFound, redirect } from "next/navigation";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { DetailPage } from "@/components/landing/detail-page";
import { featurePages } from "@/lib/landing-content";
import { createClient } from "@/lib/supabase/server";

interface FeaturePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return Object.keys(featurePages).map((slug) => ({ slug }));
}

export default async function FeaturePage({ params }: FeaturePageProps) {
  const { slug } = await params;
  const content = featurePages[slug];

  if (!content) {
    notFound();
  }

  if (slug === "unsubscriber" || slug === "history") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Signed-in users go to the real workspace; everyone else sees the feature page.
    if (user) redirect(`/dashboard/${slug}`);
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col font-sans">
      <Header />
      <DetailPage content={content} backHref="/#what-we-do" />
      <Footer />
    </div>
  );
}
