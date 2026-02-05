"use client";

import { Job } from "@/lib/jobs";
import Link from "next/link";

const statusColors: Record<Job["status"], string> = {
  open: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  accepted: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  funded: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function JobCard({ job }: { job: Job }) {
  const deadlineDate = job.deadline ? new Date(job.deadline) : null;
  const isExpired = deadlineDate ? deadlineDate < new Date() : false;

  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-slate-400 text-sm">Job</span>
            <h3 className="text-xl font-bold text-slate-200">{job.title}</h3>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm border ${statusColors[job.status]}`}
          >
            {job.status}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-400">Budget</span>
            <span className="text-slate-200 font-mono">
              {job.budget} {job.token}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Proposals</span>
            <span className="text-slate-200">{job.proposals.length}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Poster</span>
            <span className="text-indigo-400">
              {job.posterUsername || truncateAddress(job.posterAddress)}
            </span>
          </div>

          {job.deadline && (
            <div className="flex justify-between">
              <span className="text-slate-400">Deadline</span>
              <span className={`${isExpired ? "text-red-400" : "text-slate-200"}`}>
                {deadlineDate?.toLocaleDateString()}
              </span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-700">
            <span className="text-slate-400 text-sm">Requirements</span>
            <p className="text-slate-300 text-sm line-clamp-2 mt-1">
              {job.requirements}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
