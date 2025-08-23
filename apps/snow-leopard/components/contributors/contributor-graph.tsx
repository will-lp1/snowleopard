"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


interface Contributor {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
}

interface RepositoryStats {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count: number;
  language: string;
  description: string;
  created_at: string;
  updated_at: string;
}



interface ContributorGraphProps {
  contributors: Contributor[];
  stats: RepositoryStats;
}

export function ContributorGraph({ contributors }: ContributorGraphProps) {

  const getContributionColor = (contributions: number) => {
    if (contributions >= 100) return "bg-green-500";
    if (contributions >= 50) return "bg-blue-500";
    if (contributions >= 20) return "bg-yellow-500";
    if (contributions >= 10) return "bg-orange-500";
    return "bg-gray-500";
  };

  const getContributionLevel = (contributions: number, login: string) => {
    if (login === "will-lp1" || login === "Praashh") return "Founder";
    if (contributions >= 100) return "Core Contributor";
    if (contributions >= 50) return "Major Contributor";
    if (contributions >= 20) return "Active Contributor";
    if (contributions >= 10) return "Regular Contributor";
    return "Contributor";
  };

  const isFounder = (login: string) => {
    return login === "will-lp1" || login === "Praashh";
  };

  const founders = contributors.filter(contributor => isFounder(contributor.login));
  const regularContributors = contributors.filter(contributor => !isFounder(contributor.login));

  return (
    <div className="min-h-screen bg-background py-6 sm:py-8">
      <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12">
        {/* Founders Section */}
        {founders.length > 0 && (
          <div className="mb-12 sm:mb-16">
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3 sm:mb-4">
                Meet the people behind Snow Leopard
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl mx-auto">
              {founders.map((founder) => (
                <Card 
                  key={founder.id} 
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <Image
                        src={founder.avatar_url}
                        alt={founder.login}
                        width={48}
                        height={48}
                        className="rounded-full sm:size-[60px]"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
                          {founder.login}
                        </h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge 
                            variant="secondary" 
                            className="bg-purple-500 text-white text-xs"
                          >
                            {founder.contributions} contributions
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Founder
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Contributors Section */}
        {regularContributors.length > 0 && (
          <div>
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 sm:mb-4">
                Contributors
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
                Meet the amazing people who have contributed to Snow Leopard
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {regularContributors.map((contributor) => (
                <Card 
                  key={contributor.id} 
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <Image
                        src={contributor.avatar_url}
                        alt={contributor.login}
                        width={48}
                        height={48}
                        className="rounded-full sm:size-[60px]"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
                          {contributor.login}
                        </h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge 
                            variant="secondary" 
                            className={`${getContributionColor(contributor.contributions)} text-white text-xs`}
                          >
                            {contributor.contributions} contributions
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {getContributionLevel(contributor.contributions, contributor.login)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
