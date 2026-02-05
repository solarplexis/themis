import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createJob, getAllJobs, JobStatus } from "@/lib/jobs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as JobStatus | null;
    const posterAddress = searchParams.get("poster");

    let jobs = await getAllJobs();

    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }
    if (posterAddress) {
      jobs = jobs.filter(
        (job) => job.posterAddress.toLowerCase() === posterAddress.toLowerCase()
      );
    }

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error(`[API] Get jobs error:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to get jobs: ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: {
    posterAddress: string;
    posterUsername: string | null;
    title: string;
    requirements: string;
    budget: number;
    token: string;
    deadline: string | null;
    signature: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    posterAddress,
    posterUsername,
    title,
    requirements,
    budget,
    token,
    deadline,
    signature,
  } = body;

  if (
    !posterAddress ||
    !title ||
    !requirements ||
    !budget ||
    !token ||
    !signature
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    const message = "Themis: create job";
    const sigHex = signature as `0x${string}`;

    const isValid = await verifyMessage({
      address: posterAddress as `0x${string}`,
      message,
      signature: sigHex,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 403 }
      );
    }

    const job = await createJob({
      posterAddress,
      posterUsername,
      title,
      requirements,
      budget,
      token,
      deadline,
    });

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error(`[API] Create job error:`, error);
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: `Failed to create job: ${msg}` },
      { status: 500 }
    );
  }
}
