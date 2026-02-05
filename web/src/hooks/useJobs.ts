"use client";

import useSWR from "swr";
import { Job, JobStatus } from "@/lib/jobs";

// Define a fetcher function for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface UseAllJobsResponse {
  jobs: Job[];
  isLoading: boolean;
  isError: any;
}

export function useAllJobs(status?: JobStatus): UseAllJobsResponse {
  const { data, error } = useSWR(
    `/api/jobs${status ? `?status=${status}` : ""}`,
    fetcher
  );

  return {
    jobs: data?.jobs || [],
    isLoading: !error && !data,
    isError: error,
  };
}

interface UseJobResponse {
  job: Job | null;
  isLoading: boolean;
  isError: any;
}

export function useJob(jobId: string): UseJobResponse {
  const { data, error } = useSWR(`/api/jobs/${jobId}`, fetcher);

  return {
    job: data?.job || null,
    isLoading: !error && !data,
    isError: error,
  };
}
