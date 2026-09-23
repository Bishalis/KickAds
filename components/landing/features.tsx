import { BsEnvelope,BsClock,BsClockHistory,BsFolder } from "react-icons/bs";
import { ComponentType } from "react";

interface Feature {
  id: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

const features: Feature[] = [
  {
    id: "1",
    icon: BsEnvelope,
    description: "We follow unsubscribe links and actually unsubscribe you from emails. You'll never receive them again.",
  },
  {
    id: "2",
    icon: BsClock,
    description: "If you dont have time to unsubscribe, you can schedule it and we'll take care of it for you.",
  },
  {
    id: "3",
    icon: BsClockHistory,
    description: "History of your unsubscribed emails is kept for your reference.",
  },
  {
    id: "4",
    icon: BsFolder,
    description: "We group similar emails together based on domain for easier management.",
  },
];

export function Features() {
  return (
    <section id="what-we-do" className="bg-linear-to-b from-white via-purple-50/30 to-white py-16 md:py-24 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
            What do we do?
          </h2>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
            Kick-Ads helps you easily unsubscribe from unwanted emails, keeping your inbox clean and organized.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div 
                key={feature.id} 
                className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start gap-4 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                  <Icon className="w-7 h-7" />
                </div>
                <p className="text-gray-700 leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}