import { JoinFlow } from "../_components/join-flow";

export default async function JoinWithCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <JoinFlow initialCode={code} />;
}
