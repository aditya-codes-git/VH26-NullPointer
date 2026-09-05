import React from 'react';
import { LandingNavbar } from './LandingNavbar.js';
import { HeroSection } from './HeroSection.js';
import {
  TrustStrip,
  ProblemSection,
  ProductDifferentiator,
  PrioritySystemSection,
  RealTimeAdaptationSection,
  DynamicScalingSection,
  ReliabilitySection,
  DecisionEngineSection,
  ObservabilityPreview,
  UseCasesSection,
  ComparisonMatrix,
  CostEfficiencySection,
  PricingSection,
  FinalCTA,
  LandingFooter,
} from './LandingSections.js';

interface LandingPageProps {
  onSignIn: () => void;
  onGetStarted: () => void;
  onViewDemo: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  onGetStarted,
  onViewDemo,
}) => {
  return (
    <div className="min-h-screen bg-white dark:bg-[#080a0d] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Fixed Navigation Bar */}
      <LandingNavbar
        onSignIn={onSignIn}
        onGetStarted={onGetStarted}
        onViewDemo={onViewDemo}
      />

      {/* Main Content Sections */}
      <main className="flex-grow">
        {/* 1. Hero Section */}
        <HeroSection onGetStarted={onGetStarted} onViewDemo={onViewDemo} />

        {/* 2. Value / Trust Strip */}
        <TrustStrip />

        {/* 3. Problem Comparison */}
        <ProblemSection />

        {/* 4. Product Differentiator (Stream, Batch, Defer, Shed) */}
        <ProductDifferentiator />

        {/* 5. Priority System (Critical, High, Low) */}
        <PrioritySystemSection />

        {/* 6. Real-Time Adaptation Timeline */}
        <RealTimeAdaptationSection />

        {/* 7. Dynamic Worker Scaling */}
        <DynamicScalingSection />

        {/* 8. Reliability & Duplicate Detection */}
        <ReliabilitySection />

        {/* 9. Explainable Decision Engine */}
        <DecisionEngineSection />

        {/* 10. Observability Dashboard Preview */}
        <ObservabilityPreview onViewDemo={onViewDemo} />

        {/* 11. Use Cases */}
        <UseCasesSection />

        {/* 12. Architectural Comparison Matrix */}
        <ComparisonMatrix />

        {/* 13. Cost & Capacity Efficiency */}
        <CostEfficiencySection />

        {/* 14. Illustrative Pricing */}
        <PricingSection onGetStarted={onGetStarted} />

        {/* 15. Final Call-to-Action */}
        <FinalCTA onGetStarted={onGetStarted} onViewDemo={onViewDemo} />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
};
