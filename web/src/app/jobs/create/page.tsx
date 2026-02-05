"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Job } from "@/lib/jobs";

type PaymentToken = "ETH" | "MOLT";

export default function CreateJobPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [title, setTitle] = useState("");
  const [requirements, setRequirements] = useState("");
  const [budget, setBudget] = useState("");
  const [token, setToken] = useState<PaymentToken>("ETH");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moltbookStatus, setMoltbookStatus] = useState<"idle" | "posting" | "posted" | "failed">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!address) {
      alert("Please connect your wallet to post a job.");
      setIsSubmitting(false);
      return;
    }
    if (!title || !requirements || !budget || !token) {
      alert("Please fill in all required fields.");
      setIsSubmitting(false);
      return;
    }
    if (parseFloat(budget) <= 0) {
        alert("Budget must be greater than 0.");
        setIsSubmitting(false);
        return;
    }

    try {
      const message = `Themis: create job`;
      const signature = await signMessageAsync({ message });

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterAddress: address,
          posterUsername: null, // TODO: Get username from user profile if available
          title,
          requirements,
          budget: parseFloat(budget),
          token,
          deadline: deadline || null,
          signature,
        }),
      });

      if (res.ok) {
        const { job }: { job: Job } = await res.json();

        // Post to Moltbook (non-blocking, failures will be queued)
        setMoltbookStatus("posting");
        fetch("/api/moltbook/job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jobId: job.id,
                posterUsername: job.posterUsername,
                title: job.title,
                requirements: job.requirements,
                budget: job.budget,
                token: job.token,
            }),
        })
        .then(async (moltbookRes) => {
            if (moltbookRes.ok) {
                const moltbookData = await moltbookRes.json();
                console.log("Posted to Moltbook, post ID:", moltbookData.postId);
                setMoltbookStatus("posted");
            } else {
                console.log("Moltbook posting queued for retry");
                setMoltbookStatus("failed");
            }
        })
        .catch((moltbookError) => {
            console.error("Failed to post job to Moltbook:", moltbookError);
            setMoltbookStatus("failed");
        });

        // Don't wait for Moltbook - redirect immediately
        alert("Job posted successfully!");
        router.push(`/jobs/${job.id}`);
      } else {
        const errorData = await res.json();
        alert(`Failed to post job: ${errorData.error}`);
      }
    } catch (error: any) {
      alert(`Error posting job: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center bg-gray-800/50 border border-gray-700 rounded-lg p-12">
          <h1 className="text-2xl font-bold mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">
            Connect your wallet to post a job
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">Post a New Job</h1>
      <p className="text-gray-400 mb-8">
        Describe the work you need done and your budget.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-2">
            Job Title
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Design a new company logo"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="requirements" className="block text-sm font-medium text-gray-300 mb-2">
            Requirements (text or IPFS CID)
          </label>
          <textarea
            id="requirements"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="Detailed description of the task, what you expect, and any deliverables (e.g., 'ipfs://Qm...')"
            rows={6}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Budget ({token})
          </label>
          <input
            type="number"
            step="0.001"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="0.5"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        {/* Token selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Payment Token
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setToken("ETH")}
              className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                token === "ETH"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              <div className="font-semibold">ETH</div>
            </button>
            <button
              type="button"
              onClick={() => setToken("MOLT")}
              className={`flex-1 py-3 px-4 rounded-lg border transition-colors ${
                token === "MOLT"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              <div className="font-semibold">MOLT</div>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="deadline" className="block text-sm font-medium text-gray-300 mb-2">
            Optional Deadline
          </label>
          <input
            type="datetime-local"
            id="deadline"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
          <p className="text-gray-500 text-sm mt-1">
            If left blank, the job will not have a specific deadline.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Posting Job..." : "Post Job"}
        </button>

        {moltbookStatus === "posting" && <p className="text-center text-gray-400">Posting to Moltbook...</p>}
        {moltbookStatus === "posted" && <p className="text-center text-green-400">Job posted to Moltbook!</p>}
        {moltbookStatus === "failed" && <p className="text-center text-red-400">Failed to post job to Moltbook.</p>}
      </form>
    </div>
  );
}
