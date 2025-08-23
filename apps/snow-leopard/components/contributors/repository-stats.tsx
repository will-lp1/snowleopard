"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Area, 
  AreaChart, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Star, GitFork, Eye, AlertCircle, GitPullRequest } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchRepositoryAnalytics } from "@/app/contributors/actions/fetch-repository-analytics";

interface RepositoryStatsProps {
  stats: {
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    subscribers_count: number;
  };
}

interface RepositoryAnalytics {
  growthData: Array<{
    date: string;
    stars: number;
    forks: number;
  }>;
  activityData: Array<{
    day: string;
    activity1: number;
    activity2: number;
  }>;
  pullRequestsCount: number;
}

export function RepositoryStats({ stats }: RepositoryStatsProps) {
  const [analytics, setAnalytics] = useState<RepositoryAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const data = await fetchRepositoryAnalytics();
        setAnalytics(data);
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, []);
  return (
    <div className="space-y-6 mt-16 sm:mt-20 md:mt-24 lg:mt-28">
      {/* Key Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-1 sm:space-y-0 sm:space-x-2 text-center sm:text-left">
          <Star className="size-4 sm:size-5 text-foreground" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-1">
            <span className="text-sm sm:text-lg font-semibold">{stats.stargazers_count.toLocaleString()}</span>
            <span className="text-xs sm:text-sm text-muted-foreground">stars</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-1 sm:space-y-0 sm:space-x-2 text-center sm:text-left">
          <GitFork className="size-4 sm:size-5 text-foreground" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-1">
            <span className="text-sm sm:text-lg font-semibold">{stats.forks_count.toLocaleString()}</span>
            <span className="text-xs sm:text-sm text-muted-foreground">forks</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-1 sm:space-y-0 sm:space-x-2 text-center sm:text-left">
          <Eye className="size-4 sm:size-5 text-foreground" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-1">
            <span className="text-sm sm:text-lg font-semibold">{stats.subscribers_count.toLocaleString()}</span>
            <span className="text-xs sm:text-sm text-muted-foreground">watchers</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-1 sm:space-y-0 sm:space-x-2 text-center sm:text-left">
          <AlertCircle className="size-4 sm:size-5 text-foreground" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-1">
            <span className="text-sm sm:text-lg font-semibold">{stats.open_issues_count.toLocaleString()}</span>
            <span className="text-xs sm:text-sm text-muted-foreground">issues</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-1 sm:space-y-0 sm:space-x-2 text-center sm:text-left col-span-2 sm:col-span-1">
          <GitPullRequest className="size-4 sm:size-5 text-foreground" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-1">
            <span className="text-sm sm:text-lg font-semibold">{analytics?.pullRequestsCount || 0}</span>
            <span className="text-xs sm:text-sm text-muted-foreground">PRs</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-foreground text-lg sm:text-xl">Repository Growth</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[250px] sm:h-[300px] flex items-center justify-center">
                <p className="text-muted-foreground text-sm sm:text-base">Loading growth data...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                <AreaChart data={analytics?.growthData || []}>
                <defs>
                  <linearGradient id="starsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="forksGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#666666" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#666666" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis 
                  dataKey="date" 
                  stroke="#ffffff" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#ffffff" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'dataMax']}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333333',
                    color: '#ffffff'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="stars" 
                  stroke="#ffffff" 
                  strokeWidth={2}
                  fill="url(#starsGradient)"
                  fillOpacity={1}
                />
                <Area 
                  type="monotone" 
                  dataKey="forks" 
                  stroke="#666666" 
                  strokeWidth={2}
                  fill="url(#forksGradient)"
                  fillOpacity={1}
                />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-foreground text-lg sm:text-xl">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[250px] sm:h-[300px] flex items-center justify-center">
                <p className="text-muted-foreground text-sm sm:text-base">Loading activity data...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250} className="sm:h-[300px]">
                <BarChart data={analytics?.activityData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                <XAxis 
                  dataKey="day" 
                  stroke="#ffffff" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#ffffff" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 8]}
                  ticks={[0, 2, 4, 6, 8]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1a1a1a', 
                    border: '1px solid #333333',
                    color: '#ffffff'
                  }}
                />
                <Bar 
                  dataKey="activity1" 
                  fill="#666666" 
                  radius={[2, 2, 0, 0]}
                />
                <Bar 
                  dataKey="activity2" 
                  fill="#ffffff" 
                  radius={[2, 2, 0, 0]}
                />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
