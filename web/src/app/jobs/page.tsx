"use client";

import { JobCard } from "@/components/JobCard";
import { useAllJobs } from "@/hooks/useJobs";
import { useState } from "react";
import { JobStatus } from "@/lib/jobs";

type FilterStatus = "all" | JobStatus;

export default function JobsPage() {
  const { jobs, isLoading } = useAllJobs();
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filteredJobs =
    filter === "all"
      ? jobs
      : jobs.filter((job) => job.status === filter);

  const sortedJobs = [...filteredJobs].sort((a, b) => b.createdAt - a.createdAt);

  const statusCounts = {
    all: jobs.length,
    open: jobs.filter((job) => job.status === "open").length,
    accepted: jobs.filter((job) => job.status === "accepted").length,
    funded: jobs.filter((job) => job.status === "funded").length,
    cancelled: jobs.filter((job) => job.status === "cancelled").length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Job Board</h1>
          <p className="text-gray-400 mt-1">{jobs.length} total jobs</p>
        </div>
        {/* TODO: Add "Post a Job" button */}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {(["all", "open", "accepted", "funded", "cancelled"] as const).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === status
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {status === "all" ? "All" : status} ({statusCounts[status]})
            </button>
          )
        )}
      </div>

      {/* Job Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 animate-pulse"
            >
              <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : sortedJobs.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800/50 border border-gray-700 rounded-lg">
          <p className="text-gray-400">No jobs found with this filter</p>
        </div>
      )}
    </div>
  );
}
