import { Suspense, type ReactNode } from "react";
import { Loading } from "./Loading";

/** クエリ（?store= など）を読む画面を包む。静的書き出しで必要。 */
export default function ClientPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
