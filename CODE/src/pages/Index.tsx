import { Layout } from "@/components/layout/Layout";
import { HeroSection } from "@/components/home/HeroSection";
import { StateMapSection } from "@/components/home/StateMapSection";
import { UpcomingDeadlines } from "@/components/home/UpcomingDeadlines";
import { FeaturedCandidates } from "@/components/home/FeaturedCandidates";
import { VoterResourcesCTA } from "@/components/home/VoterResourcesCTA";

const Index = () => {
  return (
    <Layout>
      <HeroSection />
      <StateMapSection />
      <UpcomingDeadlines />
      <FeaturedCandidates />
      <VoterResourcesCTA />
    </Layout>
  );
};

export default Index;
