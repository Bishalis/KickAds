import type { ReactNode } from "react";

export type InfoSection = { title: string; items: ReactNode[] };

export function InfoPage({ title, intro, sections }: { title: string; intro: string; sections: InfoSection[] }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-gray-600">{intro}</p>
      <div className="mt-8 grid gap-4">
        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-gray-950">{section.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-700">
              {section.items.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
