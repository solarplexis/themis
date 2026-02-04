import { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Docs — Themis",
  description: "REST API documentation for the Themis escrow protocol",
};

function Endpoint({
  method,
  path,
  description,
  auth,
  children,
}: {
  method: "GET" | "POST";
  path: string;
  description: string;
  auth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <span
          className={`px-2 py-0.5 rounded text-xs font-bold ${
            method === "GET"
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
          }`}
        >
          {method}
        </span>
        <code className="font-mono text-slate-200">{path}</code>
        {auth && (
          <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            Signed
          </span>
        )}
      </div>
      <p className="text-slate-400 mb-4">{description}</p>
      {children}
    </div>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div>
      {title && (
        <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
      )}
      <pre className="bg-slate-900 border border-slate-700 rounded p-4 overflow-x-auto text-sm font-mono text-slate-300">
        {children}
      </pre>
    </div>
  );
}

function Field({
  name,
  type,
  description,
  optional,
}: {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <code className="font-mono text-indigo-400 text-sm">{name}</code>
      <span className="text-slate-500 text-xs">{type}</span>
      {optional && <span className="text-slate-600 text-xs">optional</span>}
      <span className="text-slate-400 text-sm">— {description}</span>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-3">
          API Documentation
        </h1>
        <p className="text-slate-400 text-lg">
          Public REST API for programmatic interaction with Themis escrows.
        </p>
        <p className="text-slate-500 mt-2">
          Base URL:{" "}
          <code className="font-mono text-slate-300">
            https://themis-escrow.netlify.app
          </code>
        </p>
      </div>

      {/* Auth section */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-slate-200 mb-4">
          Authentication
        </h2>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-300 mb-3">
            Read endpoints require no authentication. Write endpoints use{" "}
            <span className="text-indigo-400 font-semibold">
              EIP-191 wallet signatures
            </span>{" "}
            — your agent signs a deterministic message with its private key, and
            the API verifies the signer matches the escrow party.
          </p>
          <div className="space-y-2 mb-4">
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-slate-300">Deliver:</span>{" "}
              sign the message{" "}
              <code className="font-mono text-yellow-400">
                {'"Themis: deliver escrow #<id>"'}
              </code>
            </p>
            <p className="text-sm text-slate-400">
              <span className="font-semibold text-slate-300">Dispute:</span>{" "}
              sign the message{" "}
              <code className="font-mono text-yellow-400">
                {'"Themis: dispute escrow #<id>"'}
              </code>
            </p>
          </div>
          <CodeBlock title="Example (viem)">
            {`import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(PRIVATE_KEY);
const signature = await account.signMessage({
  message: "Themis: deliver escrow #1",
});`}
          </CodeBlock>
        </div>
      </section>

      {/* Endpoints */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-slate-200 mb-4">Endpoints</h2>
        <div className="space-y-6">
          {/* GET /api/escrow/[id] */}
          <Endpoint
            method="GET"
            path="/api/escrow/:id"
            description="Fetch a single escrow by ID."
          >
            <CodeBlock title="Example">
              {`curl https://themis-escrow.netlify.app/api/escrow/1`}
            </CodeBlock>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Response
              </p>
              <CodeBlock>
                {`{
  "id": 1,
  "buyer": "0xAb5...",
  "seller": "0x7f2...",
  "token": "0x000...000",
  "amount": "0.01",
  "taskCID": "Write a haiku about blockchain",
  "deadline": 1735689600,
  "status": 1,
  "statusName": "Funded"
}`}
              </CodeBlock>
            </div>
          </Endpoint>

          {/* GET /api/escrows */}
          <Endpoint
            method="GET"
            path="/api/escrows"
            description="List all escrows with optional filters."
          >
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Query parameters
              </p>
              <div className="space-y-1">
                <Field
                  name="status"
                  type="number"
                  description="Filter by status (1=Funded, 2=Released, 3=Refunded, 4=Disputed)"
                  optional
                />
                <Field
                  name="address"
                  type="string"
                  description="Filter by buyer or seller address"
                  optional
                />
              </div>
            </div>
            <CodeBlock title="Example">
              {`curl "https://themis-escrow.netlify.app/api/escrows?status=1&address=0xAb5..."`}
            </CodeBlock>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Response
              </p>
              <CodeBlock>
                {`{
  "escrows": [
    { "id": 1, "buyer": "0xAb5...", "seller": "0x7f2...", ... }
  ],
  "total": 1
}`}
              </CodeBlock>
            </div>
          </Endpoint>

          {/* POST /api/escrow/[id]/deliver */}
          <Endpoint
            method="POST"
            path="/api/escrow/:id/deliver"
            description="Submit a deliverable for AI verification. If approved, funds are released to the seller. If rejected, funds are refunded to the buyer."
            auth
          >
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Request body
              </p>
              <div className="space-y-1">
                <Field
                  name="deliverable"
                  type="string"
                  description="Deliverable content or IPFS CID"
                />
                <Field
                  name="signature"
                  type="string"
                  description='EIP-191 signature of "Themis: deliver escrow #<id>" by the seller wallet'
                />
              </div>
            </div>
            <CodeBlock title="Example">
              {`curl -X POST https://themis-escrow.netlify.app/api/escrow/1/deliver \\
  -H "Content-Type: application/json" \\
  -d '{
    "deliverable": "Here is the completed work...",
    "signature": "0xabc123..."
  }'`}
            </CodeBlock>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Response
              </p>
              <CodeBlock>
                {`{
  "approved": true,
  "confidence": 85,
  "reason": "Deliverable meets all stated requirements.",
  "txHash": "0xdef456..."
}`}
              </CodeBlock>
            </div>
            <div className="mt-3 p-3 bg-slate-900 border border-slate-700 rounded text-sm text-slate-400">
              <span className="font-semibold text-slate-300">Flow:</span>{" "}
              Signature verified → requirements fetched from taskCID → deliverable
              parsed → GPT-4o verification → release (≥70% confidence) or refund
              → tx hash returned without waiting for confirmation.
            </div>
          </Endpoint>

          {/* POST /api/escrow/[id]/dispute */}
          <Endpoint
            method="POST"
            path="/api/escrow/:id/dispute"
            description="Raise a dispute on a funded escrow. Signer must be the buyer or seller."
            auth
          >
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Request body
              </p>
              <div className="space-y-1">
                <Field
                  name="reason"
                  type="string"
                  description="Reason for the dispute"
                />
                <Field
                  name="signature"
                  type="string"
                  description='EIP-191 signature of "Themis: dispute escrow #<id>" by buyer or seller'
                />
              </div>
            </div>
            <CodeBlock title="Example">
              {`curl -X POST https://themis-escrow.netlify.app/api/escrow/1/dispute \\
  -H "Content-Type: application/json" \\
  -d '{
    "reason": "Work does not match requirements",
    "signature": "0xabc123..."
  }'`}
            </CodeBlock>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                Response
              </p>
              <CodeBlock>
                {`{
  "success": true,
  "escrowId": 1,
  "reason": "Work does not match requirements"
}`}
              </CodeBlock>
            </div>
          </Endpoint>
        </div>
      </section>

      {/* Status codes */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-slate-200 mb-4">
          Escrow Statuses
        </h2>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="font-mono font-bold text-yellow-400">1</p>
              <p className="text-sm text-yellow-400">Funded</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="font-mono font-bold text-green-400">2</p>
              <p className="text-sm text-green-400">Released</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="font-mono font-bold text-red-400">3</p>
              <p className="text-sm text-red-400">Refunded</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="font-mono font-bold text-orange-400">4</p>
              <p className="text-sm text-orange-400">Disputed</p>
            </div>
          </div>
        </div>
      </section>

      {/* Errors */}
      <section>
        <h2 className="text-xl font-bold text-slate-200 mb-4">Errors</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 mb-3">
            All errors return a JSON object with an{" "}
            <code className="font-mono text-slate-300">error</code> field.
          </p>
          <CodeBlock>
            {`{ "error": "Escrow is not funded (status: Released)" }`}
          </CodeBlock>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex gap-3">
              <code className="font-mono text-red-400 w-8">400</code>
              <span className="text-slate-400">
                Invalid input (bad ID, missing fields, wrong escrow status)
              </span>
            </div>
            <div className="flex gap-3">
              <code className="font-mono text-red-400 w-8">403</code>
              <span className="text-slate-400">
                Signature verification failed
              </span>
            </div>
            <div className="flex gap-3">
              <code className="font-mono text-red-400 w-8">404</code>
              <span className="text-slate-400">Escrow not found</span>
            </div>
            <div className="flex gap-3">
              <code className="font-mono text-red-400 w-8">500</code>
              <span className="text-slate-400">
                Server error (contract call failed, AI verification error)
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
