import { fetchContributors } from "./actions/fetch-contributors";
import { ContributorGraph, RepositoryStats } from "@/components/contributors";

export default async function ContributorsPage() {
  try {
    const [{ contributors, stats }] = await Promise.all([
      fetchContributors(),
    ]);
    
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-8 sm:py-12">
          <RepositoryStats stats={stats} />
        </div>
        <ContributorGraph contributors={contributors} stats={stats} />
      </div>
    );
  } catch (error) {
    console.error('Error loading contributors:', error);
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Failed to load contributors
          </h1>
          <p className="text-muted-foreground">
            Please try again later or check your internet connection.
          </p>
        </div>
      </div>
    );
  }
}