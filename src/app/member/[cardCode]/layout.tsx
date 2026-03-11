import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cardCode: string }>;
}): Promise<Metadata> {
  const { cardCode } = await params;
  const encodedCardCode = encodeURIComponent(cardCode);

  return {
    manifest: `/api/manifest/${encodedCardCode}`,
    appleWebApp: {
      title: "Dalida Dance",
    },
  };
}

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
