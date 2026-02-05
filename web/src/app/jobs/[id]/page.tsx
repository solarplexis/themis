"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { useJob } from "@/hooks/useJobs";
import { Job, Proposal } from "@/lib/jobs";
import { getArbitrator } from "@/lib/contract";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { job, isLoading, isError } = useJob(id);
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [bidAmount, setBidAmount] = useState("");
  const [pitch, setPitch] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  if (isLoading) return <div>Loading job details...</div>;
  if (isError || !job) return <div>Error loading job or job not found.</div>;

  const isPoster = address?.toLowerCase() === job.posterAddress.toLowerCase();

  const handleCancelJob = async () => {
    if (!confirm("Are you sure you want to cancel this job?")) return;

    try {
      const message = `Themis: cancel job ${job.id}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerAddress: address, signature }),
      });

      if (res.ok) {
        alert("Job cancelled successfully!");
        router.push("/jobs");
      } else {
        const errorData = await res.json();
        alert(`Failed to cancel job: ${errorData.error}`);
      }
    } catch (error: any) {
      alert(`Error cancelling job: ${error.message}`);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingProposal(true);

    if (!address) {
      alert("Please connect your wallet to submit a proposal.");
      setIsSubmittingProposal(false);
      return;
    }
    if (parseFloat(bidAmount) <= 0) {
      alert("Bid amount must be greater than 0.");
      setIsSubmittingProposal(false);
      return;
    }
    if (parseFloat(bidAmount) > job.budget) {
      alert("Bid amount cannot exceed job budget.");
      setIsSubmittingProposal(false);
      return;
    }

    try {
      const message = `Themis: propose on job ${job.id}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`/api/jobs/${job.id}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerAddress: address,
          providerUsername: null, // TODO: Get username from user profile if available
          bidAmount: parseFloat(bidAmount),
          token: job.token,
          pitch,
          estimatedDelivery,
          signature,
        }),
      });

      if (res.ok) {
        alert("Proposal submitted successfully!");
        setBidAmount("");
        setPitch("");
        setEstimatedDelivery("");
        router.refresh(); // Refresh data
      } else {
        const errorData = await res.json();
        alert(`Failed to submit proposal: ${errorData.error}`);
      }
    } catch (error: any) {
      alert(`Error submitting proposal: ${error.message}`);
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleAcceptProposal = async (proposalId: string) => {
    if (!confirm("Are you sure you want to accept this proposal?")) return;

    try {
      const message = `Themis: accept proposal on job ${job.id}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`/api/jobs/${job.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, signerAddress: address, signature }),
      });

      if (res.ok) {
        alert("Proposal accepted!");
        router.refresh(); // Refresh data
      } else {
        const errorData = await res.json();
        alert(`Failed to accept proposal: ${errorData.error}`);
      }
    } catch (error: any) {
      alert(`Error accepting proposal: ${error.message}`);
    }
  };

  const handleCreateEscrow = (proposal: Proposal) => {
    router.push(
      `/create?provider=${proposal.providerAddress}&amount=${proposal.bidAmount}&token=${proposal.token}&requirements=${encodeURIComponent(job.requirements)}&jobId=${job.id}`
    );
  };

  const acceptedProposal = job.acceptedProposalId
    ? job.proposals.find(p => p.id === job.acceptedProposalId)
    : null;

  const deadlineDate = job.deadline ? new Date(job.deadline) : null;
  const isExpired = deadlineDate ? deadlineDate < new Date() : false;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-200">{job.title}</h1>
            <p className="text-slate-400 mt-1">
              Posted by {job.posterUsername || truncateAddress(job.posterAddress)}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-sm border ${
              job.status === "open"
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                : job.status === "accepted"
                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                : job.status === "funded"
                ? "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-slate-500/20 text-slate-400 border-slate-500/30"
            }`}
          >
            {job.status}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-300">Requirements</h2>
            <p className="text-slate-200 mt-2 whitespace-pre-wrap">{job.requirements}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400">Budget</span>
              <p className="text-slate-200 font-mono text-lg">{job.budget} {job.token}</p>
            </div>
            {job.deadline && (
              <div>
                <span className="text-slate-400">Deadline</span>
                <p className={`${isExpired ? "text-red-400" : "text-slate-200"} text-lg`}>
                  {deadlineDate?.toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {isPoster && job.status === "open" && (
          <button
            onClick={handleCancelJob}
            className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Cancel Job
          </button>
        )}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-100 mb-4">Proposals ({job.proposals.length})</h2>
        {job.proposals.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center text-slate-400">
            No proposals yet.
          </div>
        ) : (
          <div className="space-y-4">
            {job.proposals
              .sort((a, b) => b.submittedAt - a.submittedAt)
              .map((proposal) => (
                <div
                  key={proposal.id}
                  className={`bg-slate-800 border rounded-lg p-4 ${
                    proposal.status === "accepted"
                      ? "border-green-500 shadow-lg"
                      : "border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-slate-300 font-semibold">
                      {proposal.providerUsername || truncateAddress(proposal.providerAddress)}
                    </p>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        proposal.status === "accepted"
                          ? "bg-green-500/20 text-green-400"
                          : proposal.status === "rejected"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {proposal.status}
                    </span>
                  </div>
                  <p className="text-slate-200 mb-2">{proposal.pitch}</p>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>
                      Bid: {proposal.bidAmount} {proposal.token}
                    </span>
                    <span>
                      Delivery: {proposal.estimatedDelivery || "N/A"}
                    </span>
                  </div>
                  {isPoster && job.status === "open" && proposal.status === "pending" && (
                    <button
                      onClick={() => handleAcceptProposal(proposal.id)}
                      className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      Accept Proposal
                    </button>
                  )}
                  {isPoster && job.status === "accepted" && acceptedProposal?.id === proposal.id && (
                    <button
                      onClick={() => handleCreateEscrow(proposal)}
                      className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      Create Escrow
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {!isPoster && job.status === "open" && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-slate-100 mb-4">Submit a Proposal</h2>
          <form onSubmit={handleSubmitProposal} className="space-y-4">
            <div>
              <label htmlFor="bidAmount" className="block text-slate-300 text-sm font-bold mb-2">
                Your Bid ({job.token})
              </label>
              <input
                type="number"
                id="bidAmount"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                min="0.000001"
                step="any"
                className="shadow appearance-none border rounded w-full py-2 px-3 text-slate-200 leading-tight focus:outline-none focus:shadow-outline bg-slate-900 border-slate-700"
                required
              />
            </div>
            <div>
              <label htmlFor="pitch" className="block text-slate-300 text-sm font-bold mb-2">
                Your Pitch
              </label>
              <textarea
                id="pitch"
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                rows={4}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-slate-200 leading-tight focus:outline-none focus:shadow-outline bg-slate-900 border-slate-700"
                required
              ></textarea>
            </div>
            <div>
              <label htmlFor="estimatedDelivery" className="block text-slate-300 text-sm font-bold mb-2">
                Estimated Delivery (e.g., "3 days", "1 week")
              </label>
              <input
                type="text"
                id="estimatedDelivery"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-slate-200 leading-tight focus:outline-none focus:shadow-outline bg-slate-900 border-slate-700"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingProposal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmittingProposal ? "Submitting..." : "Submit Proposal"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
