import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old leaderboard routes → unified page
      { source: "/results/:code", destination: "/game/:code/leaderboard", permanent: true },
      { source: "/game/:code/final", destination: "/game/:code/leaderboard", permanent: true },
    ];
  },
};

export default nextConfig;
